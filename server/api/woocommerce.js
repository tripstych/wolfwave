/**
 * WooCommerce REST API v3 Compatibility Layer
 * 
 * Implements WooCommerce REST API endpoints that third-party integrations expect.
 * All requests are authenticated via OAuth 1.0a using consumer keys/secrets.
 */

import express from 'express';
import { query } from '../db/connection.js';
import woocommerceSync from '../services/woocommerceSync.js';

const router = express.Router();

/**
 * GET /wp-json/wc/v3/products
 * List all products
 */
router.get('/products', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const perPage = parseInt(req.query.per_page) || 10;
    const offset = (page - 1) * perPage;
    const search = req.query.search || '';
    const status = req.query.status || 'any';

    let whereClause = '1=1';
    const params = [];

    if (search) {
      whereClause += ' AND (p.title LIKE ? OR p.sku LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    if (status !== 'any') {
      whereClause += ' AND p.status = ?';
      params.push(status === 'publish' ? 'active' : status);
    }

    const products = await query(
      `SELECT p.*, c.data, c.title as content_title, c.slug,
              s.woocommerce_id as wc_id
       FROM products p
       LEFT JOIN content c ON p.content_id = c.id
       LEFT JOIN wc_wolfwave_sync s ON s.entity_type = 'product' AND s.wolfwave_id = p.id
       WHERE ${whereClause}
       ORDER BY p.id DESC
       LIMIT ? OFFSET ?`,
      [...params, perPage, offset]
    );

    const [countResult] = await query(
      `SELECT COUNT(*) as total FROM products p WHERE ${whereClause}`,
      params
    );

    const formattedProducts = products.map(p => formatProductForWooCommerce(p));

    res.set('X-WP-Total', countResult.total.toString());
    res.set('X-WP-TotalPages', Math.ceil(countResult.total / perPage).toString());
    res.json(formattedProducts);
  } catch (error) {
    console.error('WooCommerce API Error:', error);
    res.status(500).json({ code: 'server_error', message: error.message });
  }
});

/**
 * GET /wp-json/wc/v3/products/:id
 * Get a single product
 */
router.get('/products/:id', async (req, res) => {
  try {
    const wcId = parseInt(req.params.id);
    
    const [product] = await query(
      `SELECT p.*, c.data, c.title as content_title, c.slug,
              s.woocommerce_id as wc_id
       FROM products p
       LEFT JOIN content c ON p.content_id = c.id
       LEFT JOIN wc_wolfwave_sync s ON s.entity_type = 'product' AND s.wolfwave_id = p.id
       WHERE s.woocommerce_id = ?`,
      [wcId]
    );

    if (!product) {
      return res.status(404).json({ code: 'product_not_found', message: 'Product not found' });
    }

    res.json(formatProductForWooCommerce(product));
  } catch (error) {
    console.error('WooCommerce API Error:', error);
    res.status(500).json({ code: 'server_error', message: error.message });
  }
});

/**
 * POST /wp-json/wc/v3/products
 * Create a product
 */
router.post('/products', async (req, res) => {
  try {
    const { name, sku, regular_price, description, short_description, manage_stock, stock_quantity } = req.body;

    // Create content entry
    const contentResult = await query(
      `INSERT INTO content (module, title, slug, data, created_at, updated_at)
       VALUES ('products', ?, ?, ?, NOW(), NOW())`,
      [
        name,
        generateSlug(name),
        JSON.stringify({ description, short_description })
      ]
    );

    const contentId = contentResult.insertId;

    // Create product
    const productResult = await query(
      `INSERT INTO products (
        content_id, template_id, title, sku, price, inventory_quantity,
        inventory_tracking, status, created_at, updated_at
      ) VALUES (?, 1, ?, ?, ?, ?, ?, 'active', NOW(), NOW())`,
      [
        contentId,
        name,
        sku || `PROD-${Date.now()}`,
        regular_price || 0,
        stock_quantity || 0,
        manage_stock ? 1 : 0
      ]
    );

    const productId = productResult.insertId;

    // Sync to WooCommerce tables
    const wcId = await woocommerceSync.syncProductToWooCommerce(productId);

    // Fetch and return the created product
    const [product] = await query(
      `SELECT p.*, c.data, c.title as content_title, c.slug,
              s.woocommerce_id as wc_id
       FROM products p
       LEFT JOIN content c ON p.content_id = c.id
       LEFT JOIN wc_wolfwave_sync s ON s.entity_type = 'product' AND s.wolfwave_id = p.id
       WHERE p.id = ?`,
      [productId]
    );

    res.status(201).json(formatProductForWooCommerce(product));
  } catch (error) {
    console.error('WooCommerce API Error:', error);
    res.status(500).json({ code: 'server_error', message: error.message });
  }
});

/**
 * PUT /wp-json/wc/v3/products/:id
 * Update a product
 */
router.put('/products/:id', async (req, res) => {
  try {
    const wcId = parseInt(req.params.id);
    const { name, sku, regular_price, description, stock_quantity, stock_status } = req.body;

    // Find WolfWave product ID
    const [sync] = await query(
      `SELECT wolfwave_id FROM wc_wolfwave_sync 
       WHERE entity_type = 'product' AND woocommerce_id = ?`,
      [wcId]
    );

    if (!sync) {
      return res.status(404).json({ code: 'product_not_found', message: 'Product not found' });
    }

    const productId = sync.wolfwave_id;

    // Update product
    const updates = [];
    const params = [];

    if (name !== undefined) {
      updates.push('title = ?');
      params.push(name);
    }
    if (sku !== undefined) {
      updates.push('sku = ?');
      params.push(sku);
    }
    if (regular_price !== undefined) {
      updates.push('price = ?');
      params.push(regular_price);
    }
    if (stock_quantity !== undefined) {
      updates.push('inventory_quantity = ?');
      params.push(stock_quantity);
    }

    if (updates.length > 0) {
      params.push(productId);
      await query(
        `UPDATE products SET ${updates.join(', ')}, updated_at = NOW() WHERE id = ?`,
        params
      );
    }

    // Update content if description changed
    if (description !== undefined) {
      await query(
        `UPDATE content c
         JOIN products p ON c.id = p.content_id
         SET c.data = JSON_SET(COALESCE(c.data, '{}'), '$.description', ?),
             c.updated_at = NOW()
         WHERE p.id = ?`,
        [description, productId]
      );
    }

    // Re-sync to WooCommerce tables
    await woocommerceSync.syncProductToWooCommerce(productId);

    // Fetch and return updated product
    const [product] = await query(
      `SELECT p.*, c.data, c.title as content_title, c.slug,
              s.woocommerce_id as wc_id
       FROM products p
       LEFT JOIN content c ON p.content_id = c.id
       LEFT JOIN wc_wolfwave_sync s ON s.entity_type = 'product' AND s.wolfwave_id = p.id
       WHERE p.id = ?`,
      [productId]
    );

    res.json(formatProductForWooCommerce(product));
  } catch (error) {
    console.error('WooCommerce API Error:', error);
    res.status(500).json({ code: 'server_error', message: error.message });
  }
});

/**
 * DELETE /wp-json/wc/v3/products/:id
 * Delete a product
 */
router.delete('/products/:id', async (req, res) => {
  try {
    const wcId = parseInt(req.params.id);

    const [sync] = await query(
      `SELECT wolfwave_id FROM wc_wolfwave_sync 
       WHERE entity_type = 'product' AND woocommerce_id = ?`,
      [wcId]
    );

    if (!sync) {
      return res.status(404).json({ code: 'product_not_found', message: 'Product not found' });
    }

    const productId = sync.wolfwave_id;

    // Get product before deletion
    const [product] = await query(
      `SELECT p.*, c.data, c.title as content_title, c.slug
       FROM products p
       LEFT JOIN content c ON p.content_id = c.id
       WHERE p.id = ?`,
      [productId]
    );

    // Delete from WooCommerce tables
    await query(`DELETE FROM wp_postmeta WHERE post_id = ?`, [wcId]);
    await query(`DELETE FROM wp_posts WHERE ID = ?`, [wcId]);
    await query(`DELETE FROM wc_product_meta_lookup WHERE product_id = ?`, [wcId]);

    // Delete from WolfWave tables
    await query(`DELETE FROM products WHERE id = ?`, [productId]);
    await query(`DELETE FROM wc_wolfwave_sync WHERE entity_type = 'product' AND wolfwave_id = ?`, [productId]);

    res.json(formatProductForWooCommerce({ ...product, wc_id: wcId }));
  } catch (error) {
    console.error('WooCommerce API Error:', error);
    res.status(500).json({ code: 'server_error', message: error.message });
  }
});

/**
 * GET /wp-json/wc/v3/orders
 * List all orders
 */
router.get('/orders', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const perPage = parseInt(req.query.per_page) || 10;
    const offset = (page - 1) * perPage;
    const status = req.query.status || 'any';

    let whereClause = '1=1';
    const params = [];

    if (status !== 'any') {
      whereClause += ' AND o.status = ?';
      params.push(status);
    }

    const orders = await query(
      `SELECT o.*, c.email as customer_email, c.first_name, c.last_name,
              s.woocommerce_id as wc_id
       FROM orders o
       LEFT JOIN customers c ON o.customer_id = c.id
       LEFT JOIN wc_wolfwave_sync s ON s.entity_type = 'order' AND s.wolfwave_id = o.id
       WHERE ${whereClause}
       ORDER BY o.id DESC
       LIMIT ? OFFSET ?`,
      [...params, perPage, offset]
    );

    const [countResult] = await query(
      `SELECT COUNT(*) as total FROM orders o WHERE ${whereClause}`,
      params
    );

    const formattedOrders = await Promise.all(orders.map(o => formatOrderForWooCommerce(o)));

    res.set('X-WP-Total', countResult.total.toString());
    res.set('X-WP-TotalPages', Math.ceil(countResult.total / perPage).toString());
    res.json(formattedOrders);
  } catch (error) {
    console.error('WooCommerce API Error:', error);
    res.status(500).json({ code: 'server_error', message: error.message });
  }
});

/**
 * GET /wp-json/wc/v3/orders/:id
 * Get a single order
 */
router.get('/orders/:id', async (req, res) => {
  try {
    const wcId = parseInt(req.params.id);

    const [order] = await query(
      `SELECT o.*, c.email as customer_email, c.first_name, c.last_name,
              s.woocommerce_id as wc_id
       FROM orders o
       LEFT JOIN customers c ON o.customer_id = c.id
       LEFT JOIN wc_wolfwave_sync s ON s.entity_type = 'order' AND s.wolfwave_id = o.id
       WHERE s.woocommerce_id = ?`,
      [wcId]
    );

    if (!order) {
      return res.status(404).json({ code: 'order_not_found', message: 'Order not found' });
    }

    res.json(await formatOrderForWooCommerce(order));
  } catch (error) {
    console.error('WooCommerce API Error:', error);
    res.status(500).json({ code: 'server_error', message: error.message });
  }
});

/**
 * PUT /wp-json/wc/v3/orders/:id
 * Update an order (mainly status updates)
 */
router.put('/orders/:id', async (req, res) => {
  try {
    const wcId = parseInt(req.params.id);
    const { status } = req.body;

    const [sync] = await query(
      `SELECT wolfwave_id FROM wc_wolfwave_sync 
       WHERE entity_type = 'order' AND woocommerce_id = ?`,
      [wcId]
    );

    if (!sync) {
      return res.status(404).json({ code: 'order_not_found', message: 'Order not found' });
    }

    const orderId = sync.wolfwave_id;

    if (status) {
      const wolfwaveStatus = mapWooCommerceStatusToWolfWave(status);
      await query(
        `UPDATE orders SET status = ?, updated_at = NOW() WHERE id = ?`,
        [wolfwaveStatus, orderId]
      );

      // Re-sync to WooCommerce tables
      await woocommerceSync.syncOrderToWooCommerce(orderId);
    }

    // Fetch and return updated order
    const [order] = await query(
      `SELECT o.*, c.email as customer_email, c.first_name, c.last_name,
              s.woocommerce_id as wc_id
       FROM orders o
       LEFT JOIN customers c ON o.customer_id = c.id
       LEFT JOIN wc_wolfwave_sync s ON s.entity_type = 'order' AND s.wolfwave_id = o.id
       WHERE o.id = ?`,
      [orderId]
    );

    res.json(await formatOrderForWooCommerce(order));
  } catch (error) {
    console.error('WooCommerce API Error:', error);
    res.status(500).json({ code: 'server_error', message: error.message });
  }
});

/**
 * GET /wp-json/wc/v3/customers
 * List all customers
 */
router.get('/customers', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const perPage = parseInt(req.query.per_page) || 10;
    const offset = (page - 1) * perPage;

    const customers = await query(
      `SELECT c.*, s.woocommerce_id as wc_id
       FROM customers c
       LEFT JOIN wc_wolfwave_sync s ON s.entity_type = 'customer' AND s.wolfwave_id = c.id
       ORDER BY c.id DESC
       LIMIT ? OFFSET ?`,
      [perPage, offset]
    );

    const [countResult] = await query(`SELECT COUNT(*) as total FROM customers`);

    const formattedCustomers = customers.map(c => formatCustomerForWooCommerce(c));

    res.set('X-WP-Total', countResult.total.toString());
    res.set('X-WP-TotalPages', Math.ceil(countResult.total / perPage).toString());
    res.json(formattedCustomers);
  } catch (error) {
    console.error('WooCommerce API Error:', error);
    res.status(500).json({ code: 'server_error', message: error.message });
  }
});

/**
 * Format product for WooCommerce API response
 */
function formatProductForWooCommerce(product) {
  const contentData = product.data ? JSON.parse(product.data) : {};
  
  return {
    id: product.wc_id || product.id,
    name: product.content_title || product.title,
    slug: product.slug,
    permalink: `https://example.com/product/${product.slug}`,
    date_created: product.created_at,
    date_modified: product.updated_at,
    type: 'simple',
    status: product.status === 'active' ? 'publish' : 'draft',
    featured: false,
    catalog_visibility: 'visible',
    description: contentData.description || '',
    short_description: contentData.short_description || '',
    sku: product.sku,
    price: product.price.toString(),
    regular_price: product.price.toString(),
    sale_price: product.compare_at_price ? product.compare_at_price.toString() : '',
    on_sale: !!product.compare_at_price,
    purchasable: true,
    total_sales: 0,
    virtual: !product.requires_shipping,
    downloadable: product.is_digital || false,
    downloads: [],
    download_limit: product.download_limit || -1,
    download_expiry: product.download_expiry_days || -1,
    tax_status: product.taxable ? 'taxable' : 'none',
    tax_class: '',
    manage_stock: product.inventory_tracking || false,
    stock_quantity: product.inventory_quantity || 0,
    stock_status: (product.inventory_quantity || 0) > 0 ? 'instock' : 'outofstock',
    backorders: product.allow_backorder ? 'yes' : 'no',
    backorders_allowed: product.allow_backorder || false,
    backordered: false,
    sold_individually: false,
    weight: product.weight ? product.weight.toString() : '',
    dimensions: { length: '', width: '', height: '' },
    shipping_required: product.requires_shipping || false,
    shipping_taxable: product.taxable || false,
    shipping_class: '',
    shipping_class_id: 0,
    reviews_allowed: true,
    average_rating: '0.00',
    rating_count: 0,
    related_ids: [],
    upsell_ids: [],
    cross_sell_ids: [],
    parent_id: 0,
    purchase_note: '',
    categories: [],
    tags: [],
    images: contentData.images ? contentData.images.map((url, i) => ({
      id: i,
      src: url,
      name: product.title,
      alt: product.title
    })) : [],
    attributes: [],
    default_attributes: [],
    variations: [],
    grouped_products: [],
    menu_order: 0,
    meta_data: []
  };
}

/**
 * Format order for WooCommerce API response
 */
async function formatOrderForWooCommerce(order) {
  const billingAddress = JSON.parse(order.billing_address);
  const shippingAddress = JSON.parse(order.shipping_address);

  // Get order items
  const items = await query(
    `SELECT * FROM order_items WHERE order_id = ?`,
    [order.id]
  );

  const lineItems = items.map(item => ({
    id: item.id,
    name: item.product_title,
    product_id: item.product_id,
    variation_id: item.variant_id || 0,
    quantity: item.quantity,
    tax_class: '',
    subtotal: item.subtotal.toString(),
    subtotal_tax: '0.00',
    total: item.subtotal.toString(),
    total_tax: '0.00',
    taxes: [],
    meta_data: [],
    sku: item.sku,
    price: parseFloat(item.price)
  }));

  return {
    id: order.wc_id || order.id,
    parent_id: 0,
    number: order.order_number,
    order_key: `wc_order_${order.order_number}`,
    created_via: 'rest-api',
    version: '3.0.0',
    status: order.status,
    currency: 'USD',
    date_created: order.created_at,
    date_modified: order.updated_at,
    discount_total: order.discount.toString(),
    discount_tax: '0.00',
    shipping_total: order.shipping.toString(),
    shipping_tax: '0.00',
    cart_tax: order.tax.toString(),
    total: order.total.toString(),
    total_tax: order.tax.toString(),
    prices_include_tax: false,
    customer_id: order.customer_id,
    customer_ip_address: '',
    customer_user_agent: '',
    customer_note: order.customer_note || '',
    billing: {
      first_name: billingAddress.first_name || '',
      last_name: billingAddress.last_name || '',
      company: billingAddress.company || '',
      address_1: billingAddress.address1 || '',
      address_2: billingAddress.address2 || '',
      city: billingAddress.city || '',
      state: billingAddress.province || '',
      postcode: billingAddress.postal_code || '',
      country: billingAddress.country || '',
      email: order.email,
      phone: billingAddress.phone || ''
    },
    shipping: {
      first_name: shippingAddress.first_name || '',
      last_name: shippingAddress.last_name || '',
      company: shippingAddress.company || '',
      address_1: shippingAddress.address1 || '',
      address_2: shippingAddress.address2 || '',
      city: shippingAddress.city || '',
      state: shippingAddress.province || '',
      postcode: shippingAddress.postal_code || '',
      country: shippingAddress.country || ''
    },
    payment_method: order.payment_method,
    payment_method_title: order.payment_method.charAt(0).toUpperCase() + order.payment_method.slice(1),
    transaction_id: order.payment_intent_id || order.paypal_order_id || '',
    date_paid: order.payment_status === 'paid' ? order.created_at : null,
    date_completed: order.status === 'completed' ? order.updated_at : null,
    cart_hash: '',
    meta_data: [],
    line_items: lineItems,
    tax_lines: [],
    shipping_lines: [],
    fee_lines: [],
    coupon_lines: [],
    refunds: []
  };
}

/**
 * Format customer for WooCommerce API response
 */
function formatCustomerForWooCommerce(customer) {
  return {
    id: customer.wc_id || customer.id,
    date_created: customer.created_at,
    date_modified: customer.updated_at,
    email: customer.email,
    first_name: customer.first_name || '',
    last_name: customer.last_name || '',
    role: 'customer',
    username: customer.email,
    billing: {
      first_name: customer.first_name || '',
      last_name: customer.last_name || '',
      company: '',
      address_1: '',
      address_2: '',
      city: '',
      state: '',
      postcode: '',
      country: '',
      email: customer.email,
      phone: customer.phone || ''
    },
    shipping: {
      first_name: customer.first_name || '',
      last_name: customer.last_name || '',
      company: '',
      address_1: '',
      address_2: '',
      city: '',
      state: '',
      postcode: '',
      country: ''
    },
    is_paying_customer: false,
    avatar_url: '',
    meta_data: []
  };
}

/**
 * Map WooCommerce status to WolfWave status
 */
function mapWooCommerceStatusToWolfWave(wcStatus) {
  const statusMap = {
    'pending': 'pending',
    'processing': 'processing',
    'on-hold': 'pending',
    'completed': 'completed',
    'cancelled': 'cancelled',
    'refunded': 'refunded',
    'failed': 'cancelled'
  };
  return statusMap[wcStatus] || 'pending';
}

/**
 * Generate slug from name
 */
function generateSlug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export default router;
