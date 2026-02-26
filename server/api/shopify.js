import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { createShopifyService } from '../services/shopifyService.js';
import prisma from '../lib/prisma.js';
import { error as logError, info } from '../lib/logger.js';
import crypto from 'crypto';

const router = Router();

/**
 * Get Shopify configuration for current site
 */
router.get('/config', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { site } = res.locals;

    const config = await prisma.shopify_config.findUnique({
      where: { site_id: site.id },
      select: {
        id: true,
        shop_domain: true,
        api_version: true,
        sync_enabled: true,
        sync_frequency: true,
        last_sync_at: true,
        created_at: true,
        updated_at: true
        // Don't return access tokens
      }
    });

    res.json({ config });
  } catch (err) {
    logError(req, err, 'Failed to get Shopify config');
    res.status(500).json({ error: 'Failed to get configuration' });
  }
});

/**
 * Save or update Shopify configuration
 */
router.post('/config', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { site } = res.locals;
    const { shop_domain, access_token, storefront_access_token, api_version, sync_enabled, sync_frequency } = req.body;

    if (!shop_domain || !access_token) {
      return res.status(400).json({ error: 'shop_domain and access_token are required' });
    }

    // Test connection before saving
    const shopify = new (await import('../services/shopifyService.js')).default(shop_domain, access_token, api_version);
    const testResult = await shopify.testConnection();

    if (!testResult.success) {
      return res.status(400).json({ error: 'Failed to connect to Shopify: ' + testResult.error });
    }

    // Generate webhook secret
    const webhook_secret = crypto.randomBytes(32).toString('hex');

    const config = await prisma.shopify_config.upsert({
      where: { site_id: site.id },
      create: {
        site_id: site.id,
        shop_domain,
        access_token,
        storefront_access_token,
        api_version: api_version || '2024-01',
        sync_enabled: sync_enabled !== false,
        sync_frequency: sync_frequency || 'hourly',
        webhook_secret
      },
      update: {
        shop_domain,
        access_token,
        storefront_access_token,
        api_version: api_version || '2024-01',
        sync_enabled: sync_enabled !== false,
        sync_frequency: sync_frequency || 'hourly'
      }
    });

    info(req, `Shopify configuration saved for ${shop_domain}`);

    res.json({
      success: true,
      config: {
        id: config.id,
        shop_domain: config.shop_domain,
        api_version: config.api_version,
        sync_enabled: config.sync_enabled,
        sync_frequency: config.sync_frequency
      },
      shop: testResult.shop
    });
  } catch (err) {
    logError(req, err, 'Failed to save Shopify config');
    res.status(500).json({ error: err.message });
  }
});

/**
 * Test Shopify connection
 */
router.post('/test-connection', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { shop_domain, access_token, api_version } = req.body;

    if (!shop_domain || !access_token) {
      return res.status(400).json({ error: 'shop_domain and access_token are required' });
    }

    const shopify = new (await import('../services/shopifyService.js')).default(shop_domain, access_token, api_version);
    const result = await shopify.testConnection();

    res.json(result);
  } catch (err) {
    logError(req, err, 'Shopify connection test failed');
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Import products from Shopify
 */
router.post('/import/products', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { site } = res.locals;
    const { limit, collection_id } = req.body;

    const config = await prisma.shopify_config.findUnique({
      where: { site_id: site.id }
    });

    if (!config) {
      return res.status(400).json({ error: 'Shopify not configured for this site' });
    }

    const shopify = createShopifyService(config);

    // Create sync log entry
    const syncLog = await prisma.shopify_sync_log.create({
      data: {
        site_id: site.id,
        sync_type: 'products',
        sync_direction: 'import',
        status: 'running'
      }
    });

    // Start import in background
    importProductsFromShopify(site.id, shopify, syncLog.id, { limit, collection_id }).catch(err => {
      logError(req, err, 'Background product import failed');
    });

    res.json({
      success: true,
      message: 'Product import started',
      sync_log_id: syncLog.id
    });
  } catch (err) {
    logError(req, err, 'Failed to start product import');
    res.status(500).json({ error: err.message });
  }
});

/**
 * Export products to Shopify
 */
router.post('/export/products', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { site } = res.locals;
    const { product_ids } = req.body;

    const config = await prisma.shopify_config.findUnique({
      where: { site_id: site.id }
    });

    if (!config) {
      return res.status(400).json({ error: 'Shopify not configured for this site' });
    }

    const shopify = createShopifyService(config);

    // Create sync log entry
    const syncLog = await prisma.shopify_sync_log.create({
      data: {
        site_id: site.id,
        sync_type: 'products',
        sync_direction: 'export',
        status: 'running',
        items_total: product_ids?.length || 0
      }
    });

    // Start export in background
    exportProductsToShopify(site.id, shopify, syncLog.id, product_ids).catch(err => {
      logError(req, err, 'Background product export failed');
    });

    res.json({
      success: true,
      message: 'Product export started',
      sync_log_id: syncLog.id
    });
  } catch (err) {
    logError(req, err, 'Failed to start product export');
    res.status(500).json({ error: err.message });
  }
});

/**
 * Get sync status
 */
router.get('/sync/status/:sync_log_id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { sync_log_id } = req.params;
    const { site } = res.locals;

    const syncLog = await prisma.shopify_sync_log.findFirst({
      where: {
        id: parseInt(sync_log_id),
        site_id: site.id
      }
    });

    if (!syncLog) {
      return res.status(404).json({ error: 'Sync log not found' });
    }

    res.json({ syncLog });
  } catch (err) {
    logError(req, err, 'Failed to get sync status');
    res.status(500).json({ error: err.message });
  }
});

/**
 * Get sync history
 */
router.get('/sync/history', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { site } = res.locals;
    const { limit = 20 } = req.query;

    const history = await prisma.shopify_sync_log.findMany({
      where: { site_id: site.id },
      orderBy: { started_at: 'desc' },
      take: parseInt(limit)
    });

    res.json({ history });
  } catch (err) {
    logError(req, err, 'Failed to get sync history');
    res.status(500).json({ error: err.message });
  }
});

/**
 * Webhook endpoint for Shopify
 */
router.post('/webhook/:topic', async (req, res) => {
  try {
    const { topic } = req.params;
    const shopDomain = req.get('X-Shopify-Shop-Domain');
    const hmac = req.get('X-Shopify-Hmac-Sha256');

    // Find site by shop domain
    const config = await prisma.shopify_config.findFirst({
      where: { shop_domain: shopDomain }
    });

    if (!config) {
      return res.status(404).json({ error: 'Shop not configured' });
    }

    // Verify webhook signature
    const hash = crypto
      .createHmac('sha256', config.webhook_secret)
      .update(JSON.stringify(req.body))
      .digest('base64');

    if (hash !== hmac) {
      logError(req, new Error('Invalid webhook signature'), 'Shopify webhook verification failed');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Log webhook
    await prisma.shopify_webhooks.create({
      data: {
        site_id: config.site_id,
        topic,
        payload: req.body
      }
    });

    // Process webhook based on topic
    await processWebhook(config.site_id, topic, req.body);

    res.json({ success: true });
  } catch (err) {
    logError(req, err, 'Webhook processing failed');
    res.status(500).json({ error: err.message });
  }
});

/**
 * Get synced products
 */
router.get('/products', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { site } = res.locals;
    const { status, limit = 50, offset = 0 } = req.query;

    const where = { site_id: site.id };
    if (status) where.sync_status = status;

    const products = await prisma.shopify_products.findMany({
      where,
      include: {
        product: {
          select: {
            id: true,
            name: true,
            slug: true,
            price: true,
            image_url: true
          }
        }
      },
      orderBy: { last_synced_at: 'desc' },
      take: parseInt(limit),
      skip: parseInt(offset)
    });

    const total = await prisma.shopify_products.count({ where });

    res.json({ products, total });
  } catch (err) {
    logError(req, err, 'Failed to get synced products');
    res.status(500).json({ error: err.message });
  }
});

// ========== BACKGROUND FUNCTIONS ==========

/**
 * Import products from Shopify (background task)
 */
async function importProductsFromShopify(siteId, shopify, syncLogId, options = {}) {
  try {
    const { limit = 50, collection_id } = options;

    // Get products from Shopify
    const params = { limit };
    if (collection_id) params.collection_id = collection_id;

    const response = await shopify.getProducts(params);
    const products = response.products || [];

    await prisma.shopify_sync_log.update({
      where: { id: syncLogId },
      data: { items_total: products.length }
    });

    let succeeded = 0;
    let failed = 0;

    for (const shopifyProduct of products) {
      try {
        // Create or update product in CMS
        const product = await prisma.products.upsert({
          where: {
            slug: shopifyProduct.handle
          },
          create: {
            name: shopifyProduct.title,
            slug: shopifyProduct.handle,
            description: shopifyProduct.body_html,
            price: parseFloat(shopifyProduct.variants[0]?.price || 0),
            image_url: shopifyProduct.images[0]?.src,
            category: shopifyProduct.product_type,
            tags: shopifyProduct.tags,
            status: shopifyProduct.status === 'active' ? 'active' : 'draft'
          },
          update: {
            name: shopifyProduct.title,
            description: shopifyProduct.body_html,
            price: parseFloat(shopifyProduct.variants[0]?.price || 0),
            image_url: shopifyProduct.images[0]?.src,
            category: shopifyProduct.product_type,
            tags: shopifyProduct.tags,
            status: shopifyProduct.status === 'active' ? 'active' : 'draft'
          }
        });

        // Track sync
        await prisma.shopify_products.upsert({
          where: {
            site_id_shopify_product_id: {
              site_id: siteId,
              shopify_product_id: shopifyProduct.id
            }
          },
          create: {
            site_id: siteId,
            product_id: product.id,
            shopify_product_id: shopifyProduct.id,
            shopify_handle: shopifyProduct.handle,
            sync_status: 'synced',
            last_synced_at: new Date(),
            last_modified_source: 'shopify',
            shopify_data: shopifyProduct
          },
          update: {
            product_id: product.id,
            shopify_handle: shopifyProduct.handle,
            sync_status: 'synced',
            last_synced_at: new Date(),
            last_modified_source: 'shopify',
            shopify_data: shopifyProduct
          }
        });

        succeeded++;
      } catch (err) {
        failed++;
        logError(null, err, `Failed to import product ${shopifyProduct.id}`);
      }

      await prisma.shopify_sync_log.update({
        where: { id: syncLogId },
        data: {
          items_processed: succeeded + failed,
          items_succeeded: succeeded,
          items_failed: failed
        }
      });
    }

    await prisma.shopify_sync_log.update({
      where: { id: syncLogId },
      data: {
        status: failed > 0 ? 'partial' : 'completed',
        completed_at: new Date()
      }
    });

    await prisma.shopify_config.update({
      where: { site_id: siteId },
      data: { last_sync_at: new Date() }
    });

  } catch (err) {
    await prisma.shopify_sync_log.update({
      where: { id: syncLogId },
      data: {
        status: 'failed',
        error_message: err.message,
        completed_at: new Date()
      }
    });
    throw err;
  }
}

/**
 * Export products to Shopify (background task)
 */
async function exportProductsToShopify(siteId, shopify, syncLogId, productIds) {
  try {
    const where = { id: { in: productIds } };
    const products = await prisma.products.findMany({ where });

    let succeeded = 0;
    let failed = 0;

    for (const product of products) {
      try {
        // Check if product already synced
        const syncRecord = await prisma.shopify_products.findFirst({
          where: {
            site_id: siteId,
            product_id: product.id
          }
        });

        const shopifyProductData = {
          title: product.name,
          body_html: product.description,
          vendor: product.vendor || 'WebWolf CMS',
          product_type: product.category,
          tags: product.tags,
          variants: [{
            price: product.price.toString(),
            sku: product.sku,
            inventory_quantity: product.stock_quantity || 0
          }],
          images: product.image_url ? [{ src: product.image_url }] : []
        };

        let shopifyProduct;
        if (syncRecord?.shopify_product_id) {
          // Update existing
          shopifyProduct = await shopify.updateProduct(syncRecord.shopify_product_id, shopifyProductData);
        } else {
          // Create new
          shopifyProduct = await shopify.createProduct(shopifyProductData);
        }

        // Track sync
        await prisma.shopify_products.upsert({
          where: {
            site_id_shopify_product_id: {
              site_id: siteId,
              shopify_product_id: shopifyProduct.product.id
            }
          },
          create: {
            site_id: siteId,
            product_id: product.id,
            shopify_product_id: shopifyProduct.product.id,
            shopify_handle: shopifyProduct.product.handle,
            sync_status: 'synced',
            last_synced_at: new Date(),
            last_modified_source: 'cms',
            shopify_data: shopifyProduct.product
          },
          update: {
            sync_status: 'synced',
            last_synced_at: new Date(),
            last_modified_source: 'cms',
            shopify_data: shopifyProduct.product
          }
        });

        succeeded++;
      } catch (err) {
        failed++;
        logError(null, err, `Failed to export product ${product.id}`);
      }

      await prisma.shopify_sync_log.update({
        where: { id: syncLogId },
        data: {
          items_processed: succeeded + failed,
          items_succeeded: succeeded,
          items_failed: failed
        }
      });
    }

    await prisma.shopify_sync_log.update({
      where: { id: syncLogId },
      data: {
        status: failed > 0 ? 'partial' : 'completed',
        completed_at: new Date()
      }
    });

  } catch (err) {
    await prisma.shopify_sync_log.update({
      where: { id: syncLogId },
      data: {
        status: 'failed',
        error_message: err.message,
        completed_at: new Date()
      }
    });
    throw err;
  }
}

/**
 * Process incoming webhooks
 */
async function processWebhook(siteId, topic, payload) {
  try {
    switch (topic) {
      case 'products/create':
      case 'products/update':
        // Import/update product
        await handleProductWebhook(siteId, payload);
        break;

      case 'products/delete':
        // Mark product as deleted
        await handleProductDeleteWebhook(siteId, payload);
        break;

      case 'orders/create':
      case 'orders/updated':
        // Sync order
        await handleOrderWebhook(siteId, payload);
        break;

      default:
        info(null, `Unhandled webhook topic: ${topic}`);
    }

    // Mark webhook as processed
    await prisma.shopify_webhooks.updateMany({
      where: {
        site_id: siteId,
        topic,
        processed: false
      },
      data: {
        processed: true,
        processed_at: new Date()
      }
    });

  } catch (err) {
    logError(null, err, `Failed to process webhook: ${topic}`);
    throw err;
  }
}

async function handleProductWebhook(siteId, shopifyProduct) {
  // Similar to import logic but for single product
  const product = await prisma.products.upsert({
    where: { slug: shopifyProduct.handle },
    create: {
      name: shopifyProduct.title,
      slug: shopifyProduct.handle,
      description: shopifyProduct.body_html,
      price: parseFloat(shopifyProduct.variants[0]?.price || 0),
      image_url: shopifyProduct.images[0]?.src,
      category: shopifyProduct.product_type,
      tags: shopifyProduct.tags,
      status: shopifyProduct.status === 'active' ? 'active' : 'draft'
    },
    update: {
      name: shopifyProduct.title,
      description: shopifyProduct.body_html,
      price: parseFloat(shopifyProduct.variants[0]?.price || 0),
      image_url: shopifyProduct.images[0]?.src,
      category: shopifyProduct.product_type,
      tags: shopifyProduct.tags,
      status: shopifyProduct.status === 'active' ? 'active' : 'draft'
    }
  });

  await prisma.shopify_products.upsert({
    where: {
      site_id_shopify_product_id: {
        site_id: siteId,
        shopify_product_id: shopifyProduct.id
      }
    },
    create: {
      site_id: siteId,
      product_id: product.id,
      shopify_product_id: shopifyProduct.id,
      shopify_handle: shopifyProduct.handle,
      sync_status: 'synced',
      last_synced_at: new Date(),
      last_modified_source: 'shopify',
      shopify_data: shopifyProduct
    },
    update: {
      product_id: product.id,
      sync_status: 'synced',
      last_synced_at: new Date(),
      last_modified_source: 'shopify',
      shopify_data: shopifyProduct
    }
  });
}

async function handleProductDeleteWebhook(siteId, payload) {
  await prisma.shopify_products.updateMany({
    where: {
      site_id: siteId,
      shopify_product_id: payload.id
    },
    data: {
      sync_status: 'error',
      error_message: 'Product deleted in Shopify'
    }
  });
}

async function handleOrderWebhook(siteId, shopifyOrder) {
  // Store order sync record
  await prisma.shopify_orders.upsert({
    where: {
      site_id_shopify_order_id: {
        site_id: siteId,
        shopify_order_id: shopifyOrder.id
      }
    },
    create: {
      site_id: siteId,
      shopify_order_id: shopifyOrder.id,
      shopify_order_number: shopifyOrder.order_number,
      sync_status: 'synced',
      last_synced_at: new Date(),
      shopify_data: shopifyOrder
    },
    update: {
      sync_status: 'synced',
      last_synced_at: new Date(),
      shopify_data: shopifyOrder
    }
  });
}

export default router;
