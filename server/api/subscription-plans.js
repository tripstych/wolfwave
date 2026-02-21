import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { query } from '../db/connection.js';
import axios from 'axios';
import { logError } from '../lib/logger.js';

const router = Router();

/**
 * Get Stripe secret key from settings
 */
async function getStripeKey() {
  const rows = await query(
    "SELECT setting_value FROM settings WHERE setting_key = 'stripe_secret_key'"
  );
  return rows[0]?.setting_value || null;
}

/**
 * Call Stripe API
 */
async function stripeRequest(method, path, data, stripeKey) {
  const url = `https://api.stripe.com/v1${path}`;
  console.log(`[STRIPE-DEBUG] 📤 ${method.toUpperCase()} ${url}`);
  
  const config = {
    method,
    url,
    headers: {
      'Authorization': `Bearer ${stripeKey}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  };
  if (data) {
    config.data = new URLSearchParams(data).toString();
  }
  
  try {
    const response = await axios(config);
    console.log(`[STRIPE-DEBUG] 📥 Response: ${response.status}`);
    return response.data;
  } catch (error) {
    console.error(`[STRIPE-DEBUG] ❌ Error: ${error.response?.status}`, error.response?.data || error.message);
    throw error;
  }
}

/**
 * List all subscription plans
 */
router.get('/', async (req, res) => {
  try {
    const plans = await query(`
      SELECT sp.*, COUNT(cs.id) as subscriber_count
      FROM subscription_plans sp
      LEFT JOIN customer_subscriptions cs ON sp.id = cs.plan_id
      GROUP BY sp.id
      ORDER BY sp.position ASC
    `);
    const transformedPlans = plans.map(p => {
      let target_slugs = [];
      if (p.target_slugs) {
        if (typeof p.target_slugs === 'string') {
          try { target_slugs = JSON.parse(p.target_slugs); } catch (e) {}
        } else {
          target_slugs = p.target_slugs;
        }
      }
      return { ...p, target_slugs };
    });

    res.json({ data: transformedPlans });
  } catch (err) {
    logError(req, err, 'LIST_PLANS');
    res.status(500).json({ error: 'Failed to list plans' });
  }
});

/**
 * Get single plan
 */
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const [plan] = await query('SELECT * FROM subscription_plans WHERE id = ?', [parseInt(req.params.id)]);
    if (!plan) return res.status(404).json({ error: 'Plan not found' });

    let features = [];
    if (plan.features) {
      try { features = JSON.parse(plan.features); } catch (e) { features = []; }
    }

    let target_slugs = [];
    if (plan.target_slugs) {
      if (typeof plan.target_slugs === 'string') {
        try { target_slugs = JSON.parse(plan.target_slugs); } catch (e) { target_slugs = []; }
      } else {
        target_slugs = plan.target_slugs;
      }
    }

    res.json({ ...plan, features, target_slugs });
  } catch (err) {
    logError(req, err, 'GET_PLAN');
    res.status(500).json({ error: 'Failed to get plan' });
  }
});

/**
 * Create plan + sync to Stripe
 */
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, slug, description, price, interval, interval_count, trial_days, features, is_active, position, product_discount, target_slugs } = req.body;

    if (!name || !slug || price === undefined) {
      return res.status(400).json({ error: 'Name, slug, and price are required' });
    }

    let stripe_product_id = null;
    let stripe_price_id = null;

    const stripeKey = await getStripeKey();
    if (stripeKey) {
      console.log(`[STRIPE-SYNC] 🔑 Key detected, starting sync for "${name}"...`);
      try {
        const prodData = { name, 'metadata[source]': 'wolfwave' };
        if (description) prodData.description = description;
        const product = await stripeRequest('post', '/products', prodData, stripeKey);
        stripe_product_id = product.id;

        const stripeInterval = interval === 'yearly' ? 'year' : interval === 'weekly' ? 'week' : 'month';
        const stripePrice = await stripeRequest('post', '/prices', {
          product: product.id,
          unit_amount: Math.round(parseFloat(price) * 100),
          currency: 'usd',
          'recurring[interval]': stripeInterval,
          'recurring[interval_count]': interval_count || 1
        }, stripeKey);
        stripe_price_id = stripePrice.id;
      } catch (stripeErr) {
        console.error('Stripe sync error:', stripeErr.response?.data || stripeErr.message);
      }
    }

    const sql = `
      INSERT INTO subscription_plans (name, slug, description, price, \`interval\`, interval_count, trial_days, features, is_active, position, product_discount, stripe_product_id, stripe_price_id, target_slugs)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const params = [
      name, slug, description || null, parseFloat(price), 
      interval || 'monthly', parseInt(interval_count) || 1, parseInt(trial_days) || 0,
      features ? JSON.stringify(features) : null,
      is_active !== false ? 1 : 0, parseInt(position) || 0, parseFloat(product_discount) || 0,
      stripe_product_id, stripe_price_id,
      target_slugs ? JSON.stringify(target_slugs) : null
    ];

    const result = await query(sql, params);
    const [plan] = await query('SELECT * FROM subscription_plans WHERE id = ?', [result.insertId]);
    res.status(201).json(plan);
  } catch (err) {
    logError(req, err, 'CREATE_PLAN');
    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'Slug already exists' });
    res.status(500).json({ error: 'Failed to create plan' });
  }
});

/**
 * Update plan
 */
router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const planId = parseInt(req.params.id);
    const { name, slug, description, price, interval, interval_count, trial_days, features, is_active, position, product_discount, target_slugs } = req.body;

    const [existing] = await query('SELECT * FROM subscription_plans WHERE id = ?', [planId]);
    if (!existing) return res.status(404).json({ error: 'Plan not found' });

    let { stripe_product_id, stripe_price_id } = existing;
    const stripeKey = await getStripeKey();

    if (stripeKey) {
      console.log(`[STRIPE-SYNC] 🔑 Key detected, checking sync status for "${name || existing.name}"...`);
      try {
        // 1. Create Product if it doesn't exist, or update if name/desc changed
        if (!stripe_product_id) {
          const product = await stripeRequest('post', '/products', {
            name: name || existing.name,
            description: description || existing.description || undefined,
            'metadata[source]': 'wolfwave'
          }, stripeKey);
          stripe_product_id = product.id;
        } else if (name !== undefined || description !== undefined) {
          await stripeRequest('post', `/products/${stripe_product_id}`, {
            name: name || existing.name,
            description: description || existing.description || undefined
          }, stripeKey);
        }

        // 2. Create new Price if amount/interval changed OR if it doesn't exist
        const priceChanged = price !== undefined && parseFloat(price) !== parseFloat(existing.price);
        const intervalChanged = interval !== undefined && interval !== existing.interval;
        
        if (!stripe_price_id || priceChanged || intervalChanged) {
          const stripeInterval = (interval || existing.interval) === 'yearly' ? 'year' : (interval || existing.interval) === 'weekly' ? 'week' : 'month';
          const stripePrice = await stripeRequest('post', '/prices', {
            product: stripe_product_id,
            unit_amount: Math.round(parseFloat(price || existing.price) * 100),
            currency: 'usd',
            'recurring[interval]': stripeInterval,
            'recurring[interval_count]': interval_count || existing.interval_count || 1
          }, stripeKey);
          stripe_price_id = stripePrice.id;
        }
      } catch (stripeErr) {
        console.error('[STRIPE-SYNC] ❌ Sync failed:', stripeErr.response?.data || stripeErr.message);
      }
    }

    const sql = `
      UPDATE subscription_plans 
      SET name = ?, slug = ?, description = ?, price = ?, \`interval\` = ?, 
          interval_count = ?, trial_days = ?, features = ?, is_active = ?, 
          position = ?, product_discount = ?, target_slugs = ?,
          stripe_product_id = ?, stripe_price_id = ?
      WHERE id = ?
    `;
    
    const params = [
      name ?? existing.name,
      slug ?? existing.slug,
      description ?? existing.description,
      price !== undefined ? parseFloat(price) : existing.price,
      interval ?? existing.interval,
      interval_count !== undefined ? parseInt(interval_count) : existing.interval_count,
      trial_days !== undefined ? parseInt(trial_days) : existing.trial_days,
      features ? JSON.stringify(features) : existing.features,
      is_active !== undefined ? (is_active ? 1 : 0) : existing.is_active,
      position !== undefined ? parseInt(position) : existing.position,
      product_discount !== undefined ? parseFloat(product_discount) : existing.product_discount,
      target_slugs ? JSON.stringify(target_slugs) : existing.target_slugs,
      stripe_product_id,
      stripe_price_id,
      planId
    ];

    await query(sql, params);
    const [plan] = await query('SELECT * FROM subscription_plans WHERE id = ?', [planId]);
    res.json(plan);
  } catch (err) {
    logError(req, err, 'UPDATE_PLAN');
    res.status(500).json({ error: 'Failed to update plan' });
  }
});

/**
 * Delete (deactivate) plan
 */
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    await query('UPDATE subscription_plans SET is_active = 0 WHERE id = ?', [parseInt(req.params.id)]);
    res.json({ success: true });
  } catch (err) {
    logError(req, err, 'DELETE_PLAN');
    res.status(500).json({ error: 'Failed to delete plan' });
  }
});

export default router;
