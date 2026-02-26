/**
 * WooCommerce Legacy XML API
 * 
 * ShipStation and some other integrations use the old WooCommerce XML API
 * in addition to the REST API. This provides that legacy endpoint.
 */

import express from 'express';
import crypto from 'crypto';
import { queryRaw } from '../lib/queryRaw.js';

const router = express.Router();

/**
 * Hash a consumer secret for comparison against stored hash.
 */
function hashSecret(secret) {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

/**
 * Basic Auth middleware for legacy API
 * Username = consumer_key, Password = consumer_secret
 */
async function authenticateLegacy(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return res.status(401).send('Unauthorized');
  }

  const credentials = Buffer.from(authHeader.substring(6), 'base64').toString();
  const [consumerKey, consumerSecret] = credentials.split(':');

  if (!consumerKey || !consumerSecret) {
    return res.status(401).send('Unauthorized');
  }

  // Look up API key by consumer_key
  const [apiKey] = await queryRaw(
    `SELECT * FROM woocommerce_api_keys WHERE consumer_key = ?`,
    consumerKey
  );

  if (!apiKey) {
    return res.status(401).send('Unauthorized');
  }

  // Verify consumer_secret (stored as SHA256 hash)
  const providedHash = hashSecret(consumerSecret);
  const storedHash = apiKey.consumer_secret;
  const hashesMatch = providedHash.length === storedHash.length
    && crypto.timingSafeEqual(Buffer.from(providedHash), Buffer.from(storedHash));
  if (!hashesMatch) {
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
    const cdata = (str) => `<![CDATA[${str || ''}]]>`;

    // Get orders from WolfWave orders table
    const orders = await queryRaw(`
      SELECT o.*, c.email as customer_email, c.first_name, c.last_name
      FROM orders o
      LEFT JOIN customers c ON o.customer_id = c.id
      WHERE o.status IN ('pending', 'processing', 'on-hold', 'completed')
      ORDER BY o.created_at DESC
      LIMIT 100
    `);

    // Build XML response
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<orders>\n';

    for (const order of orders) {
      // Parse JSON address fields
      let billing = {};
      let shipping = {};
      try {
        billing = typeof order.billing_address === 'string'
          ? JSON.parse(order.billing_address) : (order.billing_address || {});
        shipping = typeof order.shipping_address === 'string'
          ? JSON.parse(order.shipping_address) : (order.shipping_address || {});
      } catch (e) {
        console.error('Error parsing address JSON:', e);
      }

      xml += '  <order>\n';
      xml += `    <order_id>${order.id}</order_id>\n`;
      xml += `    <order_number>${cdata(order.order_number || order.id)}</order_number>\n`;
      xml += `    <order_date>${order.created_at}</order_date>\n`;
      xml += `    <status>${cdata(order.status)}</status>\n`;
      xml += `    <total>${order.total || '0.00'}</total>\n`;
      xml += `    <currency>${order.currency || 'USD'}</currency>\n`;
      
      // Customer info
      xml += '    <customer>\n';
      xml += `      <email>${cdata(order.email || order.customer_email || '')}</email>\n`;
      xml += `      <first_name>${cdata(billing.first_name || order.first_name || '')}</first_name>\n`;
      xml += `      <last_name>${cdata(billing.last_name || order.last_name || '')}</last_name>\n`;
      xml += '    </customer>\n';
      
      // Shipping address
      xml += '    <shipping_address>\n';
      xml += `      <first_name>${cdata(shipping.first_name || '')}</first_name>\n`;
      xml += `      <last_name>${cdata(shipping.last_name || '')}</last_name>\n`;
      xml += `      <address_1>${cdata(shipping.address1 || '')}</address_1>\n`;
      xml += `      <address_2>${cdata(shipping.address2 || '')}</address_2>\n`;
      xml += `      <city>${cdata(shipping.city || '')}</city>\n`;
      xml += `      <state>${cdata(shipping.province || shipping.state || '')}</state>\n`;
      xml += `      <postcode>${cdata(shipping.postal_code || shipping.zip || '')}</postcode>\n`;
      xml += `      <country>${cdata(shipping.country || '')}</country>\n`;
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
