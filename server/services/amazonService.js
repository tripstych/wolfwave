import axios from 'axios';
import { query } from '../db/connection.js';
import { logInfo, logError } from '../lib/logger.js';

const REGION_ENDPOINTS = {
  na: 'https://sellingpartnerapi-na.amazon.com',
  eu: 'https://sellingpartnerapi-eu.amazon.com',
  fe: 'https://sellingpartnerapi-fe.amazon.com',
};

const MARKETPLACE_IDS = {
  'US': 'ATVPDKIKX0DER',
  'CA': 'A2EUQ1WTGCTBG2',
  'MX': 'A1AM78C64UM0Y8',
  'UK': 'A1F83G8C2ARO7P',
  'DE': 'A1PA6795UKMFR9',
  'FR': 'A13V1IB3VIYZZH',
  'IT': 'APJ6JRA9NG5V4',
  'ES': 'A1RKKUPIHCS9HS',
  'JP': 'A1VC38T7YXB528',
  'AU': 'A39IBJ37TRP1C6',
};

let cachedToken = null;
let tokenExpiry = 0;

async function getAmazonSettings() {
  const rows = await query(
    "SELECT setting_key, setting_value FROM settings WHERE setting_key LIKE 'amazon_%'"
  );
  const settings = {};
  for (const row of rows) {
    settings[row.setting_key] = row.setting_value;
  }
  return settings;
}

async function getAccessToken(settings) {
  if (cachedToken && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  const { amazon_client_id, amazon_client_secret, amazon_refresh_token } = settings;
  if (!amazon_client_id || !amazon_client_secret || !amazon_refresh_token) {
    throw new Error('Amazon SP-API credentials not configured. Set client ID, client secret, and refresh token in Settings.');
  }

  const resp = await axios.post('https://api.amazon.com/auth/o2/token', {
    grant_type: 'refresh_token',
    refresh_token: amazon_refresh_token,
    client_id: amazon_client_id,
    client_secret: amazon_client_secret,
  });

  cachedToken = resp.data.access_token;
  // Expire 60s early to be safe
  tokenExpiry = Date.now() + (resp.data.expires_in - 60) * 1000;
  return cachedToken;
}

function getEndpoint(region) {
  return REGION_ENDPOINTS[region] || REGION_ENDPOINTS.na;
}

async function spApiRequest(method, path, { params, data } = {}) {
  const settings = await getAmazonSettings();
  const token = await getAccessToken(settings);
  const baseUrl = getEndpoint(settings.amazon_region);

  const resp = await axios({
    method,
    url: `${baseUrl}${path}`,
    headers: {
      'x-amz-access-token': token,
      'Content-Type': 'application/json',
    },
    params,
    data,
  });

  return resp.data;
}

// ---- Public API ----

export async function testConnection() {
  const settings = await getAmazonSettings();
  if (!settings.amazon_client_id || !settings.amazon_refresh_token) {
    return { connected: false, error: 'Credentials not configured' };
  }
  try {
    await getAccessToken(settings);
    return { connected: true, seller_id: settings.amazon_seller_id, region: settings.amazon_region };
  } catch (err) {
    return { connected: false, error: err.response?.data?.error_description || err.message };
  }
}

export async function getListings({ maxResults = 20, nextToken } = {}) {
  const settings = await getAmazonSettings();
  const marketplaceId = settings.amazon_marketplace_id || MARKETPLACE_IDS['US'];

  const params = {
    marketplaceIds: marketplaceId,
    maxResultsPerPage: maxResults,
    includedData: 'summaries,attributes,images,productTypes,salesRanks',
  };
  if (nextToken) params.pageToken = nextToken;

  // Use Catalog Items API v2022-04-01
  const data = await spApiRequest('GET', '/catalog/2022-04-01/items', {
    params: {
      ...params,
      sellerId: settings.amazon_seller_id,
    },
  });

  return {
    items: (data.items || []).map(item => ({
      asin: item.asin,
      title: item.summaries?.[0]?.itemName || '',
      brand: item.summaries?.[0]?.brand || '',
      images: (item.images?.[0]?.images || []).map(img => img.link),
      productType: item.productTypes?.[0]?.productType || '',
      salesRank: item.salesRanks?.[0]?.displayGroupRanks?.[0]?.rank,
    })),
    nextToken: data.pagination?.nextToken,
  };
}

export async function searchCatalog(keywords, { maxResults = 20, nextToken } = {}) {
  const settings = await getAmazonSettings();
  const marketplaceId = settings.amazon_marketplace_id || MARKETPLACE_IDS['US'];

  const data = await spApiRequest('GET', '/catalog/2022-04-01/items', {
    params: {
      marketplaceIds: marketplaceId,
      keywords,
      maxResultsPerPage: maxResults,
      includedData: 'summaries,images',
      ...(nextToken ? { pageToken: nextToken } : {}),
    },
  });

  return {
    items: (data.items || []).map(item => ({
      asin: item.asin,
      title: item.summaries?.[0]?.itemName || '',
      brand: item.summaries?.[0]?.brand || '',
      images: (item.images?.[0]?.images || []).map(img => img.link),
    })),
    nextToken: data.pagination?.nextToken,
  };
}

export async function getListingByAsin(asin) {
  const settings = await getAmazonSettings();
  const marketplaceId = settings.amazon_marketplace_id || MARKETPLACE_IDS['US'];

  const data = await spApiRequest('GET', `/catalog/2022-04-01/items/${asin}`, {
    params: {
      marketplaceIds: marketplaceId,
      includedData: 'summaries,attributes,images,productTypes,dimensions',
    },
  });

  return data;
}

export async function getInventory({ nextToken, skus } = {}) {
  const settings = await getAmazonSettings();
  const marketplaceId = settings.amazon_marketplace_id || MARKETPLACE_IDS['US'];

  const params = {
    details: true,
    marketplaceIds: marketplaceId,
    granularityType: 'Marketplace',
    granularityId: marketplaceId,
  };
  if (nextToken) params.nextToken = nextToken;
  if (skus && skus.length) params.sellerSkus = skus.join(',');

  const data = await spApiRequest('GET', '/fba/inventory/v1/summaries', { params });

  return {
    items: (data.payload?.inventorySummaries || []).map(inv => ({
      asin: inv.asin,
      fnsku: inv.fnSku,
      sku: inv.sellerSku,
      productName: inv.productName,
      fulfillableQuantity: inv.inventoryDetails?.fulfillableQuantity || 0,
      inboundQuantity: inv.inventoryDetails?.inboundWorkingQuantity || 0,
      reservedQuantity: inv.inventoryDetails?.reservedQuantity?.totalReservedQuantity || 0,
      totalQuantity: inv.totalQuantity || 0,
    })),
    nextToken: data.pagination?.nextToken,
  };
}

export async function getOrders({ createdAfter, maxResults = 50, nextToken } = {}) {
  const settings = await getAmazonSettings();
  const marketplaceId = settings.amazon_marketplace_id || MARKETPLACE_IDS['US'];

  const params = {
    MarketplaceIds: marketplaceId,
    MaxResultsPerPage: maxResults,
  };
  if (createdAfter) params.CreatedAfter = createdAfter;
  if (nextToken) params.NextToken = nextToken;

  const data = await spApiRequest('GET', '/orders/v0/orders', { params });

  return {
    orders: (data.payload?.Orders || []).map(order => ({
      amazonOrderId: order.AmazonOrderId,
      status: order.OrderStatus,
      purchaseDate: order.PurchaseDate,
      totalAmount: order.OrderTotal?.Amount,
      currency: order.OrderTotal?.CurrencyCode,
      buyerEmail: order.BuyerInfo?.BuyerEmail,
      shippingAddress: order.ShippingAddress ? {
        name: order.ShippingAddress.Name,
        city: order.ShippingAddress.City,
        state: order.ShippingAddress.StateOrRegion,
        postalCode: order.ShippingAddress.PostalCode,
        country: order.ShippingAddress.CountryCode,
      } : null,
      fulfillmentChannel: order.FulfillmentChannel,
      numberOfItems: order.NumberOfItemsShipped + order.NumberOfItemsUnshipped,
    })),
    nextToken: data.payload?.NextToken,
  };
}

export async function getOrderItems(amazonOrderId) {
  const data = await spApiRequest('GET', `/orders/v0/orders/${amazonOrderId}/orderItems`);

  return (data.payload?.OrderItems || []).map(item => ({
    asin: item.ASIN,
    sku: item.SellerSKU,
    title: item.Title,
    quantity: item.QuantityOrdered,
    price: item.ItemPrice?.Amount,
    currency: item.ItemPrice?.CurrencyCode,
  }));
}

export { MARKETPLACE_IDS };
