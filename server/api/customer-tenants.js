import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { query } from '../db/connection.js';
import { getPoolForDb } from '../lib/poolManager.js';
import { provisionTenant } from '../db/provisionTenant.js';
import { syncTemplatesToDb } from '../services/templateParser.js';
import { ensureDefaultTheme } from '../services/themeResolver.js';
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
 * For customer-tenants API, we work in the CURRENT database context only
 */
async function requireCustomer(req, res, next) {
  const currentDb = getCurrentDbName();
  const customerToken = req.cookies?.customer_token;
  const adminToken = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');

  // 1. Try Customer Token in current context
  if (customerToken) {
    try {
      const decoded = jwt.verify(customerToken, JWT_SECRET);
      if (decoded.id) {
        req.customer = decoded;
        req.customerContext = 'current';
        return next();
      }
    } catch (err) { /* continue to admin token */ }
  }

  // 2. Try Admin Token (for admin access to customer data)
  if (adminToken) {
    try {
      const decoded = jwt.verify(adminToken, JWT_SECRET);
      if (decoded.id) {
        // Find customer record in current database linked to this admin user
        let customer = await prisma.customers.findFirst({
          where: { 
            OR: [
              { user_id: decoded.id },
              { email: decoded.email }
            ]
          }
        });

        if (customer) {
          req.customer = {
            id: customer.id,
            email: customer.email,
            first_name: customer.first_name,
            last_name: customer.last_name
          };
          req.customerContext = 'admin-linked';
          return next();
        } else {
          req.customer = null;
          return next();
        }
      }
    } catch (err) { /* invalid token */ }
  }

  if (customerToken) return res.status(401).json({ error: 'Invalid or expired token' });
  return res.status(401).json({ error: 'Authentication required' });
}

/**
 * GET / — list current customer's tenants
 * ONLY shows tenants from the CURRENT database context
 */
router.get('/', requireCustomer, async (req, res) => {
  const currentDb = getCurrentDbName();
  
  console.log(`[CUSTOMER_TENANTS] Current DB: ${currentDb}, Customer Context: ${req.customerContext}, Customer ID: ${req.customer?.id}, Email: ${req.customer?.email}`);
  
  try {
    if (!req.customer) {
      console.log(`[CUSTOMER_TENANTS] No customer found, returning empty list`);
      return res.json([]);
    }

    // Simply query tenants in the CURRENT database for this customer
    console.log(`[CUSTOMER_TENANTS] Querying tenants in current DB ${currentDb} for customer ${req.customer.id}`);
    
    const tenants = await prisma.tenants.findMany({
      where: { customer_id: req.customer.id },
      orderBy: { created_at: 'desc' }
    });
    
    console.log(`[CUSTOMER_TENANTS] Found ${tenants.length} tenants in current database ${currentDb}`);
    res.json(tenants);
    
  } catch (err) {
    console.error('List customer tenants error:', err);
    res.status(500).json({ error: 'Failed to list sites' });
  }
});

/**
 * GET /limits — check current site limits
 * Works only in the CURRENT database context
 */
router.get('/limits', requireCustomer, async (req, res) => {
  const currentDb = getCurrentDbName();
  
  console.log(`[CUSTOMER_TENANTS_LIMITS] Current DB: ${currentDb}, Customer ID: ${req.customer?.id}, Email: ${req.customer?.email}`);
  
  try {
    if (!req.customer) {
      console.log(`[CUSTOMER_TENANTS_LIMITS] No customer found`);
      return res.json({
        used: 0,
        limit: 0,
        plan_name: 'No active license',
        can_create: false
      });
    }

    // Count tenants in CURRENT database only
    const currentTenants = await prisma.tenants.count({
      where: { customer_id: req.customer.id }
    });
    
    console.log(`[CUSTOMER_TENANTS_LIMITS] Found ${currentTenants} tenants in current DB ${currentDb}`);

    // Check if customer has any subscription/plan in the current database
    // For now, we'll check if they have any existing sites or if they're in a special customer group
    const hasSubscription = false; // TODO: Implement proper subscription check in current DB
    
    // If no subscription and no sites, they get limit 0
    if (!hasSubscription && currentTenants === 0) {
      console.log(`[CUSTOMER_TENANTS_LIMITS] Customer has no subscription and no sites - limit 0`);
      return res.json({
        used: 0,
        limit: 0,
        plan_name: 'No active license',
        can_create: false
      });
    }

    // If they have existing sites (legacy), show limited info
    if (currentTenants > 0) {
      return res.json({
        used: currentTenants,
        limit: currentTenants, // Can't create more without subscription
        plan_name: 'Legacy Access',
        can_create: false
      });
    }

    // Default: no access (limit 0)
    res.json({
      used: 0,
      limit: 0,
      plan_name: 'No active license',
      can_create: false
    });
    
  } catch (err) {
    console.error('Customer limits error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST / — provision a new tenant for the customer
 * Creates tenant in current DB and shadow copy in primary DB with same ID
 */
router.post('/', requireCustomer, async (req, res) => {
  const currentDb = getCurrentDbName();
  const primaryDb = process.env.DB_NAME || 'wolfwave_admin';
  
  try {
    const { name, subdomain } = req.body;
    if (!name || !subdomain) {
      return res.status(400).json({ error: 'Name and subdomain are required' });
    }

    // Use current customer ID
    const targetCustomerId = req.customer?.id;
    if (!targetCustomerId) {
      return res.status(403).json({ error: 'Authentication required' });
    }

    // Check limits (this will need to be updated to work in current context)
    // For now, skip limits check or implement a simple version
    console.log(`[CUSTOMER_TENANTS] Creating tenant ${subdomain} for customer ${targetCustomerId} in DB ${currentDb}`);

    // 1. Validate subdomain format
    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(subdomain)) {
      return res.status(400).json({
        error: 'Subdomain must be lowercase alphanumeric with optional hyphens'
      });
    }

    // 2. Check if subdomain exists globally (in primary DB)
    let globalExists = false;
    await runWithTenant(primaryDb, async () => {
      const existing = await prisma.tenants.findUnique({ where: { subdomain } });
      globalExists = !!existing;
    });

    if (globalExists) {
      return res.status(409).json({ error: 'Subdomain already in use' });
    }

    // 3. Provision the new database
    const customerRecord = await prisma.customers.findUnique({
      where: { id: targetCustomerId },
      select: { password: true }
    });

    const dbName = await provisionTenant(subdomain, req.customer.email, customerRecord?.password || 'admin123', true);

    // 4. Create tenant record in current database
    const tenant = await prisma.tenants.create({
      data: {
        name,
        subdomain,
        database_name: dbName,
        customer_id: targetCustomerId,
        status: 'active'
      }
    });

    console.log(`[CUSTOMER_TENANTS] Created tenant in current DB ${currentDb} with ID ${tenant.id}`);

    // 5. Create shadow copy in primary database with same ID
    await runWithTenant(primaryDb, async () => {
      try {
        await prisma.tenants.create({
          data: {
            id: tenant.id, // Use same ID
            name,
            subdomain,
            database_name: dbName,
            customer_id: targetCustomerId, // Use same customer_id
            status: 'active'
          }
        });
        console.log(`[CUSTOMER_TENANTS] Created shadow copy in primary DB ${primaryDb} with ID ${tenant.id}`);
      } catch (shadowErr) {
        console.error(`[CUSTOMER_TENANTS] Failed to create shadow copy in primary DB:`, shadowErr);
        // Don't fail the request, but log the error
      }
    });

    // 6. Setup the new tenant database
    try {
      await runWithTenant(dbName, async () => {
        await ensureDefaultTheme();
        await syncTemplatesToDb(prisma);
        await seedNewTenant(name);
      });
    } catch (syncErr) {
      console.error(`[CUSTOMER_TENANT_SETUP] Failed for ${dbName}:`, syncErr.message);
    }

    res.status(201).json(tenant);
  } catch (err) {
    console.error('Customer site creation error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /:id/impersonate — Generate a token to log into this tenant's admin
 * Only allowed if the tenant belongs to the current customer in CURRENT DB
 */
router.post('/:id/impersonate', requireCustomer, async (req, res) => {
  try {
    const tenantId = parseInt(req.params.id);
    
    // Ensure the tenant belongs to the customer in the CURRENT database
    const tenant = await prisma.tenants.findFirst({
      where: { 
        id: tenantId,
        customer_id: req.customer.id
      }
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Site not found or access denied' });
    }

    console.log(`[CUSTOMER_TENANTS] Impersonating tenant ${tenantId} for customer ${req.customer.id} in DB ${getCurrentDbName()}`);

    const token = generateImpersonationToken(tenantId);
    res.json({ token });
  } catch (err) {
    console.error('Customer impersonation error:', err);
    res.status(500).json({ error: 'Failed to generate login token' });
  }
});

export default router;
