/**
 * ShipStation API Service (Push-based)
 *
 * Pushes orders from WolfWave to ShipStation using their API.
 * Auth: API-Key header
 * Base URL: https://ssapi.shipstation.com
 */

import axios from 'axios';
import { query } from '../db/connection.js';

const BASE_URL = 'https://ssapi.shipstation.com';

/**
 * Get ShipStation API key from settings table
 */
async function getApiKey() {
  const rows = await query(
    "SELECT setting_value FROM settings WHERE setting_key = 'shipstation_auth_key'"
  );
  return rows[0]?.setting_value || process.env.SHIPSTATION_API_KEY || null;
}

/**
 * Make an authenticated request to ShipStation API
 */
async function request(method, path, data = null) {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error('ShipStation API key not configured');
  }

  const config = {
    method,
    url: `${BASE_URL}${path}`,
    headers: {
      'API-Key': apiKey,
      'Content-Type': 'application/json'
    }
  };

  if (data && (method === 'post' || method === 'put')) {
    config.data = data;
  }

  if (data && method === 'get') {
    config.params = data;
  }

  const response = await axios(config);
  return response.data;
}

/**
 * Map WolfWave order status to ShipStation status
 */
function mapOrderStatus(status) {
  const statusMap = {
    'pending': 'awaiting_payment',
    'processing': 'awaiting_shipment',
    'shipped': 'shipped',
    'completed': 'shipped',
    'cancelled': 'cancelled',
    'refunded': 'cancelled'
  };
  return statusMap[status] || 'awaiting_shipment';
}

/**
 * Map a WolfWave JSON address to ShipStation address format
 */
function mapAddress(addr) {
  if (!addr) return { name: '', street1: '', city: '', state: '', postalCode: '', country: 'US' };

  const parsed = typeof addr === 'string' ? JSON.parse(addr) : addr;

  return {
    name: [parsed.first_name, parsed.last_name].filter(Boolean).join(' '),
    company: parsed.company || null,
    street1: parsed.address1 || parsed.street1 || '',
    street2: parsed.address2 || parsed.street2 || null,
    street3: null,
    city: parsed.city || '',
    state: parsed.province || parsed.state || '',
    postalCode: parsed.postal_code || parsed.zip || parsed.postalCode || '',
    country: parsed.country || 'US',
    phone: parsed.phone || null,
    residential: null
  };
}

/**
 * Transform a WolfWave order (with items and customer) into ShipStation format
 */
function transformOrder(order, orderItems, customer) {
  const billing = mapAddress(order.billing_address);
  const shipping = mapAddress(order.shipping_address);

  return {
    orderNumber: order.order_number || `WW-${order.id}`,
    orderKey: `wolfwave_${order.id}`,
    orderDate: new Date(order.created_at).toISOString(),
    orderStatus: mapOrderStatus(order.status),
    customerEmail: order.email || customer?.email || '',
    customerUsername: order.email || customer?.email || '',
    billTo: billing,
    shipTo: shipping,
    items: orderItems.map(item => ({
      lineItemKey: `ww_item_${item.id}`,
      sku: item.sku || '',
      name: item.product_title || item.name || '',
      quantity: item.quantity,
      unitPrice: parseFloat(item.price) || 0,
      weight: item.weight ? {
        value: parseFloat(item.weight),
        units: 'ounces'
      } : null,
      imageUrl: item.image || null
    })),
    amountPaid: parseFloat(order.total) || 0,
    taxAmount: parseFloat(order.tax) || 0,
    shippingAmount: parseFloat(order.shipping) || 0,
    customerNotes: order.customer_note || '',
    internalNotes: order.internal_note || '',
    paymentMethod: order.payment_method || '',
    requestedShippingService: order.shipping_method || '',
    advancedOptions: {
      source: 'WolfWave'
    }
  };
}

/**
 * Push a single order to ShipStation
 */
export async function pushOrder(order, orderItems, customer) {
  const payload = transformOrder(order, orderItems, customer);
  return await request('post', '/orders/createorder', payload);
}

/**
 * Get an order from ShipStation by its ShipStation order ID
 */
export async function getOrder(shipstationOrderId) {
  return await request('get', `/orders/${shipstationOrderId}`);
}

/**
 * List orders from ShipStation with optional filters
 */
export async function listOrders(params = {}) {
  return await request('get', '/orders', params);
}

/**
 * Test the API connection
 */
export async function testConnection() {
  return await request('get', '/warehouses');
}

export default { pushOrder, getOrder, listOrders, testConnection };
