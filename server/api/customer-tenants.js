import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { query } from '../db/connection.js';
import { getPoolForDb } from '../lib/poolManager.js';
import { provisionTenant } from '../db/provisionTenant.js';
import { syncTemplatesToDb } from '../services/templateParser.js';
import { seedNewTenant } from '../services/tenantSeeder.js';
import { runWithTenant, getCurrentDbName } from '../lib/tenantContext.js';
import { generateImpersonationToken } from '../middleware/auth.js';
import { getTenantInfoByDb, getCustomerSubscriptionStats } from '../services/tenantService.js';
import { syncOverageToStripe } from './customer-subscriptions.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

/**
 * Middleware: require customer auth
 * Supports both customer_token (frontend) and standard token (admin)
 */
async function requireCustomer(req, res, next) {
  const primaryDb = process.env.DB_NAME || 'wolfwave_admin';
  
  return runWithTenant(primaryDb, async () => {
    const customerToken = req.cookies?.customer_token;
    const adminToken = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');

    // 1. Try Customer Token first (Standard path)
    if (customerToken) {
      try {
        const decoded = jwt.verify(customerToken, JWT_SECRET);
        if (decoded.id) {
          req.customer = decoded;
          return next();
        }
      } catch (err) { /* ignore and try admin token */ }
    }

    // 2. Try Admin Token (For when logged into Admin Panel)
    if (adminToken) {
      try {
        const decoded = jwt.verify(adminToken, JWT_SECRET);
        if (decoded.id) {
          // Find the customer record linked to this user or matching the email
          let customer = await prisma.customers.findFirst({
            where: { 
              OR: [
                { user_id: decoded.id },
                { email: decoded.email }
              ]
            }
          });

          // If found but not linked, link it now for next time
          if (customer && !customer.user_id) {
            await prisma.customers.update({
              where: { id: customer.id },
              data: { user_id: decoded.id }
            });
          }

          if (customer) {
            req.customer = {
              id: customer.id,
              email: customer.email,
              first_name: customer.first_name,
              last_name: customer.last_name
            };
            return next();
          } else {
            // User is a valid admin but has no customer record
            req.customer = null;
            return next();
          }
        }
      } catch (err) { /* invalid token */ }
    }

    if (customerToken) return res.status(401).json({ error: 'Invalid or expired token' });
    return res.status(401).json({ error: 'Authentication required' });
  });
}

/**
 * GET / — list current customer's tenants
 */
router.get('/', requireCustomer, async (req, res) => {
  const primaryDb = process.env.DB_NAME || 'wolfwave_admin';
  return runWithTenant(primaryDb, async () => {
    try {
      if (!req.customer) {
        return res.json([]);
      }
      const tenants = await prisma.tenants.findMany({
        where: { customer_id: req.customer.id },
        orderBy: { created_at: 'desc' }
      });
      res.json(tenants);
    } catch (err) {
      console.error('List customer tenants error:', err);
      res.status(500).json({ error: 'Failed to list sites' });
    }
  });
});

/**
 * GET /limits — check current site limits
 */
router.get('/limits', requireCustomer, async (req, res) => {
  const currentDb = getCurrentDbName();
  const primaryDb = process.env.DB_NAME || 'wolfwave_admin';
  
  try {
    let targetCustomerId = req.customer?.id;
    let isResellerChild = false;

    // If we are on a tenant site, we check the TENANT OWNER'S limits
    if (currentDb !== primaryDb) {
      const tenantInfo = await getTenantInfoByDb(currentDb);
      if (tenantInfo?.customer_id) {
        targetCustomerId = tenantInfo.customer_id;
        isResellerChild = true;
      }
    }

    if (!targetCustomerId) {
      return res.json({
        used: 0,
        limit: 0,
        plan_name: 'No active license',
        can_create: false,
        no_customer: true
      });
    }

    const stats = await getCustomerSubscriptionStats(targetCustomerId);
    
    if (!stats) return res.status(404).json({ error: 'License owner not found' });

    res.json({
      ...stats,
      is_reseller_pool: isResellerChild
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST / — provision a new tenant for the customer
 */
router.post('/', requireCustomer, async (req, res) => {
  const currentDb = getCurrentDbName();
  const primaryDb = process.env.DB_NAME || 'wolfwave_admin';
  
  try {
    const { name, subdomain } = req.body;
    if (!name || !subdomain) {
      return res.status(400).json({ error: 'Name and subdomain are required' });
    }

    let targetCustomerId = req.customer?.id;
    
    // 1. Resolve Ownership (Hierarchical)
    if (currentDb !== primaryDb) {
      const tenantInfo = await getTenantInfoByDb(currentDb);
      if (tenantInfo?.customer_id) {
        targetCustomerId = tenantInfo.customer_id;
      }
    }

    if (!targetCustomerId) {
      return res.status(403).json({ error: 'No active license found for this site.' });
    }

    // 2. Check limits against the target customer (Reseller or Self)
    const stats = await getCustomerSubscriptionStats(targetCustomerId);
    let isOverage = false;
    
    if (stats && !stats.can_create) {
      // SOFT LIMIT: Allow creation but flag as overage
      isOverage = true;
      console.log(`[OVERAGE] Customer ${targetCustomerId} is creating a site over their limit of ${stats.limit}.`);
    }

    return runWithTenant(primaryDb, async () => {
      // 3. Validate subdomain format
      if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(subdomain)) {
        return res.status(400).json({
          error: 'Subdomain must be lowercase alphanumeric with optional hyphens'
        });
      }

      // 4. Check globally if subdomain exists
      const existing = await prisma.tenants.findUnique({ where: { subdomain } });
      if (existing) {
        return res.status(409).json({ error: 'Subdomain already in use' });
      }

      // 5. Provision
      const customerRecord = await prisma.customers.findUnique({
        where: { id: req.customer.id },
        select: { password: true }
      });

      const dbName = await provisionTenant(subdomain, req.customer.email, customerRecord?.password || 'admin123', true);

      // 6. Register
      const tenant = await prisma.tenants.create({
        data: {
          name,
          subdomain,
          database_name: dbName,
          customer_id: targetCustomerId,
          status: 'active'
        }
      });

      // 7. Handle Overage Notification/Billing
      if (isOverage) {
        // TODO: Trigger email to reseller
        console.log(`[OVERAGE_BILLING] Customer ${targetCustomerId} is over limit. Syncing to Stripe.`);
      }

      // Sync to Stripe to ensure overage counts are updated
      syncOverageToStripe(targetCustomerId).catch(err => {
        console.error(`[OVERAGE_SYNC_FAIL] Target ${targetCustomerId}:`, err.message);
      });

      // 8. Setup tenant
      try {
        await runWithTenant(dbName, async () => {
          await syncTemplatesToDb(prisma, 'default');
          await seedNewTenant(name);
        });
      } catch (syncErr) {
        console.error(`[CUSTOMER_TENANT_SETUP] Failed for ${dbName}:`, syncErr.message);
      }

      res.status(201).json(tenant);
    });
  } catch (err) {
    console.error('Customer site creation error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /:id/impersonate — Generate a token to log into this tenant's admin
 * Only allowed if the tenant belongs to the current customer
 */
router.post('/:id/impersonate', requireCustomer, async (req, res) => {
  const primaryDb = process.env.DB_NAME || 'wolfwave_admin';
  return runWithTenant(primaryDb, async () => {
    try {
      const tenantId = parseInt(req.params.id);
      
      // Ensure the tenant belongs to the customer
      const tenant = await prisma.tenants.findFirst({
        where: { 
          id: tenantId,
          customer_id: req.customer.id
        }
      });

      if (!tenant) {
        return res.status(404).json({ error: 'Site not found or access denied' });
      }

      const token = generateImpersonationToken(tenantId);
      res.json({ token });
    } catch (err) {
      console.error('Customer impersonation error:', err);
      res.status(500).json({ error: 'Failed to generate login token' });
    }
  });
});

export default router;
