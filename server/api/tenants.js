import { Router } from 'express';
import mysql from 'mysql2/promise';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { getPoolForDb } from '../lib/poolManager.js';
import { provisionTenant } from '../db/provisionTenant.js';
import { syncTemplatesToDb } from '../services/templateParser.js';
import { seedNewTenant } from '../services/tenantSeeder.js';
import prisma from '../lib/prisma.js';
import { runWithTenant } from '../lib/tenantContext.js';

const router = Router();

/**
 * Get a connection to the default (primary) database.
 * Tenants table only lives in the primary DB, so we always query it there
 * regardless of which tenant the current request is scoped to.
 */
function getDefaultPool() {
  const defaultDb = process.env.DB_NAME || 'wolfwave_default';
  return getPoolForDb(defaultDb);
}

async function queryDefault(sql, params = []) {
  const pool = getDefaultPool();
  const [rows] = await pool.execute(sql, params);
  return rows;
}

// List all tenants
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const tenants = await queryDefault(
      'SELECT * FROM tenants ORDER BY created_at DESC'
    );
    res.json({ data: tenants });
  } catch (err) {
    console.error('Failed to list tenants:', err);
    res.status(500).json({ error: 'Failed to list tenants' });
  }
});

// Get single tenant
router.get('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const tenants = await queryDefault(
      'SELECT * FROM tenants WHERE id = ?',
      [req.params.id]
    );
    if (!tenants[0]) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    res.json(tenants[0]);
  } catch (err) {
    console.error('Failed to get tenant:', err);
    res.status(500).json({ error: 'Failed to get tenant' });
  }
});

// Create (provision) a new tenant
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, subdomain, email, password } = req.body;

    if (!name || !subdomain) {
      return res.status(400).json({ error: 'Name and subdomain are required' });
    }

    // Validate subdomain format
    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(subdomain)) {
      return res.status(400).json({
        error: 'Subdomain must be lowercase alphanumeric with optional hyphens'
      });
    }

    // Check if subdomain already exists
    const existing = await queryDefault(
      'SELECT id FROM tenants WHERE subdomain = ?',
      [subdomain]
    );
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Subdomain already in use' });
    }

    // Provision the database
    const dbName = await provisionTenant(subdomain, email, password);

    // Register in tenants table
    const result = await queryDefault(
      'INSERT INTO tenants (name, subdomain, database_name, status) VALUES (?, ?, ?, ?)',
      [name, subdomain, dbName, 'active']
    );

    // ── AUTO-SYNC TEMPLATES FOR NEW TENANT ──
    try {
      console.log(`[TENANT_CREATE] Running initial template sync for ${dbName}...`);
      await runWithTenant(dbName, async () => {
        await syncTemplatesToDb(prisma, 'default');
        // ── SEED ESSENTIAL PAGES ──
        await seedNewTenant(name);
      });
      console.log(`[TENANT_CREATE] Initial sync and seed complete.`);
    } catch (syncErr) {
      console.error(`[TENANT_CREATE] Initial template sync failed for ${dbName}:`, syncErr.message);
      // We don't fail the whole creation because of a sync failure, 
      // but it will be logged.
    }

    const tenant = {
      id: result.insertId,
      name,
      subdomain,
      database_name: dbName,
      status: 'active'
    };

    res.status(201).json(tenant);
  } catch (err) {
    console.error('Tenant provisioning error:', err);
    res.status(400).json({ error: err.message });
  }
});

// Delete (destroy) a tenant
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const tenants = await queryDefault(
      'SELECT * FROM tenants WHERE id = ?',
      [req.params.id]
    );

    if (!tenants[0]) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const tenant = tenants[0];

    // Drop the tenant database
    const conn = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || ''
    });

    try {
      await conn.query(`DROP DATABASE IF EXISTS \`${tenant.database_name}\``);
    } finally {
      await conn.end();
    }

    // Remove from tenants table
    await queryDefault('DELETE FROM tenants WHERE id = ?', [req.params.id]);

    res.json({ success: true, message: `Tenant "${tenant.name}" deleted` });
  } catch (err) {
    console.error('Tenant deletion error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update tenant status (suspend/activate)
router.patch('/:id/status', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['active', 'suspended'].includes(status)) {
      return res.status(400).json({ error: 'Status must be "active" or "suspended"' });
    }

    const tenants = await queryDefault(
      'SELECT * FROM tenants WHERE id = ?',
      [req.params.id]
    );

    if (!tenants[0]) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    await queryDefault(
      'UPDATE tenants SET status = ? WHERE id = ?',
      [status, req.params.id]
    );

    res.json({ success: true, status });
  } catch (err) {
    console.error('Tenant status update error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
