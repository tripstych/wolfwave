/**
 * ShipStation API Service
 *
 * Full integration with ShipStation's API.
 * Auth: API-Key header
 * Base URL: https://ssapi.shipstation.com
 * Rate limit: 40 requests/minute
 */

import axios from 'axios';
import { query, queryDb } from '../db/connection.js';
import { getCurrentDbName } from '../lib/tenantContext.js';

const BASE_URL = 'https://ssapi.shipstation.com';

/**
 * Get ShipStation API credentials from settings table
 */
async function getApiCredentials(dbName) {
  const rows = await queryDb(
    dbName,
    "SELECT setting_key, setting_value FROM settings WHERE setting_key IN ('shipstation_auth_key', 'shipstation_api_secret')"
  );
  
  const creds = rows.reduce((acc, row) => {
    acc[row.setting_key] = row.setting_value;
    return acc;
  }, {});

  return {
    key: creds.shipstation_auth_key || process.env.SHIPSTATION_API_KEY,
    secret: creds.shipstation_api_secret || process.env.SHIPSTATION_API_SECRET
  };
}

/**
 * Make an authenticated request to ShipStation API
 */
async function request(method, path, data = null) {
  const dbName = getCurrentDbName();
  const { key, secret } = await getApiCredentials(dbName);
  if (!key || !secret) {
    throw new Error('ShipStation API Key and Secret are not configured');
  }

  const authString = Buffer.from(`${key}:${secret}`).toString('base64');

  const config = {
    method,
    url: `${BASE_URL}${path}`,
    headers: {
      'Authorization': `Basic ${authString}`,
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

  const response = await axios(config);
  return response.data;
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
export function transformOrder(order, orderItems, customer) {
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

// ─── Orders ──────────────────────────────────────────────────────────

export async function createOrder(order, orderItems, customer) {
  const payload = transformOrder(order, orderItems, customer);
  return await request('post', '/orders/createorder', payload);
}

export async function getOrder(orderId) {
  return await request('get', `/orders/${orderId}`);
}

export async function listOrders(params = {}) {
  return await request('get', '/orders', params);
}

export async function deleteOrder(orderId) {
  return await request('delete', `/orders/${orderId}`);
}

export async function holdOrder(orderId, holdUntilDate) {
  return await request('post', `/orders/holduntil`, { orderId, holdUntilDate });
}

export async function restoreOrder(orderId) {
  return await request('post', `/orders/restorefromhold`, { orderId });
}

export async function assignTag(orderId, tagId) {
  return await request('post', '/orders/addtag', { orderId, tagId });
}

export async function removeTag(orderId, tagId) {
  return await request('post', '/orders/removetag', { orderId, tagId });
}

export async function markAsShipped(orderId, carrierCode, shipDate, trackingNumber, notifyCustomer = true, notifySalesChannel = true) {
  return await request('post', '/orders/markasshipped', {
    orderId,
    carrierCode,
    shipDate,
    trackingNumber,
    notifyCustomer,
    notifySalesChannel
  });
}

// ─── Shipments ───────────────────────────────────────────────────────

export async function listShipments(params = {}) {
  return await request('get', '/shipments', params);
}

export async function getShippingRates(rateOptions) {
  return await request('post', '/shipments/getrates', rateOptions);
}

export async function createLabel(labelData) {
  return await request('post', '/shipments/createlabel', labelData);
}

export async function voidLabel(shipmentId) {
  return await request('post', '/shipments/voidlabel', { shipmentId });
}

// ─── Carriers ────────────────────────────────────────────────────────

export async function listCarriers() {
  return await request('get', '/carriers');
}

export async function getCarrier(carrierCode) {
  return await request('get', `/carriers/getcarrier`, { carrierCode });
}

export async function listCarrierServices(carrierCode) {
  return await request('get', '/carriers/listservices', { carrierCode });
}

export async function listCarrierPackages(carrierCode) {
  return await request('get', '/carriers/listpackages', { carrierCode });
}

// ─── Warehouses ──────────────────────────────────────────────────────

export async function listWarehouses() {
  return await request('get', '/warehouses');
}

export async function createWarehouse(warehouseData) {
  return await request('post', '/warehouses/createwarehouse', warehouseData);
}

export async function updateWarehouse(warehouseData) {
  return await request('put', `/warehouses/${warehouseData.warehouseId}`, warehouseData);
}

export async function deleteWarehouse(warehouseId) {
  return await request('delete', `/warehouses/${warehouseId}`);
}

// ─── Products ────────────────────────────────────────────────────────

export async function listProducts(params = {}) {
  return await request('get', '/products', params);
}

export async function getProduct(productId) {
  return await request('get', `/products/${productId}`);
}

export async function updateProduct(productId, productData) {
  return await request('put', `/products/${productId}`, productData);
}

// ─── Customers ───────────────────────────────────────────────────────

export async function listCustomers(params = {}) {
  return await request('get', '/customers', params);
}

export async function getCustomer(customerId) {
  return await request('get', `/customers/${customerId}`);
}

// ─── Stores ──────────────────────────────────────────────────────────

export async function listStores() {
  return await request('get', '/stores');
}

export async function getStore(storeId) {
  return await request('get', `/stores/${storeId}`);
}

export async function refreshStore(storeId, refreshDate) {
  return await request('put', `/stores/${storeId}/refreshstore`, { storeId, refreshDate });
}

// ─── Fulfillments ────────────────────────────────────────────────────

export async function listFulfillments(params = {}) {
  return await request('get', '/fulfillments', params);
}

// ─── Webhooks ────────────────────────────────────────────────────────

export async function listWebhooks() {
  return await request('get', '/webhooks');
}

export async function subscribeWebhook(targetUrl, event, storeId = null) {
  return await request('post', '/webhooks/subscribe', {
    target_url: targetUrl,
    event,
    store_id: storeId
  });
}

export async function unsubscribeWebhook(webhookId) {
  return await request('delete', `/webhooks/${webhookId}`);
}

// ─── Tags ────────────────────────────────────────────────────────────

export async function listTags() {
  return await request('get', '/accounts/listtags');
}

// ─── Test Connection ─────────────────────────────────────────────────

export async function testConnection() {
  return await request('get', '/warehouses');
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
