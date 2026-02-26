/**
 * ShipStation REST API Integration
 * 
 * Handles the WooCommerce ShipStation plugin's REST API endpoints
 * that ShipStation uses for modern integrations.
 * 
 * Endpoints:
 * - GET /wp-json/wc-shipstation/v1/orders
 */

import express from 'express';
import prisma from '../lib/prisma.js';
import { trackModuleUsage } from '../services/moduleManager.js';
import { authenticateWooCommerce } from '../middleware/woocommerceAuth.js';

const router = express.Router();

/**
 * Helper to execute raw SQL queries safely
 */
async function queryRaw(sql, ...params) {
  try {
    const results = params.length > 0 
      ? await prisma.$queryRawUnsafe(sql, ...params)
      : await prisma.$queryRawUnsafe(sql);
    const converted = JSON.parse(JSON.stringify(results, (key, value) =>
      typeof value === 'bigint' ? Number(value) : value
    ));
    return Array.isArray(converted) ? converted : [];
  } catch (error) {
    console.error('Query error:', error);
    throw error;
  }
}

/**
 * GET /wp-json/wc-shipstation/v1/orders
 * Return orders in JSON format for ShipStation
 * Authentication is handled at router level
 */
router.get('/orders', async (req, res) => {
  try {
    const { modified_after, page = 1, per_page = 100 } = req.query;
    
    if (!modified_after) {
      return res.status(400).json({ 
        code: 'rest_missing_callback_param',
        message: 'Missing parameter(s): modified_after',
        data: { status: 400 }
      });
    }

    const modifiedAfter = new Date(modified_after);
    if (isNaN(modifiedAfter.getTime())) {
      return res.status(400).json({
        code: 'rest_invalid_param',
        message: 'Invalid parameter(s): modified_after',
        data: { status: 400 }
      });
    }

    const pageNum = Math.max(1, parseInt(page));
    const perPage = Math.min(100, Math.max(1, parseInt(per_page)));
    const offset = (pageNum - 1) * perPage;

    // Get orders modified after the specified date
    const orders = await queryRaw(`
      SELECT * FROM orders
      WHERE updated_at >= ?
      AND status IN ('pending', 'processing', 'on-hold', 'completed')
      ORDER BY updated_at DESC
      LIMIT ? OFFSET ?
    `, modifiedAfter.toISOString(), perPage, offset);

    // Get total count
    const [countResult] = await queryRaw(`
      SELECT COUNT(*) as total FROM orders
      WHERE updated_at >= ?
      AND status IN ('pending', 'processing', 'on-hold', 'completed')
    `, modifiedAfter.toISOString());

    const totalOrders = countResult?.total || 0;
    const totalPages = Math.ceil(totalOrders / perPage);

    // Build JSON response
    const ordersData = await Promise.all(orders.map(async (order) => {
      // Get order items
      const orderItems = await queryRaw(`
        SELECT oi.*, p.sku, p.image_url, p.weight
        FROM order_items oi
        LEFT JOIN products p ON oi.product_id = p.id
        WHERE oi.order_id = ?
      `, order.id);

      // Get customer
      const [customer] = await queryRaw(`
        SELECT * FROM customers WHERE id = ?
      `, order.customer_id);

      return {
        id: order.id,
        order_number: order.order_number || order.id.toString(),
        order_key: `wc_order_${order.id}`,
        created_via: 'wolfwave',
        version: '1.0',
        status: order.status,
        currency: order.currency || 'USD',
        date_created: order.created_at,
        date_created_gmt: order.created_at,
        date_modified: order.updated_at,
        date_modified_gmt: order.updated_at,
        discount_total: '0.00',
        discount_tax: '0.00',
        shipping_total: order.shipping_total || '0.00',
        shipping_tax: '0.00',
        cart_tax: order.tax_total || '0.00',
        total: order.total,
        total_tax: order.tax_total || '0.00',
        prices_include_tax: false,
        customer_id: order.customer_id || 0,
        customer_ip_address: '',
        customer_user_agent: '',
        customer_note: order.customer_note || '',
        billing: {
          first_name: order.billing_first_name || '',
          last_name: order.billing_last_name || '',
          company: order.billing_company || '',
          address_1: order.billing_address1 || '',
          address_2: order.billing_address2 || '',
          city: order.billing_city || '',
          state: order.billing_state || '',
          postcode: order.billing_zip || '',
          country: order.billing_country || '',
          email: order.billing_email || customer?.email || '',
          phone: order.billing_phone || ''
        },
        shipping: {
          first_name: order.shipping_first_name || '',
          last_name: order.shipping_last_name || '',
          company: order.shipping_company || '',
          address_1: order.shipping_address1 || '',
          address_2: order.shipping_address2 || '',
          city: order.shipping_city || '',
          state: order.shipping_state || '',
          postcode: order.shipping_zip || '',
          country: order.shipping_country || '',
          phone: order.shipping_phone || order.billing_phone || ''
        },
        payment_method: order.payment_method || '',
        payment_method_title: order.payment_method || '',
        transaction_id: order.transaction_id || '',
        line_items: orderItems.map((item, index) => ({
          id: item.id,
          name: item.name,
          product_id: item.product_id || 0,
          variation_id: 0,
          quantity: item.quantity,
          tax_class: '',
          subtotal: (item.price * item.quantity).toFixed(2),
          subtotal_tax: '0.00',
          total: (item.price * item.quantity).toFixed(2),
          total_tax: '0.00',
          taxes: [],
          meta_data: [],
          sku: item.sku || '',
          price: item.price,
          image: item.image_url ? { src: item.image_url } : null,
          weight: item.weight || null
        })),
        shipping_lines: order.shipping_method ? [{
          id: 1,
          method_title: order.shipping_method,
          method_id: order.shipping_method.toLowerCase().replace(/\s+/g, '_'),
          total: order.shipping_total || '0.00',
          total_tax: '0.00',
          taxes: []
        }] : [],
        meta_data: []
      };
    }));

    // Set pagination headers
    res.set('X-WP-Total', totalOrders.toString());
    res.set('X-WP-TotalPages', totalPages.toString());

    res.json(ordersData);
    
    console.log(`ShipStation REST: Exported ${ordersData.length} orders (page ${pageNum}/${totalPages})`);
    
    // Track usage
    if (ordersData.length > 0 && ordersData[0].customer_id) {
      await trackModuleUsage(ordersData[0].customer_id, 'shipstation', 'rest_export', ordersData.length);
    }
  } catch (error) {
    console.error('ShipStation REST export error:', error);
    res.status(500).json({
      code: 'rest_internal_error',
      message: 'Internal server error',
      data: { status: 500 }
    });
  }
});

export default router;
