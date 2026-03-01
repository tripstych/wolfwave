/**
 * ShipStation API Service
 *
 * Full integration with ShipStation's API.
 * Auth: API-Key header
 * Base URL: https://api.shipstation.com
 * Rate limit: 40 requests/minute
 */

import axios from 'axios';
import { queryDb } from '../db/connection.js';
import { getCurrentDbName } from '../lib/tenantContext.js';

const BASE_URL = 'https://api.shipstation.com';

/**
 * Get ShipStation API key from a specific tenant's settings table
 */
async function getApiKey(dbName) {
  const rows = await queryDb(
    dbName,
    "SELECT setting_value FROM settings WHERE setting_key = 'shipstation_api_key'"
  );
  return rows[0]?.setting_value || process.env.SHIPSTATION_API_KEY || null;
}

/**
 * Make an authenticated request to ShipStation API for the current tenant
 */
async function request(method, path, data = null) {
  const dbName = getCurrentDbName();
  const apiKey = await getApiKey(dbName);
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

  if (method === 'delete') {
    // delete requests don't have a body
  }

  try {
    const response = await axios(config);
    return response.data;
  } catch (err) {
    // Sanitize error to prevent leaking auth headers in logs
    if (err.config?.headers?.Authorization) {
      delete err.config.headers.Authorization;
    }
    throw err;
  }
}

// ─── Address & Order Mapping ─────────────────────────────────────────

/**
 * Map WolfWave order status to ShipStation status
 */
export function mapOrderStatus(status) {
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
export function mapAddress(addr) {
  if (!addr) return { name: '', street1: '', city: '', state: '', postal_code: '', country: 'US' };

  const parsed = typeof addr === 'string' ? JSON.parse(addr) : addr;

  return {
    name: [parsed.first_name, parsed.last_name].filter(Boolean).join(' '),
    company: parsed.company || null,
    street1: parsed.address1 || parsed.street1 || '',
    street2: parsed.address2 || parsed.street2 || null,
    street3: null,
    city: parsed.city || '',
    state: parsed.province || parsed.state || '',
    postal_code: parsed.postal_code || parsed.zip || parsed.postalCode || '',
    country: parsed.country || 'US',
    phone: parsed.phone || null,
    residential: null
  };
}

/**
 * Transform a WolfWave order (with items and customer) into ShipStation format
 */
export function transformOrder(order, orderItems, customer) {
  const billing = mapAddress(order.billing_address);
  const shipping = mapAddress(order.shipping_address);

  return {
    order_number: order.order_number || `WW-${order.id}`,
    order_date: new Date(order.created_at).toISOString(),
    order_status: mapOrderStatus(order.status),
    customer_email: order.email || customer?.email || '',
    bill_to: billing,
    ship_to: shipping,
    items: orderItems.map(item => ({
      line_item_key: `ww_item_${item.id}`,
      sku: item.sku || '',
      name: item.product_title || item.name || '',
      quantity: item.quantity,
      unit_price: parseFloat(item.price) || 0,
      weight: item.weight ? {
        value: parseFloat(item.weight),
        units: 'ounces'
      } : null,
      image_url: item.image || null
    })),
    amount_paid: parseFloat(order.total) || 0,
    tax_amount: parseFloat(order.tax) || 0,
    shipping_amount: parseFloat(order.shipping) || 0,
    customer_notes: order.customer_note || '',
    internal_notes: order.internal_note || '',
    payment_method: order.payment_method || '',
    requested_shipping_service: order.shipping_method || '',
    advanced_options: {
      source: 'WolfWave'
    }
  };
}

// ─── Orders ──────────────────────────────────────────────────────────

export async function createOrder(order, orderItems, customer) {
  const payload = transformOrder(order, orderItems, customer);
  return await request('post', '/v2/orders', payload);
}

export async function getOrder(orderId) {
  return await request('get', `/v2/orders/${orderId}`);
}

export async function listOrders(params = {}) {
  return await request('get', '/v2/orders', params);
}

export async function deleteOrder(orderId) {
  return await request('delete', `/v2/orders/${orderId}`);
}

export async function holdOrder(orderId, holdUntilDate) {
  return await request('post', `/v2/orders/${orderId}/hold`, { hold_until_date: holdUntilDate });
}

export async function restoreOrder(orderId) {
  return await request('post', `/v2/orders/${orderId}/unhold`);
}

export async function assignTag(orderId, tagId) {
  return await request('post', `/v2/orders/${orderId}/tags`, { tag_id: tagId });
}

export async function removeTag(orderId, tagId) {
  return await request('delete', `/v2/orders/${orderId}/tags/${tagId}`);
}

export async function markAsShipped(orderId, carrierCode, shipDate, trackingNumber, notifyCustomer = true, notifySalesChannel = true) {
  return await request('post', `/v2/orders/${orderId}/mark_as_shipped`, {
    carrier_code: carrierCode,
    ship_date: shipDate,
    tracking_number: trackingNumber,
    notify_customer: notifyCustomer,
    notify_sales_channel: notifySalesChannel
  });
}

// ─── Shipments ───────────────────────────────────────────────────────

export async function listShipments(params = {}) {
  return await request('get', '/v2/shipments', params);
}

export async function getShippingRates(rateOptions) {
  return await request('post', '/v2/rates', rateOptions);
}

export async function createLabel(labelData) {
  return await request('post', '/v2/labels', labelData);
}

export async function voidLabel(shipmentId) {
  return await request('put', `/v2/labels/${shipmentId}/void`);
}

export async function cancelShipment(shipmentId) {
  return await request('get', `/v2/shipments/${shipmentId}/cancel`);
}

// ─── Carriers ────────────────────────────────────────────────────────

export async function listCarriers() {
  return await request('get', '/v2/carriers');
}

export async function getCarrier(carrierCode) {
  return await request('get', `/v2/carriers/${carrierCode}`);
}

export async function listCarrierServices(carrierCode) {
  return await request('get', `/v2/carriers/${carrierCode}/services`);
}

export async function listCarrierPackages(carrierCode) {
  return await request('get', `/v2/carriers/${carrierCode}/packages`);
}

// ─── Warehouses ──────────────────────────────────────────────────────

export async function listWarehouses() {
  return await request('get', '/v2/warehouses');
}

export async function createWarehouse(warehouseData) {
  return await request('post', '/v2/warehouses', warehouseData);
}

export async function updateWarehouse(warehouseData) {
  return await request('put', `/v2/warehouses/${warehouseData.warehouseId}`, warehouseData);
}

export async function deleteWarehouse(warehouseId) {
  return await request('delete', `/v2/warehouses/${warehouseId}`);
}

// ─── Products ────────────────────────────────────────────────────────

export async function listProducts(params = {}) {
  return await request('get', '/v2/products', params);
}

export async function getProduct(productId) {
  return await request('get', `/v2/products/${productId}`);
}

export async function updateProduct(productId, productData) {
  return await request('put', `/v2/products/${productId}`, productData);
}

// ─── Customers ───────────────────────────────────────────────────────

export async function listCustomers(params = {}) {
  return await request('get', '/v2/customers', params);
}

export async function getCustomer(customerId) {
  return await request('get', `/v2/customers/${customerId}`);
}

// ─── Stores ──────────────────────────────────────────────────────────

export async function listStores() {
  return await request('get', '/v2/stores');
}

export async function getStore(storeId) {
  return await request('get', `/v2/stores/${storeId}`);
}

export async function refreshStore(storeId, refreshDate) {
  return await request('put', `/v2/stores/${storeId}/refresh`, { refresh_date: refreshDate });
}

// ─── Fulfillments ────────────────────────────────────────────────────

export async function listFulfillments(params = {}) {
  return await request('get', '/v2/fulfillments', params);
}

// ─── Webhooks ────────────────────────────────────────────────────────

export async function listWebhooks() {
  return await request('get', '/v2/environment/webhooks');
}

export async function subscribeWebhook(targetUrl, event, storeId = null) {
  return await request('post', '/v2/environment/webhooks', {
    url: targetUrl,
    event,
    store_id: storeId
  });
}

export async function unsubscribeWebhook(webhookId) {
  return await request('delete', `/v2/environment/webhooks/${webhookId}`);
}

// ─── Tags ────────────────────────────────────────────────────────────

export async function listTags() {
  return await request('get', '/v2/tags');
}

// ─── Test Connection ─────────────────────────────────────────────────

export async function testConnection() {
  return await request('get', '/v2/carriers');
}

export default {
  // Orders
  createOrder, getOrder, listOrders, deleteOrder,
  holdOrder, restoreOrder, assignTag, removeTag, markAsShipped,
  // Shipments & Rates
  listShipments, getShippingRates, createLabel, voidLabel,
  // Carriers
  listCarriers, getCarrier, listCarrierServices, listCarrierPackages,
  // Warehouses
  listWarehouses, createWarehouse, updateWarehouse, deleteWarehouse,
  // Products
  listProducts, getProduct, updateProduct,
  // Customers
  listCustomers, getCustomer,
  // Stores
  listStores, getStore, refreshStore,
  // Fulfillments
  listFulfillments,
  // Webhooks
  listWebhooks, subscribeWebhook, unsubscribeWebhook,
  // Tags
  listTags,
  // Utils
  testConnection, transformOrder, mapAddress, mapOrderStatus
};
