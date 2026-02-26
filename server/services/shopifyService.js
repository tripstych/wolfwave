import fetch from 'node-fetch';
import { info, error as logError } from '../lib/logger.js';

/**
 * Shopify API Service
 * Handles authentication and API calls to Shopify Admin API
 * Supports both REST and GraphQL APIs
 */

class ShopifyService {
  constructor(shopDomain, accessToken, apiVersion = '2024-01') {
    this.shopDomain = shopDomain;
    this.accessToken = accessToken;
    this.apiVersion = apiVersion;
    this.baseUrl = `https://${shopDomain}/admin/api/${apiVersion}`;
  }

  /**
   * Make a REST API request to Shopify
   */
  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'X-Shopify-Access-Token': this.accessToken,
      'Content-Type': 'application/json',
      ...options.headers
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Shopify API error: ${response.status} - ${errorText}`);
      }

      return await response.json();
    } catch (err) {
      logError(null, err, `Shopify API request failed: ${endpoint}`);
      throw err;
    }
  }

  /**
   * Make a GraphQL request to Shopify
   */
  async graphql(query, variables = {}) {
    const url = `${this.baseUrl}/graphql.json`;
    const headers = {
      'X-Shopify-Access-Token': this.accessToken,
      'Content-Type': 'application/json'
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ query, variables })
      });

      const data = await response.json();

      if (data.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
      }

      return data.data;
    } catch (err) {
      logError(null, err, 'Shopify GraphQL request failed');
      throw err;
    }
  }

  // ========== PRODUCTS ==========

  /**
   * Get all products with pagination
   */
  async getProducts(params = {}) {
    const queryParams = new URLSearchParams({
      limit: params.limit || 50,
      ...params
    });

    return await this.request(`/products.json?${queryParams}`);
  }

  /**
   * Get a single product by ID
   */
  async getProduct(productId) {
    return await this.request(`/products/${productId}.json`);
  }

  /**
   * Create a new product
   */
  async createProduct(productData) {
    return await this.request('/products.json', {
      method: 'POST',
      body: JSON.stringify({ product: productData })
    });
  }

  /**
   * Update an existing product
   */
  async updateProduct(productId, productData) {
    return await this.request(`/products/${productId}.json`, {
      method: 'PUT',
      body: JSON.stringify({ product: productData })
    });
  }

  /**
   * Delete a product
   */
  async deleteProduct(productId) {
    return await this.request(`/products/${productId}.json`, {
      method: 'DELETE'
    });
  }

  /**
   * Get product variants
   */
  async getVariants(productId) {
    return await this.request(`/products/${productId}/variants.json`);
  }

  /**
   * Update inventory levels
   */
  async updateInventory(inventoryItemId, locationId, available) {
    return await this.request('/inventory_levels/set.json', {
      method: 'POST',
      body: JSON.stringify({
        inventory_item_id: inventoryItemId,
        location_id: locationId,
        available
      })
    });
  }

  // ========== COLLECTIONS ==========

  /**
   * Get all collections
   */
  async getCollections(params = {}) {
    const queryParams = new URLSearchParams({
      limit: params.limit || 50,
      ...params
    });

    return await this.request(`/custom_collections.json?${queryParams}`);
  }

  /**
   * Get products in a collection
   */
  async getCollectionProducts(collectionId) {
    return await this.request(`/collections/${collectionId}/products.json`);
  }

  // ========== ORDERS ==========

  /**
   * Get all orders
   */
  async getOrders(params = {}) {
    const queryParams = new URLSearchParams({
      limit: params.limit || 50,
      status: params.status || 'any',
      ...params
    });

    return await this.request(`/orders.json?${queryParams}`);
  }

  /**
   * Get a single order
   */
  async getOrder(orderId) {
    return await this.request(`/orders/${orderId}.json`);
  }

  /**
   * Create an order
   */
  async createOrder(orderData) {
    return await this.request('/orders.json', {
      method: 'POST',
      body: JSON.stringify({ order: orderData })
    });
  }

  /**
   * Update order status
   */
  async updateOrder(orderId, orderData) {
    return await this.request(`/orders/${orderId}.json`, {
      method: 'PUT',
      body: JSON.stringify({ order: orderData })
    });
  }

  // ========== CUSTOMERS ==========

  /**
   * Get all customers
   */
  async getCustomers(params = {}) {
    const queryParams = new URLSearchParams({
      limit: params.limit || 50,
      ...params
    });

    return await this.request(`/customers.json?${queryParams}`);
  }

  /**
   * Create a customer
   */
  async createCustomer(customerData) {
    return await this.request('/customers.json', {
      method: 'POST',
      body: JSON.stringify({ customer: customerData })
    });
  }

  /**
   * Update a customer
   */
  async updateCustomer(customerId, customerData) {
    return await this.request(`/customers/${customerId}.json`, {
      method: 'PUT',
      body: JSON.stringify({ customer: customerData })
    });
  }

  // ========== WEBHOOKS ==========

  /**
   * Create a webhook
   */
  async createWebhook(topic, address, format = 'json') {
    return await this.request('/webhooks.json', {
      method: 'POST',
      body: JSON.stringify({
        webhook: {
          topic,
          address,
          format
        }
      })
    });
  }

  /**
   * Get all webhooks
   */
  async getWebhooks() {
    return await this.request('/webhooks.json');
  }

  /**
   * Delete a webhook
   */
  async deleteWebhook(webhookId) {
    return await this.request(`/webhooks/${webhookId}.json`, {
      method: 'DELETE'
    });
  }

  // ========== UTILITY METHODS ==========

  /**
   * Test connection to Shopify store
   */
  async testConnection() {
    try {
      const response = await this.request('/shop.json');
      return {
        success: true,
        shop: response.shop
      };
    } catch (err) {
      return {
        success: false,
        error: err.message
      };
    }
  }

  /**
   * Get shop information
   */
  async getShopInfo() {
    return await this.request('/shop.json');
  }

  /**
   * Bulk import products using GraphQL
   */
  async bulkImportProducts(productIds) {
    const query = `
      mutation {
        bulkOperationRunQuery(
          query: """
          {
            products(query: "id:${productIds.join(' OR id:')}") {
              edges {
                node {
                  id
                  title
                  description
                  handle
                  vendor
                  productType
                  tags
                  variants(first: 100) {
                    edges {
                      node {
                        id
                        title
                        price
                        sku
                        inventoryQuantity
                      }
                    }
                  }
                  images(first: 10) {
                    edges {
                      node {
                        url
                        altText
                      }
                    }
                  }
                }
              }
            }
          }
          """
        ) {
          bulkOperation {
            id
            status
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    return await this.graphql(query);
  }
}

/**
 * Create a Shopify service instance from site settings
 */
export function createShopifyService(shopifyConfig) {
  if (!shopifyConfig || !shopifyConfig.shop_domain || !shopifyConfig.access_token) {
    throw new Error('Shopify configuration missing: shop_domain and access_token required');
  }

  return new ShopifyService(
    shopifyConfig.shop_domain,
    shopifyConfig.access_token,
    shopifyConfig.api_version || '2024-01'
  );
}

export default ShopifyService;
