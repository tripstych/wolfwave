/**
 * ShipStation Integration API
 * 
 * Mimics the WooCommerce ShipStation plugin behavior to allow ShipStation
 * to connect directly to WolfWave without needing WooCommerce.
 * 
 * Endpoints:
 * - GET /wc-api/v3/?action=export&auth_key=XXX&start_date=...&end_date=...
 * - POST /wc-api/v3/?action=shipnotify&auth_key=XXX
 */

import express from 'express';
import crypto from 'crypto';
import { queryRaw } from '../lib/queryRaw.js';
import { trackModuleUsage } from '../services/moduleManager.js';

const router = express.Router();

const EXPORT_LIMIT = 100;

/**
 * Authenticate ShipStation request using auth_key
 */
function authenticateShipStation(req, res, next) {
  const authKey = req.query.auth_key;
  
  if (!authKey) {
    return res.status(401).type('text/xml').send(
      '<?xml version="1.0" encoding="UTF-8"?><error>Authentication key is required</error>'
    );
  }

  const validKey = process.env.SHIPSTATION_AUTH_KEY;

  if (!validKey) {
    console.error('SHIPSTATION_AUTH_KEY is not configured');
    return res.status(500).type('text/xml').send(
      '<?xml version="1.0" encoding="UTF-8"?><error>Server authentication not configured</error>'
    );
  }

  // Timing-safe comparison to prevent timing attacks
  const keyBuffer = Buffer.from(authKey);
  const validBuffer = Buffer.from(validKey);
  if (keyBuffer.length !== validBuffer.length || !crypto.timingSafeEqual(keyBuffer, validBuffer)) {
    return res.status(401).type('text/xml').send(
      '<?xml version="1.0" encoding="UTF-8"?><error>Invalid authentication key</error>'
    );
  }

  next();
}

/**
 * Parse ShipStation date format to timestamp
 * ShipStation sends dates in PST/PDT timezone in format: MMDDYYYY or MMDDYYYYxHHMM or standard date strings
 */
function parseShipStationDate(dateString) {
  if (!dateString) return null;

  // Handle compact format (MMDDYYYY or MMDDYYYYxHHMM)
  if (!/[:\-\/]/.test(dateString)) {
    const month = dateString.substring(0, 2);
    const day = dateString.substring(2, 4);
    const year = dateString.substring(4, 8);
    
    // Check if time component exists (position 8 should be 'x' or similar separator)
    if (dateString.length > 8 && dateString[8] !== undefined) {
      const time = dateString.substring(9, 13) || '0000';
      dateString = `${year}-${month}-${day} ${time.substring(0, 2)}:${time.substring(2, 4)}:00`;
    } else {
      // No time component - use start of day
      dateString = `${year}-${month}-${day} 00:00:00`;
    }
  }

  try {
    // ShipStation uses PST/PDT (America/Los_Angeles)
    const date = new Date(dateString + ' PST');
    if (isNaN(date.getTime())) {
      return null;
    }
    return date.toISOString();
  } catch (e) {
    return null;
  }
}

/**
 * Build XML for a single order
 */
function buildOrderXML(order, orderItems, customer) {
  const cdata = (str) => `<![CDATA[${str || ''}]]>`;

  let xml = '  <Order>\n';
  xml += `    <OrderNumber>${cdata(order.order_number || order.id)}</OrderNumber>\n`;
  xml += `    <OrderID>${order.id}</OrderID>\n`;
  xml += `    <OrderDate>${new Date(order.created_at).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', hour12: false }).replace(',', '')}</OrderDate>\n`;
  xml += `    <OrderStatus>${cdata(order.status)}</OrderStatus>\n`;
  xml += `    <PaymentMethod>${cdata(order.payment_method || '')}</PaymentMethod>\n`;
  xml += `    <OrderPaymentMethodTitle>${cdata(order.payment_method || '')}</OrderPaymentMethodTitle>\n`;
  xml += `    <LastModified>${new Date(order.updated_at).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', hour12: false }).replace(',', '')}</LastModified>\n`;
  xml += `    <ShippingMethod>${cdata(order.shipping_method || '')}</ShippingMethod>\n`;
  xml += `    <CurrencyCode>${order.currency || 'USD'}</CurrencyCode>\n`;
  xml += `    <OrderTotal>${order.total}</OrderTotal>\n`;
  xml += `    <TaxAmount>${order.tax_total || 0}</TaxAmount>\n`;
  xml += `    <ShippingAmount>${order.shipping_total || 0}</ShippingAmount>\n`;
  xml += `    <CustomerNotes>${cdata(order.customer_note || '')}</CustomerNotes>\n`;
  xml += `    <InternalNotes>${cdata(order.notes || '')}</InternalNotes>\n`;
  
  // Customer data
  xml += '    <Customer>\n';
  xml += `      <CustomerCode>${cdata(customer?.email || order.email)}</CustomerCode>\n`;
  xml += '      <BillTo>\n';
  xml += `        <Name>${cdata((order.billing_first_name || '') + ' ' + (order.billing_last_name || ''))}</Name>\n`;
  xml += `        <Company>${cdata(order.billing_company || '')}</Company>\n`;
  xml += `        <Phone>${cdata(order.billing_phone || '')}</Phone>\n`;
  xml += `        <Email>${cdata(order.billing_email || customer?.email || '')}</Email>\n`;
  xml += '      </BillTo>\n';
  xml += '      <ShipTo>\n';
  xml += `        <Name>${cdata((order.shipping_first_name || '') + ' ' + (order.shipping_last_name || ''))}</Name>\n`;
  xml += `        <Company>${cdata(order.shipping_company || '')}</Company>\n`;
  xml += `        <Address1>${cdata(order.shipping_address1 || '')}</Address1>\n`;
  xml += `        <Address2>${cdata(order.shipping_address2 || '')}</Address2>\n`;
  xml += `        <City>${cdata(order.shipping_city || '')}</City>\n`;
  xml += `        <State>${cdata(order.shipping_state || '')}</State>\n`;
  xml += `        <PostalCode>${cdata(order.shipping_zip || '')}</PostalCode>\n`;
  xml += `        <Country>${cdata(order.shipping_country || '')}</Country>\n`;
  xml += `        <Phone>${cdata(order.shipping_phone || order.billing_phone || '')}</Phone>\n`;
  xml += '      </ShipTo>\n';
  xml += '    </Customer>\n';

  // Items
  xml += '    <Items>\n';
  for (const item of orderItems) {
    xml += '      <Item>\n';
    xml += `        <LineItemID>${item.id}</LineItemID>\n`;
    xml += `        <SKU>${cdata(item.sku || '')}</SKU>\n`;
    xml += `        <Name>${cdata(item.name)}</Name>\n`;
    xml += `        <ImageUrl>${cdata(item.image_url || '')}</ImageUrl>\n`;
    xml += `        <Weight>${item.weight || 0}</Weight>\n`;
    xml += `        <WeightUnits>Pounds</WeightUnits>\n`;
    xml += `        <Quantity>${item.quantity}</Quantity>\n`;
    xml += `        <UnitPrice>${item.price}</UnitPrice>\n`;
    xml += '      </Item>\n';
  }
  xml += '    </Items>\n';
  
  xml += '  </Order>\n';
  
  return xml;
}

/**
 * Shared export handler for both GET and POST
 */
async function handleExport(req, res) {
  const { start_date, end_date, page = 1 } = req.query;

  try {
    if (!start_date || !end_date) {
      return res.status(400).type('text/xml').send(
        '<?xml version="1.0" encoding="UTF-8"?><error>start_date and end_date are required</error>'
      );
    }

    const startDate = parseShipStationDate(decodeURIComponent(start_date));
    const endDate = parseShipStationDate(decodeURIComponent(end_date));

    if (!startDate || !endDate) {
      return res.status(400).type('text/xml').send(
        '<?xml version="1.0" encoding="UTF-8"?><error>Invalid date format</error>'
      );
    }

    const pageNum = Math.max(1, parseInt(page));
    const offset = (pageNum - 1) * EXPORT_LIMIT;

    // Get orders within date range
    const orders = await queryRaw(`
      SELECT * FROM orders
      WHERE updated_at >= ? AND updated_at <= ?
      AND status IN ('pending', 'processing', 'on-hold', 'completed')
      ORDER BY updated_at DESC
      LIMIT ? OFFSET ?
    `, startDate, endDate, EXPORT_LIMIT, offset);

    // Get total count for pagination
    const [countResult] = await queryRaw(`
      SELECT COUNT(*) as total FROM orders
      WHERE updated_at >= ? AND updated_at <= ?
      AND status IN ('pending', 'processing', 'on-hold', 'completed')
    `, startDate, endDate);

    const totalOrders = countResult?.total || 0;
    const totalPages = Math.ceil(totalOrders / EXPORT_LIMIT);

    // Build XML response
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += `<Orders page="${pageNum}" pages="${totalPages}">\n`;

    for (const order of orders) {
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

      xml += buildOrderXML(order, orderItems, customer);
    }

    xml += '</Orders>';

    res.type('text/xml').send(xml);
    console.log(`ShipStation: Exported ${orders.length} orders via ${req.method} (page ${pageNum}/${totalPages})`);
    
    // Track usage for the first customer in the order set (for analytics)
    if (orders.length > 0 && orders[0].customer_id) {
      await trackModuleUsage(orders[0].customer_id, 'shipstation', 'export', orders.length);
    }
  } catch (error) {
    console.error('ShipStation export error:', error);
    res.status(500).type('text/xml').send(
      '<?xml version="1.0" encoding="UTF-8"?><error>Internal server error</error>'
    );
  }
}

/**
 * GET /wc-api/v3/?action=export
 * Export orders to ShipStation in XML format
 */
router.get('/', authenticateShipStation, async (req, res) => {
  const { action } = req.query;

  if (action !== 'export') {
    return res.status(400).type('text/xml').send(
      '<?xml version="1.0" encoding="UTF-8"?><error>Invalid action</error>'
    );
  }

  await handleExport(req, res);
});

/**
 * POST /wc-api/v3/?action=export or action=shipnotify
 * ShipStation uses POST for test connections and shipnotify
 */
router.post('/', authenticateShipStation, async (req, res) => {
  const { action } = req.query;

  if (action === 'export') {
    return await handleExport(req, res);
  }

  if (action === 'shipnotify') {
    try {
      // req.body is available as text/xml when express raw body middleware is configured,
      // or as parsed object. Get raw XML from the body.
      const xmlData = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || '');

      // TODO: Parse XML and update order with tracking information
      // You can use xml2js or similar library to parse the XML
      console.log('ShipStation shipnotify received:', xmlData);

      res.type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><success>true</success>');
    } catch (error) {
      console.error('ShipStation shipnotify error:', error);
      res.status(500).type('text/xml').send(
        '<?xml version="1.0" encoding="UTF-8"?><error>Failed to process notification</error>'
      );
    }
    return;
  }

  res.status(400).type('text/xml').send(
    '<?xml version="1.0" encoding="UTF-8"?><error>Invalid action</error>'
  );
});

export default router;
