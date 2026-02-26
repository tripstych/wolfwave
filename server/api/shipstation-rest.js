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
import { queryRaw } from '../lib/queryRaw.js';
import { trackModuleUsage } from '../services/moduleManager.js';

const router = express.Router();

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

      // Parse JSON address fields - raw queries return JSON as strings
      let billingAddress = {};
      let shippingAddress = {};
      
      try {
        billingAddress = typeof order.billing_address === 'string' 
          ? JSON.parse(order.billing_address) 
          : (order.billing_address || {});
        shippingAddress = typeof order.shipping_address === 'string'
          ? JSON.parse(order.shipping_address)
          : (order.shipping_address || {});
      } catch (e) {
        console.error('Error parsing address JSON:', e);
      }

      return {
        id: order.id,
        order_number: order.order_number || order.id.toString(),
        order_key: `wc_order_${order.id}`,
        created_via: 'wolfwave',
        version: '1.0',
        status: order.status,
        currency: 'USD',
        date_created: order.created_at,
        date_created_gmt: order.created_at,
        date_modified: order.updated_at,
        date_modified_gmt: order.updated_at,
        discount_total: order.discount?.toString() || '0.00',
        discount_tax: '0.00',
        shipping_total: order.shipping?.toString() || '0.00',
        shipping_tax: '0.00',
        cart_tax: order.tax?.toString() || '0.00',
        total: order.total?.toString() || '0.00',
        total_tax: order.tax?.toString() || '0.00',
        prices_include_tax: false,
        customer_id: order.customer_id || 0,
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
          state: billingAddress.province || billingAddress.state || '',
          postcode: billingAddress.postal_code || billingAddress.zip || '',
          country: billingAddress.country || '',
          email: order.email || customer?.email || '',
          phone: billingAddress.phone || ''
        },
        shipping: {
          first_name: shippingAddress.first_name || '',
          last_name: shippingAddress.last_name || '',
          company: shippingAddress.company || '',
          address_1: shippingAddress.address1 || '',
          address_2: shippingAddress.address2 || '',
          city: shippingAddress.city || '',
          state: shippingAddress.province || shippingAddress.state || '',
          postcode: shippingAddress.postal_code || shippingAddress.zip || '',
          country: shippingAddress.country || '',
          phone: shippingAddress.phone || billingAddress.phone || ''
        },
        payment_method: order.payment_method || '',
        payment_method_title: order.payment_method || '',
        transaction_id: order.payment_intent_id || '',
        line_items: orderItems.map((item, index) => ({
          id: item.id,
          name: item.product_title || item.name || '',
          product_id: item.product_id || 0,
          variation_id: item.variant_id || 0,
          quantity: item.quantity,
          tax_class: '',
          subtotal: item.subtotal?.toString() || '0.00',
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

    // Set WooCommerce REST API headers
    res.set('X-WP-Total', totalOrders.toString());
    res.set('X-WP-TotalPages', totalPages.toString());
    res.set('Content-Type', 'application/json; charset=utf-8');
    res.set('X-Content-Type-Options', 'nosniff');
    
    // Add Link header for pagination if there are multiple pages
    if (totalPages > 1) {
      const baseUrl = `${req.protocol}://${req.get('host')}${req.path}`;
      const links = [];
      
      if (pageNum < totalPages) {
        links.push(`<${baseUrl}?modified_after=${modified_after}&page=${pageNum + 1}&per_page=${perPage}>; rel="next"`);
      }
      if (pageNum > 1) {
        links.push(`<${baseUrl}?modified_after=${modified_after}&page=${pageNum - 1}&per_page=${perPage}>; rel="prev"`);
      }
      
      if (links.length > 0) {
        res.set('Link', links.join(', '));
      }
    }

    res.status(200).json(ordersData);
    
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
