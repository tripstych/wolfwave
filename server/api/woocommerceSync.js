/**
 * WooCommerce Sync API
 * Admin endpoints for syncing data between WolfWave and WooCommerce tables
 */

import express from 'express';
import woocommerceSync from '../services/woocommerceSync.js';

const router = express.Router();

/**
 * POST /api/woocommerce-sync/products
 * Sync all products to WooCommerce tables
 */
router.post('/products', async (req, res) => {
  try {
    const results = await woocommerceSync.syncAllProducts();
    
    const summary = {
      total: results.length,
      success: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    };

    res.json(summary);
  } catch (error) {
    console.error('Error syncing products:', error);
    res.status(500).json({ error: 'Failed to sync products' });
  }
});

/**
 * POST /api/woocommerce-sync/products/:id
 * Sync a single product to WooCommerce tables
 */
router.post('/products/:id', async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    const wcId = await woocommerceSync.syncProductToWooCommerce(productId);
    
    res.json({ 
      success: true, 
      productId, 
      woocommerceId: wcId 
    });
  } catch (error) {
    console.error('Error syncing product:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/woocommerce-sync/orders
 * Sync all orders to WooCommerce tables
 */
router.post('/orders', async (req, res) => {
  try {
    const results = await woocommerceSync.syncAllOrders();
    
    const summary = {
      total: results.length,
      success: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    };

    res.json(summary);
  } catch (error) {
    console.error('Error syncing orders:', error);
    res.status(500).json({ error: 'Failed to sync orders' });
  }
});

/**
 * POST /api/woocommerce-sync/orders/:id
 * Sync a single order to WooCommerce tables
 */
router.post('/orders/:id', async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);
    const wcId = await woocommerceSync.syncOrderToWooCommerce(orderId);
    
    res.json({ 
      success: true, 
      orderId, 
      woocommerceId: wcId 
    });
  } catch (error) {
    console.error('Error syncing order:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/woocommerce-sync/customers
 * Sync all customers to WooCommerce tables
 */
router.post('/customers', async (req, res) => {
  try {
    const results = await woocommerceSync.syncAllCustomers();
    
    const summary = {
      total: results.length,
      success: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    };

    res.json(summary);
  } catch (error) {
    console.error('Error syncing customers:', error);
    res.status(500).json({ error: 'Failed to sync customers' });
  }
});

/**
 * POST /api/woocommerce-sync/all
 * Sync everything (products, orders, customers)
 */
router.post('/all', async (req, res) => {
  try {
    const [products, orders, customers] = await Promise.all([
      woocommerceSync.syncAllProducts(),
      woocommerceSync.syncAllOrders(),
      woocommerceSync.syncAllCustomers()
    ]);

    const summary = {
      products: {
        total: products.length,
        success: products.filter(r => r.success).length,
        failed: products.filter(r => !r.success).length
      },
      orders: {
        total: orders.length,
        success: orders.filter(r => r.success).length,
        failed: orders.filter(r => !r.success).length
      },
      customers: {
        total: customers.length,
        success: customers.filter(r => r.success).length,
        failed: customers.filter(r => !r.success).length
      }
    };

    res.json(summary);
  } catch (error) {
    console.error('Error syncing all data:', error);
    res.status(500).json({ error: 'Failed to sync data' });
  }
});

export default router;
