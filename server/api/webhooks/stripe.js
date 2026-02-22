import { Router } from 'express';
import { query } from '../../db/connection.js';
import prisma from '../../lib/prisma.js';
import crypto from 'crypto';
import { sendEmail } from '../../services/emailService.js';
import { logError, logInfo } from '../../lib/logger.js';

const router = Router();

/**
 * Convert Stripe timestamp (unix seconds, ms, or ISO string) to a Date.
 */
function toDate(val) {
  if (!val) return new Date();
  if (typeof val === 'number') {
    // Stripe sends unix seconds; if it looks like ms already, use as-is
    return new Date(val < 1e12 ? val * 1000 : val);
  }
  return new Date(val);
}

/**
 * Verify Stripe webhook signature
 */
function verifyStripeSignature(body, signature, webhookSecret) {
  // Stripe signature format: t=timestamp,v1=hash
  const parts = {};
  for (const item of signature.split(',')) {
    const [key, value] = item.split('=');
    parts[key] = value;
  }

  if (!parts.t || !parts.v1) return false;

  const payload = `${parts.t}.${body}`;
  const expected = crypto
    .createHmac('sha256', webhookSecret)
    .update(payload)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(parts.v1)
  );
}

/**
 * Log to both console and tenant error log
 */
function webhookLog(req, level, msg, data) {
  const full = data ? `${msg} ${typeof data === 'string' ? data : JSON.stringify(data)}` : msg;
  if (level === 'error') {
    logError(req, new Error(full), 'stripe-webhook');
  } else {
    logInfo(req, 'stripe-webhook', full);
  }
}

/**
 * Handle Stripe webhooks
 */
router.post('/', async (req, res) => {
  webhookLog(req, 'info', 'Webhook received');

  const signature = req.headers['stripe-signature'];

  // Check .env first, then DB-stored secret
  let webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    try {
      const rows = await query(
        "SELECT setting_value FROM settings WHERE setting_key = 'stripe_webhook_secret'"
      );
      webhookSecret = rows[0]?.setting_value || null;
      webhookLog(req, 'info', `Webhook secret from DB: ${webhookSecret ? 'found' : 'NOT FOUND'}`);
    } catch (e) {
      webhookLog(req, 'error', 'Failed to query webhook secret from DB', e.message);
    }
  } else {
    webhookLog(req, 'info', 'Using webhook secret from .env');
  }

  if (!webhookSecret || !signature) {
    webhookLog(req, 'error', `Missing config — secret: ${!!webhookSecret}, signature: ${!!signature}`);
    return res.status(400).json({ error: 'Missing webhook configuration' });
  }

  const rawBody = req.rawBody;
  if (!rawBody) {
    webhookLog(req, 'error', 'No raw body available on request');
    return res.status(400).json({ error: 'No raw body' });
  }

  webhookLog(req, 'info', `Raw body length: ${rawBody.length}`);

  if (!verifyStripeSignature(rawBody, signature, webhookSecret)) {
    webhookLog(req, 'error', 'Signature verification FAILED');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  webhookLog(req, 'info', 'Signature verified OK');

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch (parseErr) {
    webhookLog(req, 'error', 'Failed to parse webhook body', parseErr.message);
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  webhookLog(req, 'info', `Event type: ${event.type}, event ID: ${event.id}`);

  try {
    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(req, event.data.object);
        break;

      case 'payment_intent.payment_failed':
        await handlePaymentIntentFailed(req, event.data.object);
        break;

      case 'charge.refunded':
        await handleChargeRefunded(req, event.data.object);
        break;

      case 'invoice.paid':
        await handleInvoicePaid(req, event.data.object);
        break;

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionChange(req, event.data.object, event.type);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(req, event.data.object);
        break;

      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(req, event.data.object);
        break;

      default:
        webhookLog(req, 'info', `Unhandled event type: ${event.type}`);
    }

    webhookLog(req, 'info', `Event ${event.type} processed OK`);
    res.json({ received: true });
  } catch (err) {
    webhookLog(req, 'error', `Processing ${event.type} FAILED`, err.stack || err.message);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

/**
 * Handle payment_intent.succeeded
 */
async function handlePaymentIntentSucceeded(req, paymentIntent) {
  const { id, amount, currency } = paymentIntent;
  webhookLog(req, 'info', `payment_intent.succeeded: ${id}, amount: ${amount}`);

  const orders = await query('SELECT id FROM orders WHERE payment_intent_id = ?', [id]);
  if (!orders[0]) {
    webhookLog(req, 'info', `No order found for payment intent ${id} — skipping`);
    return;
  }

  await query('UPDATE orders SET payment_status = ?, updated_at = NOW() WHERE id = ?', ['paid', orders[0].id]);
  webhookLog(req, 'info', `Order ${orders[0].id} marked as paid`);

  const orderData = await query('SELECT order_number, email, total FROM orders WHERE id = ?', [orders[0].id]);
  if (orderData[0]) {
    sendEmail(orderData[0].email, 'payment-receipt', {
      order_number: orderData[0].order_number,
      total: Number(orderData[0].total).toFixed(2)
    });
  }
}

/**
 * Handle payment_intent.payment_failed
 */
async function handlePaymentIntentFailed(req, paymentIntent) {
  const { id, last_payment_error } = paymentIntent;
  webhookLog(req, 'info', `payment_intent.payment_failed: ${id}, reason: ${last_payment_error?.message || 'unknown'}`);

  const orders = await query('SELECT id FROM orders WHERE payment_intent_id = ?', [id]);
  if (!orders[0]) {
    webhookLog(req, 'info', `No order found for payment intent ${id} — skipping`);
    return;
  }

  await query('UPDATE orders SET payment_status = ?, updated_at = NOW() WHERE id = ?', ['failed', orders[0].id]);
  webhookLog(req, 'info', `Order ${orders[0].id} marked as failed`);
}

/**
 * Handle charge.refunded
 */
async function handleChargeRefunded(req, charge) {
  const { payment_intent, amount } = charge;
  webhookLog(req, 'info', `charge.refunded: pi=${payment_intent}, amount=${amount}`);

  if (!payment_intent) {
    webhookLog(req, 'error', 'Refund missing payment_intent');
    return;
  }

  const orders = await query('SELECT id FROM orders WHERE payment_intent_id = ?', [payment_intent]);
  if (!orders[0]) {
    webhookLog(req, 'info', `No order found for payment intent ${payment_intent} — skipping`);
    return;
  }

  await query('UPDATE orders SET payment_status = ?, updated_at = NOW() WHERE id = ?', ['refunded', orders[0].id]);
  webhookLog(req, 'info', `Order ${orders[0].id} marked as refunded`);
}

/**
 * Handle subscription created/updated
 */
async function handleSubscriptionChange(req, subscription, eventType) {
  const { id, customer, status, current_period_start, current_period_end,
          cancel_at_period_end, canceled_at } = subscription;

  webhookLog(req, 'info', `${eventType}: sub=${id}, stripe_customer=${customer}, status=${status}, period_start=${current_period_start}, period_end=${current_period_end}`);

  const priceId = subscription.items?.data?.[0]?.price?.id;
  webhookLog(req, 'info', `Price ID from subscription: ${priceId || 'NONE'}`);

  // Find matching plan
  let plan = null;
  if (priceId) {
    plan = await prisma.subscription_plans.findFirst({ where: { stripe_price_id: priceId } });
    webhookLog(req, 'info', `Plan lookup by price ${priceId}: ${plan ? `found (id=${plan.id}, name=${plan.name})` : 'NOT FOUND'}`);
  }

  // Find customer
  const dbCustomer = await prisma.customers.findFirst({ where: { stripe_customer_id: customer } });
  if (!dbCustomer) {
    webhookLog(req, 'error', `No customer found for stripe_customer_id=${customer} — CANNOT CREATE SUBSCRIPTION`);
    return;
  }
  webhookLog(req, 'info', `Customer found: id=${dbCustomer.id}, email=${dbCustomer.email}`);

  // Map status
  const statusMap = {
    active: 'active', trialing: 'trialing', past_due: 'past_due',
    canceled: 'canceled', unpaid: 'unpaid', incomplete: 'past_due',
    incomplete_expired: 'canceled', paused: 'paused'
  };
  const mappedStatus = statusMap[status] || 'active';
  webhookLog(req, 'info', `Status mapping: ${status} → ${mappedStatus}`);

  // Check for existing subscription record
  const existing = await prisma.customer_subscriptions.findFirst({ where: { stripe_subscription_id: id } });
  webhookLog(req, 'info', `Existing subscription record: ${existing ? `id=${existing.id}` : 'NONE (will create)'}`);

  const subData = {
    customer_id: dbCustomer.id,
    plan_id: plan?.id || existing?.plan_id || 0,
    stripe_subscription_id: id,
    stripe_customer_id: customer,
    status: mappedStatus,
    current_period_start: toDate(current_period_start),
    current_period_end: toDate(current_period_end),
    cancel_at_period_end: cancel_at_period_end || false,
    canceled_at: canceled_at ? toDate(canceled_at) : null
  };

  webhookLog(req, 'info', `Subscription data: plan_id=${subData.plan_id}, status=${subData.status}`);

  if (existing) {
    await prisma.customer_subscriptions.update({ where: { id: existing.id }, data: subData });
    webhookLog(req, 'info', `UPDATED subscription record id=${existing.id}`);
  } else {
    const created = await prisma.customer_subscriptions.create({ data: subData });
    webhookLog(req, 'info', `CREATED subscription record id=${created.id}`);
  }
}

/**
 * Handle subscription deleted
 */
async function handleSubscriptionDeleted(req, subscription) {
  webhookLog(req, 'info', `customer.subscription.deleted: sub=${subscription.id}`);

  const existing = await prisma.customer_subscriptions.findFirst({ where: { stripe_subscription_id: subscription.id } });
  if (existing) {
    await prisma.customer_subscriptions.update({
      where: { id: existing.id },
      data: { status: 'canceled', canceled_at: new Date() }
    });
    webhookLog(req, 'info', `Subscription ${existing.id} marked as canceled`);
  } else {
    webhookLog(req, 'info', `No local subscription found for ${subscription.id} — nothing to cancel`);
  }
}

/**
 * Handle invoice payment failed
 */
async function handleInvoicePaymentFailed(req, invoice) {
  const subscriptionId = invoice.subscription;
  webhookLog(req, 'info', `invoice.payment_failed: sub=${subscriptionId || 'none'}`);
  if (!subscriptionId) return;

  const existing = await prisma.customer_subscriptions.findFirst({ where: { stripe_subscription_id: subscriptionId } });
  if (existing) {
    await prisma.customer_subscriptions.update({ where: { id: existing.id }, data: { status: 'past_due' } });
    webhookLog(req, 'info', `Subscription ${existing.id} → past_due`);
  } else {
    webhookLog(req, 'info', `No local subscription found for ${subscriptionId}`);
  }
}

async function handleInvoicePaid(req, invoice) {
  const { id, customer, subscription, amount_paid, currency, lines } = invoice;
  webhookLog(req, 'info', `invoice.paid: ${id}, sub: ${subscription}, customer: ${customer}`);

  // Skip if amount is 0 (like a trial start with no charge)
  if (amount_paid <= 0) {
    webhookLog(req, 'info', 'Invoice amount is 0, skipping order creation');
    return;
  }

  // Find customer
  const dbCustomer = await prisma.customers.findFirst({ where: { stripe_customer_id: customer } });
  if (!dbCustomer) {
    webhookLog(req, 'error', `No customer found for stripe_customer_id=${customer} — cannot create order from invoice`);
    return;
  }

  // Check if order already exists for this invoice to prevent duplicates
  const existingOrder = await prisma.orders.findFirst({
    where: { payment_intent_id: id } // Using payment_intent_id field to store Stripe Invoice ID for subscriptions
  });

  if (existingOrder) {
    webhookLog(req, 'info', `Order already exists for invoice ${id} (Order: ${existingOrder.order_number})`);
    return;
  }

  // Generate order number
  const orderNumber = await generateOrderNumber();

  // Create order
  const amount = amount_paid / 100;
  
  await prisma.orders.create({
    data: {
      order_number: orderNumber,
      customer_id: dbCustomer.id,
      email: dbCustomer.email,
      billing_address: JSON.stringify({}), // We might not have full address here from Stripe invoice basic object
      shipping_address: JSON.stringify({}),
      payment_method: 'stripe',
      payment_intent_id: id, // Store Invoice ID
      subtotal: amount,
      tax: 0,
      shipping: 0,
      discount: 0,
      total: amount,
      status: 'completed',
      payment_status: 'paid',
      order_items: {
        create: lines.data.map(line => ({
          product_title: line.description || 'Subscription',
          sku: line.price?.id || 'sub',
          price: (line.amount || 0) / 100,
          quantity: line.quantity || 1,
          subtotal: (line.amount || 0) / 100
        }))
      }
    }
  });

  webhookLog(req, 'info', `Order ${orderNumber} created for subscription invoice ${id}`);
}

async function generateOrderNumber() {
  const lastOrder = await prisma.orders.findFirst({
    orderBy: { id: 'desc' },
    select: { order_number: true }
  });

  if (!lastOrder) return '#1001';

  const lastNum = parseInt(lastOrder.order_number.replace('#', ''));
  if (isNaN(lastNum)) return '#1001';
  return `#${lastNum + 1}`;
}

export default router;
