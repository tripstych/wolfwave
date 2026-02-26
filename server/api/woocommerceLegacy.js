/**
 * WooCommerce Legacy XML API
 * 
 * ShipStation and some other integrations use the old WooCommerce XML API
 * in addition to the REST API. This provides that legacy endpoint.
 */

import express from 'express';
import prisma from '../lib/prisma.js';
import crypto from 'crypto';

const router = express.Router();

/**
 * Helper to execute raw SQL queries safely
 */
async function queryRaw(sql, ...params) {
  try {
    const results = await prisma.$queryRawUnsafe(sql, ...params);
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
 * Basic Auth middleware for legacy API
 */
async function authenticateLegacy(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return res.status(401).send('Unauthorized');
  }

  const credentials = Buffer.from(authHeader.substring(6), 'base64').toString();
  const [username, password] = credentials.split(':');

  // Check if it's a valid API key
  const [apiKey] = await queryRaw(
    `SELECT * FROM woocommerce_api_keys WHERE truncated_key = ? OR consumer_key = ?`,
    password, username
  );

  if (!apiKey) {
    return res.status(401).send('Unauthorized');
  }

  req.apiKey = apiKey;
  next();
}

/**
 * GET /wc-api/v3/orders
 * Legacy XML orders endpoint for ShipStation
 */
router.get('/orders', authenticateLegacy, async (req, res) => {
  try {
    // Get orders from WooCommerce tables
    const orders = await queryRaw(`
      SELECT p.*, pm.meta_value as order_data
      FROM wp_posts p
      LEFT JOIN wp_postmeta pm ON p.ID = pm.post_id AND pm.meta_key = '_order_data'
      WHERE p.post_type = 'shop_order'
      ORDER BY p.post_date DESC
      LIMIT 100
    `);

    // Build XML response
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<orders>\n';

    for (const order of orders) {
      const orderData = order.order_data ? JSON.parse(order.order_data) : {};
      
      xml += '  <order>\n';
      xml += `    <order_id>${order.ID}</order_id>\n`;
      xml += `    <order_number>${order.ID}</order_number>\n`;
      xml += `    <order_date>${order.post_date}</order_date>\n`;
      xml += `    <status>${order.post_status}</status>\n`;
      xml += `    <total>${orderData.total || '0.00'}</total>\n`;
      xml += `    <currency>${orderData.currency || 'USD'}</currency>\n`;
      
      // Customer info
      xml += '    <customer>\n';
      xml += `      <email>${orderData.billing?.email || ''}</email>\n`;
      xml += `      <first_name>${orderData.billing?.first_name || ''}</first_name>\n`;
      xml += `      <last_name>${orderData.billing?.last_name || ''}</last_name>\n`;
      xml += '    </customer>\n';
      
      // Shipping address
      xml += '    <shipping_address>\n';
      xml += `      <first_name>${orderData.shipping?.first_name || ''}</first_name>\n`;
      xml += `      <last_name>${orderData.shipping?.last_name || ''}</last_name>\n`;
      xml += `      <address_1>${orderData.shipping?.address_1 || ''}</address_1>\n`;
      xml += `      <address_2>${orderData.shipping?.address_2 || ''}</address_2>\n`;
      xml += `      <city>${orderData.shipping?.city || ''}</city>\n`;
      xml += `      <state>${orderData.shipping?.state || ''}</state>\n`;
      xml += `      <postcode>${orderData.shipping?.postcode || ''}</postcode>\n`;
      xml += `      <country>${orderData.shipping?.country || ''}</country>\n`;
      xml += '    </shipping_address>\n';
      
      xml += '  </order>\n';
    }

    xml += '</orders>';

    res.set('Content-Type', 'application/xml');
    res.send(xml);
  } catch (error) {
    console.error('Legacy API error:', error);
    res.status(500).send('<?xml version="1.0"?><error>Internal Server Error</error>');
  }
});

export default router;
