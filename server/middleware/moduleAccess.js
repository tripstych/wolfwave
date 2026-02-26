/**
 * Module Access Middleware
 * 
 * Middleware to check if a customer has access to specific modules
 * before allowing access to protected routes.
 */

import { hasModuleAccess } from '../services/moduleManager.js';

/**
 * Create middleware to require a specific module
 * 
 * Usage:
 *   router.get('/endpoint', requireModule('shipstation'), handler);
 * 
 * @param {string} moduleSlug - Module slug to check
 * @param {object} options - Options
 * @param {boolean} options.checkConfig - Whether to require module config
 * @returns {Function} Express middleware
 */
export function requireModule(moduleSlug, options = {}) {
  return async (req, res, next) => {
    try {
      const customerId = req.user?.customer_id || req.user?.id;
      
      if (!customerId) {
        return res.status(401).json({ 
          error: 'Authentication required',
          module: moduleSlug 
        });
      }

      const access = await hasModuleAccess(customerId, moduleSlug);

      if (!access.enabled) {
        return res.status(403).json({ 
          error: `Access denied: Module '${moduleSlug}' is not enabled for your account`,
          module: moduleSlug,
          upgrade_required: true
        });
      }

      if (options.checkConfig && !access.config) {
        return res.status(403).json({ 
          error: `Module '${moduleSlug}' requires configuration`,
          module: moduleSlug,
          config_required: true
        });
      }

      // Attach module config to request for use in handlers
      req.moduleConfig = access.config;
      req.moduleSlug = moduleSlug;

      next();
    } catch (error) {
      console.error(`Module access check failed for '${moduleSlug}':`, error);
      res.status(500).json({ 
        error: 'Failed to verify module access',
        details: error.message 
      });
    }
  };
}

/**
 * Middleware to check if any of the specified modules is enabled
 * 
 * Usage:
 *   router.get('/endpoint', requireAnyModule(['shipstation', 'woocommerce']), handler);
 * 
 * @param {Array<string>} moduleSlugs - Array of module slugs
 * @returns {Function} Express middleware
 */
export function requireAnyModule(moduleSlugs) {
  return async (req, res, next) => {
    try {
      const customerId = req.user?.customer_id || req.user?.id;
      
      if (!customerId) {
        return res.status(401).json({ 
          error: 'Authentication required',
          modules: moduleSlugs 
        });
      }

      // Check each module
      const accessChecks = await Promise.all(
        moduleSlugs.map(slug => hasModuleAccess(customerId, slug))
      );

      // Find first enabled module
      const enabledIndex = accessChecks.findIndex(access => access.enabled);

      if (enabledIndex === -1) {
        return res.status(403).json({ 
          error: `Access denied: None of the required modules are enabled`,
          modules: moduleSlugs,
          upgrade_required: true
        });
      }

      // Attach the enabled module info
      req.moduleSlug = moduleSlugs[enabledIndex];
      req.moduleConfig = accessChecks[enabledIndex].config;

      next();
    } catch (error) {
      console.error('Module access check failed:', error);
      res.status(500).json({ 
        error: 'Failed to verify module access',
        details: error.message 
      });
    }
  };
}

/**
 * Middleware to attach module access info to request without blocking
 * 
 * Usage:
 *   router.get('/endpoint', attachModuleInfo('shipstation'), handler);
 * 
 * @param {string} moduleSlug - Module slug to check
 * @returns {Function} Express middleware
 */
export function attachModuleInfo(moduleSlug) {
  return async (req, res, next) => {
    try {
      const customerId = req.user?.customer_id || req.user?.id;
      
      if (customerId) {
        const access = await hasModuleAccess(customerId, moduleSlug);
        req.moduleAccess = {
          [moduleSlug]: {
            enabled: access.enabled,
            config: access.config
          }
        };
      }

      next();
    } catch (error) {
      console.error(`Failed to attach module info for '${moduleSlug}':`, error);
      // Don't block the request, just continue without module info
      next();
    }
  };
}

export default {
  requireModule,
  requireAnyModule,
  attachModuleInfo
};
