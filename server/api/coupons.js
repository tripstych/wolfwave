import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { query } from '../db/connection.js';
import { error as logError } from '../lib/logger.js';

const router = Router();

// List coupons
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { search, limit = 50, offset = 0 } = req.query;
    const pageLimit = Math.max(1, Math.min(500, parseInt(limit) || 50));
    const pageOffset = Math.max(0, parseInt(offset) || 0);

    let sql = 'SELECT * FROM coupons';
    let countSql = 'SELECT COUNT(*) as total FROM coupons';
    const params = [];
    const countParams = [];

    if (search) {
      sql += ' WHERE code LIKE ?';
      countSql += ' WHERE code LIKE ?';
      const searchParam = `%${search}%`;
      params.push(searchParam);
      countParams.push(searchParam);
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(pageLimit, pageOffset);

    const coupons = await query(sql, params);
    const [countResult] = await query(countSql, countParams);
    const total = countResult?.total || 0;

    const transformed = coupons.map(c => {
      let target_slugs = [];
      if (c.target_slugs) {
        if (typeof c.target_slugs === 'string') {
          try { target_slugs = JSON.parse(c.target_slugs); } catch (e) {}
        } else {
          target_slugs = c.target_slugs;
        }
      }
      return { ...c, target_slugs };
    });

    res.json({
      data: transformed,
      pagination: { total, limit: pageLimit, offset: pageOffset }
    });
  } catch (err) {
    logError(req, err, 'LIST_COUPONS');
    res.status(500).json({ error: 'Failed to list coupons' });
  }
});

// Create coupon
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { code, discount_type, discount_value, min_purchase, starts_at, expires_at, max_uses, is_active, target_slugs } = req.body;
    
    const sql = `
      INSERT INTO coupons (code, discount_type, discount_value, min_purchase, starts_at, expires_at, max_uses, is_active, target_slugs)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const params = [
      code.toUpperCase(),
      discount_type,
      discount_value,
      min_purchase || 0,
      (starts_at && starts_at !== '') ? new Date(starts_at) : null,
      (expires_at && expires_at !== '') ? new Date(expires_at) : null,
      (max_uses !== undefined && max_uses !== '') ? parseInt(max_uses) : null,
      is_active !== false ? 1 : 0,
      target_slugs ? JSON.stringify(target_slugs) : null
    ];

    const result = await query(sql, params);
    const [coupon] = await query('SELECT * FROM coupons WHERE id = ?', [result.insertId]);
    
    res.status(201).json(coupon);
  } catch (err) {
    logError(req, err, 'CREATE_COUPON');
    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'Coupon code already exists' });
    res.status(500).json({ error: 'Failed to create coupon' });
  }
});

// Update coupon
router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { code, discount_type, discount_value, min_purchase, starts_at, expires_at, max_uses, is_active, target_slugs } = req.body;
    
    const sql = `
      UPDATE coupons 
      SET code = ?, discount_type = ?, discount_value = ?, min_purchase = ?, 
          starts_at = ?, expires_at = ?, max_uses = ?, is_active = ?, target_slugs = ?
      WHERE id = ?
    `;
    
    const params = [
      code?.toUpperCase(),
      discount_type,
      discount_value,
      min_purchase,
      (starts_at && starts_at !== '') ? new Date(starts_at) : null,
      (expires_at && expires_at !== '') ? new Date(expires_at) : null,
      (max_uses !== undefined && max_uses !== '') ? parseInt(max_uses) : null,
      is_active !== false ? 1 : 0,
      target_slugs ? JSON.stringify(target_slugs) : null,
      parseInt(req.params.id)
    ];

    await query(sql, params);
    const [coupon] = await query('SELECT * FROM coupons WHERE id = ?', [req.params.id]);
    res.json(coupon);
  } catch (err) {
    logError(req, err, 'UPDATE_COUPON');
    res.status(500).json({ error: 'Failed to update coupon' });
  }
});

// Delete coupon
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    await query('DELETE FROM coupons WHERE id = ?', [parseInt(req.params.id)]);
    res.json({ success: true });
  } catch (err) {
    logError(req, err, 'DELETE_COUPON');
    res.status(500).json({ error: 'Failed to delete coupon' });
  }
});

export default router;
