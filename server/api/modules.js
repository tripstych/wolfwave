/**
 * Module Management API
 * 
 * Endpoints for managing modules (features/integrations) per customer
 * and subscription plan.
 */

import express from 'express';
import {
  hasModuleAccess,
  getCustomerModules,
  enableModuleForCustomer,
  disableModuleForCustomer,
  removeCustomerModuleOverride,
  setPlanModules,
  getPlanModules,
  getModuleUsage
} from '../services/moduleManager.js';

const router = express.Router();

/**
 * GET /api/modules
 * Get all modules available to the current customer
 */
router.get('/', async (req, res) => {
  try {
    const customerId = req.user?.customer_id || req.user?.id;
    
    if (!customerId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const result = await getCustomerModules(customerId);
    res.json(result);
  } catch (error) {
    console.error('Error fetching customer modules:', error);
    res.status(500).json({ error: 'Failed to fetch modules', details: error.message });
  }
});

/**
 * GET /api/modules/:slug
 * Check if customer has access to a specific module
 */
router.get('/:slug', async (req, res) => {
  try {
    const customerId = req.user?.customer_id || req.user?.id;
    const { slug } = req.params;
    
    if (!customerId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const access = await hasModuleAccess(customerId, slug);
    res.json({ slug, ...access });
  } catch (error) {
    console.error('Error checking module access:', error);
    res.status(500).json({ error: 'Failed to check module access', details: error.message });
  }
});

/**
 * POST /api/modules/:slug/enable
 * Enable a module for the current customer (admin override)
 */
router.post('/:slug/enable', async (req, res) => {
  try {
    const customerId = req.user?.customer_id || req.user?.id;
    const { slug } = req.params;
    const { config, override_plan = true } = req.body;
    
    if (!customerId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Check if user has admin permissions
    if (!req.user?.is_admin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    await enableModuleForCustomer(customerId, slug, config, override_plan);
    res.json({ success: true, message: `Module '${slug}' enabled` });
  } catch (error) {
    console.error('Error enabling module:', error);
    res.status(500).json({ error: 'Failed to enable module', details: error.message });
  }
});

/**
 * POST /api/modules/:slug/disable
 * Disable a module for the current customer (admin override)
 */
router.post('/:slug/disable', async (req, res) => {
  try {
    const customerId = req.user?.customer_id || req.user?.id;
    const { slug } = req.params;
    const { override_plan = true } = req.body;
    
    if (!customerId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Check if user has admin permissions
    if (!req.user?.is_admin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    await disableModuleForCustomer(customerId, slug, override_plan);
    res.json({ success: true, message: `Module '${slug}' disabled` });
  } catch (error) {
    console.error('Error disabling module:', error);
    res.status(500).json({ error: 'Failed to disable module', details: error.message });
  }
});

/**
 * DELETE /api/modules/:slug/override
 * Remove customer-specific override (revert to plan settings)
 */
router.delete('/:slug/override', async (req, res) => {
  try {
    const customerId = req.user?.customer_id || req.user?.id;
    const { slug } = req.params;
    
    if (!customerId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Check if user has admin permissions
    if (!req.user?.is_admin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    await removeCustomerModuleOverride(customerId, slug);
    res.json({ success: true, message: `Override removed for module '${slug}'` });
  } catch (error) {
    console.error('Error removing module override:', error);
    res.status(500).json({ error: 'Failed to remove override', details: error.message });
  }
});

/**
 * GET /api/modules/usage/:slug?
 * Get module usage statistics
 */
router.get('/usage/:slug?', async (req, res) => {
  try {
    const customerId = req.user?.customer_id || req.user?.id;
    const { slug } = req.params;
    const { start_date, end_date } = req.query;
    
    if (!customerId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const startDate = start_date ? new Date(start_date) : null;
    const endDate = end_date ? new Date(end_date) : null;

    const usage = await getModuleUsage(customerId, slug, startDate, endDate);
    res.json({ usage });
  } catch (error) {
    console.error('Error fetching module usage:', error);
    res.status(500).json({ error: 'Failed to fetch usage', details: error.message });
  }
});

/**
 * GET /api/modules/plans/:planId
 * Get modules for a specific subscription plan (admin only)
 */
router.get('/plans/:planId', async (req, res) => {
  try {
    const { planId } = req.params;
    
    // Check if user has admin permissions
    if (!req.user?.is_admin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const modules = await getPlanModules(parseInt(planId));
    res.json({ modules });
  } catch (error) {
    console.error('Error fetching plan modules:', error);
    res.status(500).json({ error: 'Failed to fetch plan modules', details: error.message });
  }
});

/**
 * PUT /api/modules/plans/:planId
 * Set modules for a subscription plan (admin only)
 */
router.put('/plans/:planId', async (req, res) => {
  try {
    const { planId } = req.params;
    const { modules } = req.body;
    
    // Check if user has admin permissions
    if (!req.user?.is_admin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    if (!Array.isArray(modules)) {
      return res.status(400).json({ error: 'modules must be an array' });
    }

    await setPlanModules(parseInt(planId), modules);
    res.json({ success: true, message: 'Plan modules updated' });
  } catch (error) {
    console.error('Error updating plan modules:', error);
    res.status(500).json({ error: 'Failed to update plan modules', details: error.message });
  }
});

export default router;
