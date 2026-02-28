/**
 * Module Management Service
 * 
 * Handles checking module availability for customers based on their
 * subscription plan and individual overrides.
 */

import prisma from '../lib/prisma.js';

/**
 * Helper to execute raw SQL queries safely
 */
async function queryRaw(sql, ...params) {
  try {
    const results = params.length > 0 
      ? await prisma.$queryRawUnsafe(sql, ...params)
      : await prisma.$queryRawUnsafe(sql);
    const converted = JSON.parse(JSON.stringify(results, (key, value) =>
      typeof value === 'bigint' ? Number(value) : value
    ));
    return Array.isArray(converted) ? converted : [];
  } catch (error) {
    console.error('Query error:', error);
    throw error;
  }
}

async function executeRaw(sql, ...params) {
  return await prisma.$executeRawUnsafe(sql, ...params);
}

/**
 * Check if a customer has access to a specific module
 * 
 * Priority order:
 * 1. Customer-specific override (if override_plan = true)
 * 2. Subscription plan module
 * 3. Module default_enabled setting
 * 
 * @param {number} customerId - Customer ID
 * @param {string} moduleName - Module name (e.g., 'ShipStation Integration', 'WooCommerce API')
 * @returns {Promise<{enabled: boolean, config: object|null}>}
 */
export async function hasModuleAccess(customerId, moduleName) {
  // Get module info
  const [module] = await queryRaw(`
    SELECT id, default_enabled, config_schema
    FROM modules
    WHERE name = ?
  `, moduleName);

  if (!module) {
    throw new Error(`Module '${moduleName}' not found`);
  }

  // Check for customer-specific override
  const [customerModule] = await queryRaw(`
    SELECT is_enabled, config, override_plan
    FROM customer_modules
    WHERE customer_id = ? AND module_id = ?
  `, customerId, module.id);

  if (customerModule && customerModule.override_plan) {
    return {
      enabled: customerModule.is_enabled,
      config: customerModule.config
    };
  }

  // Get customer's active subscription
  const [subscription] = await queryRaw(`
    SELECT cs.plan_id
    FROM customer_subscriptions cs
    WHERE cs.customer_id = ?
    AND cs.status IN ('active', 'trialing')
    ORDER BY cs.created_at DESC
    LIMIT 1
  `, customerId);

  if (!subscription) {
    // No active subscription - use module default
    return {
      enabled: module.default_enabled,
      config: null
    };
  }

  // Check plan module availability
  const [planModule] = await queryRaw(`
    SELECT is_enabled, config
    FROM plan_modules
    WHERE plan_id = ? AND module_id = ?
  `, subscription.plan_id, module.id);

  if (planModule) {
    return {
      enabled: planModule.is_enabled,
      config: planModule.config
    };
  }

  // Fall back to module default
  return {
    enabled: module.default_enabled,
    config: null
  };
}

/**
 * Get all modules available to a customer
 * 
 * @param {number} customerId - Customer ID
 * @returns {Promise<Array>} List of modules with availability status
 */
export async function getCustomerModules(customerId) {
  // Get customer's active subscription
  const [subscription] = await queryRaw(`
    SELECT cs.plan_id, sp.name as plan_name
    FROM customer_subscriptions cs
    JOIN subscription_plans sp ON cs.plan_id = sp.id
    WHERE cs.customer_id = ?
    AND cs.status IN ('active', 'trialing')
    ORDER BY cs.created_at DESC
    LIMIT 1
  `, customerId);

  // Get all modules
  const modules = await queryRaw(`
    SELECT 
      m.id,
      m.name,
      m.description,
      m.category,
      m.icon,
      m.requires_config,
      m.default_enabled
    FROM modules m
    ORDER BY m.category, m.name
  `);

  // For each module, determine availability
  const modulesWithAccess = await Promise.all(modules.map(async (module) => {
    const access = await hasModuleAccess(customerId, module.name);
    
    return {
      ...module,
      enabled: access.enabled,
      config: access.config,
      source: subscription ? 'plan' : 'default'
    };
  }));

  return {
    subscription: subscription ? {
      plan_id: subscription.plan_id,
      plan_name: subscription.plan_name
    } : null,
    modules: modulesWithAccess
  };
}

/**
 * Enable a module for a specific customer (override)
 * 
 * @param {number} customerId - Customer ID
 * @param {string} moduleName - Module name
 * @param {object} config - Optional module configuration
 * @param {boolean} overridePlan - Whether to override plan settings
 */
export async function enableModuleForCustomer(customerId, moduleName, config = null, overridePlan = true) {
  const [module] = await queryRaw(`
    SELECT id FROM modules WHERE name = ?
  `, moduleName);

  if (!module) {
    throw new Error(`Module '${moduleName}' not found`);
  }

  await executeRaw(`
    INSERT INTO customer_modules (customer_id, module_id, is_enabled, config, override_plan)
    VALUES (?, ?, true, ?, ?)
    ON DUPLICATE KEY UPDATE
      is_enabled = true,
      config = VALUES(config),
      override_plan = VALUES(override_plan),
      updated_at = CURRENT_TIMESTAMP
  `, customerId, module.id, JSON.stringify(config), overridePlan);

  return { success: true };
}

/**
 * Disable a module for a specific customer (override)
 * 
 * @param {number} customerId - Customer ID
 * @param {string} moduleName - Module name
 * @param {boolean} overridePlan - Whether to override plan settings
 */
export async function disableModuleForCustomer(customerId, moduleName, overridePlan = true) {
  const [module] = await queryRaw(`
    SELECT id FROM modules WHERE name = ?
  `, moduleName);

  if (!module) {
    throw new Error(`Module '${moduleName}' not found`);
  }

  await executeRaw(`
    INSERT INTO customer_modules (customer_id, module_id, is_enabled, override_plan)
    VALUES (?, ?, false, ?)
    ON DUPLICATE KEY UPDATE
      is_enabled = false,
      override_plan = VALUES(override_plan),
      updated_at = CURRENT_TIMESTAMP
  `, customerId, module.id, overridePlan);

  return { success: true };
}

/**
 * Remove customer-specific override (revert to plan settings)
 * 
 * @param {number} customerId - Customer ID
 * @param {string} moduleName - Module name
 */
export async function removeCustomerModuleOverride(customerId, moduleName) {
  const [module] = await queryRaw(`
    SELECT id FROM modules WHERE name = ?
  `, moduleName);

  if (!module) {
    throw new Error(`Module '${moduleName}' not found`);
  }

  await executeRaw(`
    DELETE FROM customer_modules
    WHERE customer_id = ? AND module_id = ?
  `, customerId, module.id);

  return { success: true };
}

/**
 * Set modules for a subscription plan
 * 
 * @param {number} planId - Subscription plan ID
 * @param {Array} modules - Array of {name, enabled, config}
 */
export async function setPlanModules(planId, modules) {
  for (const moduleData of modules) {
    const [module] = await queryRaw(`
      SELECT id FROM modules WHERE name = ?
    `, moduleData.name);

    if (!module) {
      console.warn(`Module '${moduleData.name}' not found, skipping`);
      continue;
    }

    await executeRaw(`
      INSERT INTO plan_modules (plan_id, module_id, is_enabled, config)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        is_enabled = VALUES(is_enabled),
        config = VALUES(config),
        updated_at = CURRENT_TIMESTAMP
    `, planId, module.id, moduleData.enabled, JSON.stringify(moduleData.config || null));
  }

  return { success: true };
}

/**
 * Get all modules for a subscription plan
 * 
 * @param {number} planId - Subscription plan ID
 * @returns {Promise<Array>} List of modules with plan settings
 */
export async function getPlanModules(planId) {
  const modules = await queryRaw(`
    SELECT 
      m.id,
      m.name,
      m.slug,
      m.description,
      m.category,
      m.icon,
      m.requires_config,
      m.default_enabled,
      pm.is_enabled as plan_enabled,
      pm.config as plan_config
    FROM modules m
    LEFT JOIN plan_modules pm ON m.id = pm.module_id AND pm.plan_id = ?
    ORDER BY m.category, m.name
  `, planId);

  return modules.map(module => ({
    ...module,
    enabled: module.plan_enabled !== null ? module.plan_enabled : module.default_enabled,
    config: module.plan_config,
    source: module.plan_enabled !== null ? 'plan' : 'default'
  }));
}

/**
 * Track module usage for analytics/billing
 * 
 * @param {number} customerId - Customer ID
 * @param {string} moduleName - Module name
 * @param {string} usageType - Type of usage (e.g., 'api_call', 'export', 'sync')
 * @param {number} count - Usage count
 * @param {object} metadata - Additional metadata
 */
export async function trackModuleUsage(customerId, moduleName, usageType, count = 1, metadata = null) {
  const [module] = await queryRaw(`
    SELECT id FROM modules WHERE name = ?
  `, moduleName);

  if (!module) {
    console.warn(`Module '${moduleName}' not found, usage not tracked`);
    return;
  }

  await executeRaw(`
    INSERT INTO module_usage (customer_id, module_id, usage_type, usage_count, metadata)
    VALUES (?, ?, ?, ?, ?)
  `, customerId, module.id, usageType, count, JSON.stringify(metadata));
}

/**
 * Get module usage statistics for a customer
 * 
 * @param {number} customerId - Customer ID
 * @param {string} moduleName - Optional module name filter
 * @param {Date} startDate - Optional start date
 * @param {Date} endDate - Optional end date
 * @returns {Promise<Array>} Usage statistics
 */
export async function getModuleUsage(customerId, moduleName = null, startDate = null, endDate = null) {
  let sql = `
    SELECT 
      m.name as module_name,
      mu.usage_type,
      SUM(mu.usage_count) as total_usage,
      COUNT(*) as event_count,
      MIN(mu.created_at) as first_used,
      MAX(mu.created_at) as last_used
    FROM module_usage mu
    JOIN modules m ON mu.module_id = m.id
    WHERE mu.customer_id = ?
  `;
  
  const params = [customerId];

  if (moduleName) {
    sql += ` AND m.name = ?`;
    params.push(moduleName);
  }

  if (startDate) {
    sql += ` AND mu.created_at >= ?`;
    params.push(startDate);
  }

  if (endDate) {
    sql += ` AND mu.created_at <= ?`;
    params.push(endDate);
  }

  sql += ` GROUP BY m.id, mu.usage_type ORDER BY total_usage DESC`;

  return await queryRaw(sql, ...params);
}

export default {
  hasModuleAccess,
  getCustomerModules,
  enableModuleForCustomer,
  disableModuleForCustomer,
  removeCustomerModuleOverride,
  setPlanModules,
  getPlanModules,
  trackModuleUsage,
  getModuleUsage
};
