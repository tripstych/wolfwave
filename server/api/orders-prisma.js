import { Router } from 'express';
import { requireAuth, requireEditor } from '../middleware/auth.js';
import prisma from '../lib/prisma.js';
import { query } from '../db/connection.js';
import { sendEmail, buildOrderItemsHtml } from '../services/emailService.js';
import jwt from 'jsonwebtoken';
import axios from 'axios';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

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
 * Get or create Stripe customer
 */
async function ensureStripeCustomer(customerId, stripeKey) {
  const customer = await prisma.customers.findUnique({ where: { id: customerId } });
  if (!customer) throw new Error('Customer not found');

  if (customer.stripe_customer_id) {
    try {
      await stripeRequest('get', `/customers/${customer.stripe_customer_id}`, {}, stripeKey);
      return customer.stripe_customer_id;
    } catch (stripeErr) {
      console.warn(`Stripe customer ${customer.stripe_customer_id} not found, creating new one`);
      await prisma.customers.update({
        where: { id: customerId },
        data: { stripe_customer_id: null }
      });
    }
  }

  const stripeCustomer = await stripeRequest('post', '/customers', {
    email: customer.email,
    name: [customer.first_name, customer.last_name].filter(Boolean).join(' ') || undefined,
    'metadata[wolfwave_customer_id]': customer.id.toString()
  }, stripeKey);

  await prisma.customers.update({
    where: { id: customerId },
    data: { stripe_customer_id: stripeCustomer.id }
  });

  return stripeCustomer.id;
}

/**
 * Customer auth middleware (from customer_token cookie)
 */
function requireCustomer(req, res, next) {
  const token = req.cookies?.customer_token ||
    req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.customer = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * POST /checkout — create Stripe Checkout Session for cart purchase
 */
router.post('/checkout', async (req, res) => {
  try {
    const {
      email,
      first_name,
      last_name,
      phone,
      shipping_address,
      cart_items
    } = req.body;

    if (!email || !cart_items || cart_items.length === 0) {
      return res.status(400).json({ error: 'Email and cart items are required' });
    }
    if (!shipping_address) {
      return res.status(400).json({ error: 'Shipping address is required' });
    }

    const stripeKey = await getStripeKey();
    if (!stripeKey) return res.status(500).json({ error: 'Stripe not configured' });

    // Upsert customer
    const customer = await upsertCustomer(email, first_name, last_name, phone);
    const stripeCustomerId = await ensureStripeCustomer(customer.id, stripeKey);

    // Save/update default shipping address
    const existingAddr = await query(
      "SELECT id FROM addresses WHERE customer_id = ? AND type = 'shipping' AND is_default = 1 LIMIT 1",
      [customer.id]
    );
    if (existingAddr[0]) {
      await query(
        `UPDATE addresses SET first_name=?, last_name=?, address1=?, address2=?, city=?, province=?, postal_code=?, country=?, phone=? WHERE id=?`,
        [shipping_address.first_name, shipping_address.last_name, shipping_address.address1, shipping_address.address2 || null,
         shipping_address.city, shipping_address.province, shipping_address.postal_code, shipping_address.country, phone || null, existingAddr[0].id]
      );
    } else {
      await query(
        `INSERT INTO addresses (customer_id, type, first_name, last_name, address1, address2, city, province, postal_code, country, phone, is_default)
         VALUES (?, 'shipping', ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [customer.id, shipping_address.first_name, shipping_address.last_name, shipping_address.address1, shipping_address.address2 || null,
         shipping_address.city, shipping_address.province, shipping_address.postal_code, shipping_address.country, phone || null]
      );
    }

    // Generate order number and create pending order
    const orderNumber = await generateOrderNumber();

    const order = await prisma.orders.create({
      data: {
        order_number: orderNumber,
        customer_id: customer.id,
        email,
        billing_address: JSON.stringify(shipping_address),
        shipping_address: JSON.stringify(shipping_address),
        payment_method: 'stripe',
        subtotal: parseFloat(req.body.subtotal) || 0,
        tax: parseFloat(req.body.tax) || 0,
        shipping: parseFloat(req.body.shipping) || 0,
        discount: 0,
        total: parseFloat(req.body.total) || 0,
        status: 'pending',
        payment_status: 'pending',
        order_items: {
          createMany: {
            data: cart_items.map(item => ({
              product_id: item.product_id,
              variant_id: item.variant_id || null,
              product_title: item.product_title || 'Unknown',
              variant_title: item.variant_title || null,
              sku: item.sku || '',
              price: parseFloat(item.price) || 0,
              quantity: item.quantity || 1,
              subtotal: parseFloat(item.subtotal) || 0
            }))
          }
        }
      }
    });

    // Get site URL for redirects
    const siteUrlRows = await query(
      "SELECT setting_value FROM settings WHERE setting_key = 'site_url'"
    );
    const siteUrl = siteUrlRows[0]?.setting_value || 'http://localhost:3000';

    // Build Stripe Checkout line items
    const sessionParams = {
      'customer': stripeCustomerId,
      'mode': 'payment',
      'success_url': `${siteUrl}/order-confirmation/${orderNumber.replace('#', '')}`,
      'cancel_url': `${siteUrl}/checkout?canceled=true`,
      'metadata[wolfwave_order_id]': order.id.toString(),
      'metadata[wolfwave_order_number]': orderNumber,
      'metadata[wolfwave_customer_id]': customer.id.toString()
    };

    // Add line items from cart
    cart_items.forEach((item, i) => {
      const name = [item.product_title, item.variant_title].filter(Boolean).join(' — ') || 'Product';
      sessionParams[`line_items[${i}][price_data][currency]`] = 'usd';
      sessionParams[`line_items[${i}][price_data][unit_amount]`] = Math.round((parseFloat(item.price) || 0) * 100).toString();
      sessionParams[`line_items[${i}][price_data][product_data][name]`] = name;
      sessionParams[`line_items[${i}][quantity]`] = (item.quantity || 1).toString();
    });

    // Add shipping as a line item if > 0
    const shippingTotal = parseFloat(req.body.shipping) || 0;
    if (shippingTotal > 0) {
      const idx = cart_items.length;
      sessionParams[`line_items[${idx}][price_data][currency]`] = 'usd';
      sessionParams[`line_items[${idx}][price_data][unit_amount]`] = Math.round(shippingTotal * 100).toString();
      sessionParams[`line_items[${idx}][price_data][product_data][name]`] = 'Shipping';
      sessionParams[`line_items[${idx}][quantity]`] = '1';
    }

    // Add tax as a line item if > 0
    const taxTotal = parseFloat(req.body.tax) || 0;
    if (taxTotal > 0) {
      const idx = cart_items.length + (shippingTotal > 0 ? 1 : 0);
      sessionParams[`line_items[${idx}][price_data][currency]`] = 'usd';
      sessionParams[`line_items[${idx}][price_data][unit_amount]`] = Math.round(taxTotal * 100).toString();
      sessionParams[`line_items[${idx}][price_data][product_data][name]`] = 'Tax';
      sessionParams[`line_items[${idx}][quantity]`] = '1';
    }

    const session = await stripeRequest('post', '/checkout/sessions', sessionParams, stripeKey);

    // Store the Stripe session ID on the order
    await prisma.orders.update({
      where: { id: order.id },
      data: { payment_intent_id: session.id }
    });

    res.json({ checkout_url: session.url, order_number: orderNumber });
  } catch (err) {
    console.error('Checkout error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

/**
 * GET /my-orders — customer's own orders
 */
router.get('/my-orders', requireCustomer, async (req, res) => {
  try {
    const orders = await prisma.orders.findMany({
      where: { customer_id: req.customer.id },
      orderBy: { created_at: 'desc' },
      take: 20,
      include: {
        order_items: {
          include: { products: { select: { title: true } } }
        }
      }
    });

    res.json(orders.map(o => ({
      id: o.id,
      order_number: o.order_number,
      status: o.status,
      payment_status: o.payment_status,
      total: o.total,
      created_at: o.created_at,
      items: o.order_items.map(i => ({
        product_name: i.product_name || i.products?.title,
        quantity: i.quantity,
        price: i.price
      }))
    })));
  } catch (err) {
    console.error('My orders error:', err);
    res.status(500).json({ error: 'Failed to load orders' });
  }
});

/**
 * Generate unique order number
 */
async function generateOrderNumber() {
  const lastOrder = await prisma.orders.findFirst({
    orderBy: { id: 'desc' },
    select: { order_number: true }
  });

  if (!lastOrder) return '#1001';

  const lastNum = parseInt(lastOrder.order_number.replace('#', ''));
  return `#${lastNum + 1}`;
}

/**
 * Deduct inventory for order items atomically
 */
async function deductInventory(cartItems) {
  return await prisma.$transaction(async (tx) => {
    for (const item of cartItems) {
      if (item.variant_id) {
        // Atomic decrement using Prisma's increment with a negative value
        // We also check current stock first inside the transaction
        const variant = await tx.product_variants.findUnique({
          where: { id: item.variant_id },
          select: { inventory_quantity: true, title: true }
        });

        if (!variant || variant.inventory_quantity < item.quantity) {
          throw new Error(`Insufficient stock for variant: ${variant?.title || item.variant_id}`);
        }

        await tx.product_variants.update({
          where: { id: item.variant_id },
          data: {
            inventory_quantity: { decrement: item.quantity }
          }
        });
      } else if (item.product_id) {
        const product = await tx.products.findUnique({
          where: { id: item.product_id },
          select: { inventory_quantity: true, sku: true }
        });

        if (!product || product.inventory_quantity < item.quantity) {
          throw new Error(`Insufficient stock for product: ${product?.sku || item.product_id}`);
        }

        await tx.products.update({
          where: { id: item.product_id },
          data: {
            inventory_quantity: { decrement: item.quantity }
          }
        });
      }
    }
  });
}

/**
 * Create or update customer
 */
async function upsertCustomer(email, firstName, lastName, phone) {
  return await prisma.customers.upsert({
    where: { email },
    update: {
      first_name: firstName || undefined,
      last_name: lastName || undefined,
      phone: phone || undefined
    },
    create: {
      email,
      first_name: firstName,
      last_name: lastName,
      phone
    }
  });
}

/**
 * Create order from cart
 */
router.post('/', async (req, res) => {
  try {
    const {
      email,
      first_name,
      last_name,
      phone,
      billing_address,
      shipping_address,
      payment_method,
      payment_intent_id,
      paypal_order_id,
      cart_items,
      subtotal,
      tax,
      shipping,
      discount,
      total,
      customer_note
    } = req.body;

    // Validate required fields
    if (!email || !cart_items || cart_items.length === 0) {
      return res.status(400).json({
        error: 'Email and cart items are required'
      });
    }

    if (!billing_address || !shipping_address) {
      return res.status(400).json({
        error: 'Billing and shipping addresses are required'
      });
    }

    if (!payment_method) {
      return res.status(400).json({ error: 'Payment method is required' });
    }

    // Upsert customer
    const customer = await upsertCustomer(email, first_name, last_name, phone);

    // Generate order number
    const orderNumber = await generateOrderNumber();

    // Create order
    const order = await prisma.orders.create({
      data: {
        order_number: orderNumber,
        customer_id: customer.id,
        email,
        billing_address: JSON.stringify(billing_address),
        shipping_address: JSON.stringify(shipping_address),
        payment_method,
        payment_intent_id: payment_intent_id || null,
        paypal_order_id: paypal_order_id || null,
        subtotal: parseFloat(subtotal) || 0,
        tax: parseFloat(tax) || 0,
        shipping: parseFloat(shipping) || 0,
        discount: parseFloat(discount) || 0,
        total: parseFloat(total) || 0,
        status: 'pending',
        payment_status: 'pending',
        customer_note: customer_note || null,
        order_items: {
          createMany: {
            data: cart_items.map(item => ({
              product_id: item.product_id,
              variant_id: item.variant_id || null,
              product_title: item.product_title || 'Unknown',
              variant_title: item.variant_title || null,
              sku: item.sku || '',
              price: parseFloat(item.price) || 0,
              quantity: item.quantity || 1,
              subtotal: parseFloat(item.subtotal) || 0
            }))
          }
        }
      },
      include: {
        order_items: true,
        customers: true
      }
    });

    // Deduct inventory
    await deductInventory(cart_items);

    // Send order confirmation email (fire-and-forget)
    sendEmail(email, 'order-confirmation', {
      order_number: order.order_number,
      customer_name: [first_name, last_name].filter(Boolean).join(' ') || email,
      total: Number(order.total).toFixed(2),
      order_items: buildOrderItemsHtml(order.order_items)
    });

    res.status(201).json({
      order_number: order.order_number,
      id: order.id,
      status: order.status,
      payment_status: order.payment_status,
      total: order.total
    });
  } catch (err) {
    console.error('Create order error:', err);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

/**
 * Get order by order number (guest)
 */
router.get('/number/:orderNumber', async (req, res) => {
  try {
    const order = await prisma.orders.findUnique({
      where: { order_number: req.params.orderNumber },
      include: {
        order_items: {
          include: {
            products: true,
            product_variants: true
          }
        },
        customers: true
      }
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json({
      ...order,
      billing_address: order.billing_address || {},
      shipping_address: order.shipping_address || {}
    });
  } catch (err) {
    console.error('Get order by number error:', err);
    res.status(500).json({ error: 'Failed to get order' });
  }
});

/**
 * Get order detail (authenticated)
 */
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);

    const order = await prisma.orders.findUnique({
      where: { id: orderId },
      include: {
        order_items: {
          include: {
            products: true,
            product_variants: true
          }
        },
        customers: true
      }
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json({
      ...order,
      billing_address: order.billing_address || {},
      shipping_address: order.shipping_address || {}
    });
  } catch (err) {
    console.error('Get order detail error:', err);
    res.status(500).json({ error: 'Failed to get order' });
  }
});

/**
 * List orders with filters
 */
router.get('/', requireAuth, requireEditor, async (req, res) => {
  try {
    const { status, payment_status, search, limit = 50, offset = 0 } = req.query;

    const pageLimit = Math.max(1, Math.min(500, parseInt(limit) || 50));
    const pageOffset = Math.max(0, parseInt(offset) || 0);

    // Build where clause
    const where = {};
    if (status) where.status = status;
    if (payment_status) where.payment_status = payment_status;
    if (search) {
      where.OR = [
        { order_number: { contains: search } },
        { email: { contains: search } }
      ];
    }

    const orders = await prisma.orders.findMany({
      where,
      include: {
        customers: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true
          }
        },
        order_items: {
          select: {
            id: true,
            product_id: true,
            quantity: true,
            price: true
          }
        }
      },
      orderBy: { created_at: 'desc' },
      take: pageLimit,
      skip: pageOffset
    });

    const total = await prisma.orders.count({ where });

    res.json({
      data: orders,
      pagination: { total, limit: pageLimit, offset: pageOffset }
    });
  } catch (err) {
    console.error('List orders error:', err);
    res.status(500).json({ error: 'Failed to list orders' });
  }
});

/**
 * Update order status
 */
router.put('/:id/status', requireAuth, requireEditor, async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    const updated = await prisma.orders.update({
      where: { id: orderId },
      data: { status }
    });

    // If order is completed, create digital downloads for digital products
    if (status === 'completed') {
      const orderItems = await prisma.order_items.findMany({
        where: { order_id: orderId },
        include: {
          products: {
            select: {
              id: true,
              title: true,
              sku: true,
              is_digital: true,
              download_url: true,
              download_limit: true,
              download_expiry_days: true
            }
          }
        }
      });

      for (const item of orderItems) {
        const product = item.products;
        if (product && product.is_digital && product.download_url) {
          // Create digital download record
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + (product.download_expiry_days || 30));

          await prisma.digital_downloads.create({
            data: {
              order_id: orderId,
              product_id: product.id,
              customer_id: updated.customer_id,
              download_url: product.download_url,
              download_limit: product.download_limit || 5,
              expires_at: expiresAt
            }
          });

          console.log(`Created digital download for product ${product.title} (Order: ${orderId})`);
        }
      }
    }

    res.json(updated);
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Order not found' });
    }
    console.error('Update order status error:', err);
    res.status(500).json({ error: 'Failed to update order' });
  }
});

/**
 * Update payment status
 */
router.put('/:id/payment-status', requireAuth, requireEditor, async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);
    const { payment_status } = req.body;

    if (!payment_status) {
      return res.status(400).json({ error: 'Payment status is required' });
    }

    const updated = await prisma.orders.update({
      where: { id: orderId },
      data: {
        payment_status,
        status: payment_status === 'paid' ? 'processing' : undefined
      }
    });

    res.json(updated);
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Order not found' });
    }
    console.error('Update payment status error:', err);
    res.status(500).json({ error: 'Failed to update payment status' });
  }
});

/**
 * Add tracking information
 */
router.put('/:id/tracking', requireAuth, requireEditor, async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);
    const { tracking_number, shipping_method } = req.body;

    if (!tracking_number) {
      return res.status(400).json({ error: 'Tracking number is required' });
    }

    const updated = await prisma.orders.update({
      where: { id: orderId },
      data: {
        tracking_number,
        shipping_method: shipping_method || undefined,
        shipped_at: new Date(),
        status: 'shipped'
      },
      include: { customers: { select: { first_name: true, last_name: true } } }
    });

    // Send shipping notification email (fire-and-forget)
    sendEmail(updated.email, 'shipping-update', {
      order_number: updated.order_number,
      customer_name: [updated.customers?.first_name, updated.customers?.last_name].filter(Boolean).join(' ') || updated.email,
      tracking_number,
      shipping_method: shipping_method || 'Standard Shipping'
    });

    res.json(updated);
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Order not found' });
    }
    console.error('Add tracking error:', err);
    res.status(500).json({ error: 'Failed to add tracking' });
  }
});

export default router;
