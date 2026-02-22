import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { query } from '../db/connection.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { clearThemeCache } from '../services/themeResolver.js';
import axios from 'axios';
import jwt from 'jsonwebtoken';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET is required in production');
  }
}
const SAFE_JWT_SECRET = JWT_SECRET || 'dev-secret-change-in-production';

/**
 * Middleware: require customer auth (from customer_token cookie or Authorization header)
 */
function requireCustomer(req, res, next) {
  const token = req.cookies?.customer_token ||
    req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, SAFE_JWT_SECRET);
    // Check if this is a customer token (no role field or role is not 'admin')
    if (!decoded.role || decoded.role !== 'admin') {
      req.customer = decoded;
      next();
    } else {
      return res.status(403).json({ error: 'Customer access required' });
    }
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

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
  const response = await axios(config);
  return response.data;
}

/**
 * Get or create Stripe customer for this customer
 */
async function ensureStripeCustomer(customerId, stripeKey) {
  const customer = await prisma.customers.findUnique({ where: { id: customerId } });
  if (!customer) throw new Error('Customer not found');

  // If we have a stripe_customer_id, verify it exists in Stripe
  if (customer.stripe_customer_id) {
    try {
      // Verify the customer exists in Stripe
      await stripeRequest('get', `/customers/${customer.stripe_customer_id}`, {}, stripeKey);
      return customer.stripe_customer_id;
    } catch (stripeErr) {
      // Customer doesn't exist in Stripe, clear the invalid ID and create new one
      console.warn(`Stripe customer ${customer.stripe_customer_id} not found, creating new one`);
      await prisma.customers.update({
        where: { id: customerId },
        data: { stripe_customer_id: null }
      });
    }
  }

  // Create Stripe customer
  const stripeCustomer = await stripeRequest('post', '/customers', {
    email: customer.email,
    name: [customer.first_name, customer.last_name].filter(Boolean).join(' ') || undefined,
    'metadata[wolfwave_customer_id]': customer.id.toString()
  }, stripeKey);

  // Save stripe_customer_id
  await prisma.customers.update({
    where: { id: customerId },
    data: { stripe_customer_id: stripeCustomer.id }
  });

  return stripeCustomer.id;
}

/**
 * GET /me — get current customer's subscription
 */
router.get('/me', requireCustomer, async (req, res) => {
  try {
    const subscription = await prisma.customer_subscriptions.findFirst({
      where: {
        customer_id: req.customer.id,
        status: { in: ['active', 'trialing', 'past_due', 'paused'] }
      },
      include: {
        subscription_plans: true
      },
      orderBy: { created_at: 'desc' }
    });

    if (!subscription) {
      return res.json({ subscription: null });
    }

    // Parse plan features
    let features = [];
    if (subscription.subscription_plans.features) {
      try { features = JSON.parse(subscription.subscription_plans.features); } catch (e) {}
    }

    res.json({
      subscription: {
        id: subscription.id,
        status: subscription.status,
        current_period_start: subscription.current_period_start,
        current_period_end: subscription.current_period_end,
        cancel_at_period_end: subscription.cancel_at_period_end,
        canceled_at: subscription.canceled_at,
        paused_at: subscription.paused_at,
        plan: {
          id: subscription.subscription_plans.id,
          name: subscription.subscription_plans.name,
          slug: subscription.subscription_plans.slug,
          price: subscription.subscription_plans.price,
          interval: subscription.subscription_plans.interval,
          features
        }
      }
    });
  } catch (err) {
    console.error('Get subscription error:', err);
    res.status(500).json({ error: 'Failed to get subscription' });
  }
});

/**
 * POST /checkout — create Stripe Checkout Session
 */
router.post('/checkout', requireCustomer, async (req, res) => {
  try {
    const { plan_id } = req.body;
    if (!plan_id) return res.status(400).json({ error: 'plan_id is required' });

    const plan = await prisma.subscription_plans.findUnique({ where: { id: parseInt(plan_id) } });
    if (!plan || !plan.is_active) return res.status(404).json({ error: 'Plan not found or inactive' });
    if (!plan.stripe_price_id) return res.status(400).json({ error: 'Plan not synced to Stripe' });

    const stripeKey = await getStripeKey();
    if (!stripeKey) return res.status(500).json({ error: 'Stripe not configured' });

    const stripeCustomerId = await ensureStripeCustomer(req.customer.id, stripeKey);

    // Get site URL for redirect
    const siteUrlRows = await query(
      "SELECT setting_value FROM settings WHERE setting_key = 'site_url'"
    );
    const siteUrl = siteUrlRows[0]?.setting_value || 'http://localhost:3000';

    // Build checkout session params
    const sessionParams = {
      'customer': stripeCustomerId,
      'mode': 'subscription',
      'line_items[0][price]': plan.stripe_price_id,
      'line_items[0][quantity]': '1',
      'success_url': `${siteUrl}/account/subscription?success=true`,
      'cancel_url': `${siteUrl}/subscribe?canceled=true`,
      'metadata[wolfwave_customer_id]': req.customer.id.toString(),
      'metadata[wolfwave_plan_id]': plan.id.toString()
    };

    if (plan.trial_days > 0) {
      sessionParams['subscription_data[trial_period_days]'] = plan.trial_days.toString();
    }

    const session = await stripeRequest('post', '/checkout/sessions', sessionParams, stripeKey);

    res.json({ checkout_url: session.url });
  } catch (err) {
    console.error('Create checkout error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

/**
 * POST /cancel — cancel subscription at period end
 */
router.post('/cancel', requireCustomer, async (req, res) => {
  try {
    const subscription = await prisma.customer_subscriptions.findFirst({
      where: {
        customer_id: req.customer.id,
        status: { in: ['active', 'trialing'] }
      }
    });

    if (!subscription) return res.status(404).json({ error: 'No active subscription' });

    // Cancel on Stripe
    const stripeKey = await getStripeKey();
    if (stripeKey && subscription.stripe_subscription_id) {
      await stripeRequest('post', `/subscriptions/${subscription.stripe_subscription_id}`, {
        cancel_at_period_end: 'true'
      }, stripeKey);
    }

    await prisma.customer_subscriptions.update({
      where: { id: subscription.id },
      data: { cancel_at_period_end: true, canceled_at: new Date() }
    });

    res.json({ success: true, message: 'Subscription will cancel at end of billing period' });
  } catch (err) {
    console.error('Cancel subscription error:', err);
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

/**
 * POST /resume — undo pending cancellation
 */
router.post('/resume', requireCustomer, async (req, res) => {
  try {
    const subscription = await prisma.customer_subscriptions.findFirst({
      where: {
        customer_id: req.customer.id,
        cancel_at_period_end: true,
        status: { in: ['active', 'trialing'] }
      }
    });

    if (!subscription) return res.status(404).json({ error: 'No pending cancellation found' });

    const stripeKey = await getStripeKey();
    if (stripeKey && subscription.stripe_subscription_id) {
      await stripeRequest('post', `/subscriptions/${subscription.stripe_subscription_id}`, {
        cancel_at_period_end: 'false'
      }, stripeKey);
    }

    await prisma.customer_subscriptions.update({
      where: { id: subscription.id },
      data: { cancel_at_period_end: false, canceled_at: null }
    });

    res.json({ success: true, message: 'Cancellation reversed' });
  } catch (err) {
    console.error('Resume subscription error:', err);
    res.status(500).json({ error: 'Failed to resume subscription' });
  }
});

/**
 * POST /change-plan — switch to a different plan
 */
router.post('/change-plan', requireCustomer, async (req, res) => {
  try {
    const { plan_id } = req.body;
    if (!plan_id) return res.status(400).json({ error: 'plan_id is required' });

    const newPlan = await prisma.subscription_plans.findUnique({ where: { id: parseInt(plan_id) } });
    if (!newPlan || !newPlan.is_active || !newPlan.stripe_price_id) {
      return res.status(404).json({ error: 'Plan not found, inactive, or not synced' });
    }

    const subscription = await prisma.customer_subscriptions.findFirst({
      where: {
        customer_id: req.customer.id,
        status: { in: ['active', 'trialing'] }
      }
    });

    if (!subscription) return res.status(404).json({ error: 'No active subscription' });

    const stripeKey = await getStripeKey();
    if (!stripeKey || !subscription.stripe_subscription_id) {
      return res.status(500).json({ error: 'Stripe not configured or subscription not synced' });
    }

    // Get current subscription items from Stripe
    const stripeSub = await stripeRequest('get',
      `/subscriptions/${subscription.stripe_subscription_id}`,
      null, stripeKey
    );

    const itemId = stripeSub.items?.data?.[0]?.id;
    if (!itemId) return res.status(500).json({ error: 'Could not find subscription item' });

    // Update the subscription with new price (prorated)
    await stripeRequest('post', `/subscriptions/${subscription.stripe_subscription_id}`, {
      'items[0][id]': itemId,
      'items[0][price]': newPlan.stripe_price_id,
      proration_behavior: 'create_prorations'
    }, stripeKey);

    // Update local record
    await prisma.customer_subscriptions.update({
      where: { id: subscription.id },
      data: {
        plan_id: newPlan.id,
        cancel_at_period_end: false,
        canceled_at: null
      }
    });

    res.json({ success: true, message: 'Plan changed successfully' });
  } catch (err) {
    console.error('Change plan error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to change plan' });
  }
});

/**
 * POST /pause — pause subscription
 */
router.post('/pause', requireCustomer, async (req, res) => {
  try {
    const subscription = await prisma.customer_subscriptions.findFirst({
      where: {
        customer_id: req.customer.id,
        status: 'active'
      }
    });

    if (!subscription) return res.status(404).json({ error: 'No active subscription to pause' });

    const stripeKey = await getStripeKey();
    if (stripeKey && subscription.stripe_subscription_id) {
      // Pause collection on Stripe
      await stripeRequest('post', `/subscriptions/${subscription.stripe_subscription_id}`, {
        'pause_collection[behavior]': 'void'
      }, stripeKey);
    }

    await prisma.customer_subscriptions.update({
      where: { id: subscription.id },
      data: { status: 'paused', paused_at: new Date() }
    });

    res.json({ success: true, message: 'Subscription paused' });
  } catch (err) {
    console.error('Pause subscription error:', err);
    res.status(500).json({ error: 'Failed to pause subscription' });
  }
});

/**
 * POST /unpause — resume paused subscription
 */
router.post('/unpause', requireCustomer, async (req, res) => {
  try {
    const subscription = await prisma.customer_subscriptions.findFirst({
      where: {
        customer_id: req.customer.id,
        status: 'paused'
      }
    });

    if (!subscription) return res.status(404).json({ error: 'No paused subscription found' });

    const stripeKey = await getStripeKey();
    if (stripeKey && subscription.stripe_subscription_id) {
      await stripeRequest('post', `/subscriptions/${subscription.stripe_subscription_id}`, {
        'pause_collection': ''
      }, stripeKey);
    }

    await prisma.customer_subscriptions.update({
      where: { id: subscription.id },
      data: { status: 'active', paused_at: null }
    });

    res.json({ success: true, message: 'Subscription resumed' });
  } catch (err) {
    console.error('Unpause subscription error:', err);
    res.status(500).json({ error: 'Failed to resume subscription' });
  }
});

/**
 * POST /update-payment — create Stripe billing portal session
 */
router.post('/update-payment', requireCustomer, async (req, res) => {
  try {
    const customer = await prisma.customers.findUnique({
      where: { id: req.customer.id }
    });

    if (!customer?.stripe_customer_id) {
      return res.status(400).json({ error: 'No Stripe customer found' });
    }

    const stripeKey = await getStripeKey();
    if (!stripeKey) return res.status(500).json({ error: 'Stripe not configured' });

    const siteUrlRows = await query(
      "SELECT setting_value FROM settings WHERE setting_key = 'site_url'"
    );
    const siteUrl = siteUrlRows[0]?.setting_value || 'http://localhost:3000';

    const session = await stripeRequest('post', '/billing_portal/sessions', {
      customer: customer.stripe_customer_id,
      return_url: `${siteUrl}/account/subscription`
    }, stripeKey);

    res.json({ portal_url: session.url });
  } catch (err) {
    console.error('Update payment error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to create portal session' });
  }
});

// --- ADMIN ROUTES ---

/**
 * PUT /admin/:id — manually update a subscription (Admin only)
 */
router.put('/admin/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { status, plan_id, current_period_end } = req.body;
    const subId = parseInt(req.params.id);

    const updated = await prisma.customer_subscriptions.update({
      where: { id: subId },
      data: {
        status: status || undefined,
        plan_id: plan_id ? parseInt(plan_id) : undefined,
        current_period_end: current_period_end ? new Date(current_period_end) : undefined
      }
    });

    clearThemeCache();
    res.json(updated);
  } catch (err) {
    console.error('Admin sub update error:', err);
    res.status(500).json({ error: 'Failed to update subscription' });
  }
});

/**
 * DELETE /admin/:id — delete a subscription record (Admin only)
 */
router.delete('/admin/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    await prisma.customer_subscriptions.delete({
      where: { id: parseInt(req.params.id) }
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Admin sub delete error:', err);
    res.status(500).json({ error: 'Failed to delete subscription' });
  }
});

export default router;
