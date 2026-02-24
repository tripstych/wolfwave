import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import prisma from '../lib/prisma.js';
import {
  testConnection,
  searchCatalog,
  getListingByAsin,
  getInventory,
  getOrders,
  getOrderItems,
  MARKETPLACE_IDS,
} from '../services/amazonService.js';
import { downloadImage } from '../services/mediaService.js';

const router = Router();

// Test SP-API connection
router.get('/status', requireAuth, async (req, res) => {
  try {
    const result = await testConnection();
    res.json(result);
  } catch (err) {
    res.status(500).json({ connected: false, error: err.message });
  }
});

// Get available marketplace IDs
router.get('/marketplaces', requireAuth, (req, res) => {
  res.json(MARKETPLACE_IDS);
});

// Search Amazon catalog
router.get('/search', requireAuth, async (req, res) => {
  try {
    const { keywords, maxResults, nextToken } = req.query;
    if (!keywords) return res.status(400).json({ error: 'keywords parameter required' });
    const result = await searchCatalog(keywords, {
      maxResults: parseInt(maxResults) || 20,
      nextToken,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single listing by ASIN
router.get('/listing/:asin', requireAuth, async (req, res) => {
  try {
    const data = await getListingByAsin(req.params.asin);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Import Amazon listings as WolfWave products
router.post('/import-products', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { asins, template_id } = req.body;
    if (!asins?.length) return res.status(400).json({ error: 'asins array required' });

    // Find or create a default product template
    let templateId = template_id;
    if (!templateId) {
      const defaultTemplate = await prisma.templates.findFirst({
        where: { slug: 'product' },
      });
      templateId = defaultTemplate?.id;
      if (!templateId) return res.status(400).json({ error: 'No product template found. Create one or pass template_id.' });
    }

    const results = [];
    for (const asin of asins) {
      try {
        const listing = await getListingByAsin(asin);
        const summary = listing.summaries?.[0] || {};
        const images = listing.images?.[0]?.images || [];
        const title = summary.itemName || `Amazon Product ${asin}`;
        const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 100);

        // Check if already imported
        const existing = await prisma.products.findFirst({
          where: { amazon_asin: asin },
        });
        if (existing) {
          results.push({ asin, status: 'skipped', reason: 'already imported', product_id: existing.id });
          continue;
        }

        // Create content entry
        const content = await prisma.content.create({
          data: {
            title,
            slug: `product-${slug}-${Date.now()}`,
            template_id: templateId,
            data: {
              description: summary.itemName || '',
              brand: summary.brand || '',
              asin,
            },
            status: 'draft',
          },
        });

        // Download primary image
        let primaryImage = images[0]?.link || '';
        if (primaryImage) {
          try {
            primaryImage = await downloadImage(primaryImage, `amazon-${asin}`);
          } catch {
            // Keep the Amazon URL if download fails
          }
        }

        // Create product
        const product = await prisma.products.create({
          data: {
            content_id: content.id,
            template_id: templateId,
            title,
            sku: `AMZ-${asin}`,
            price: 0,
            status: 'draft',
            image: primaryImage,
            amazon_asin: asin,
          },
        });

        // Import additional images
        for (let i = 0; i < images.length; i++) {
          try {
            let imgUrl = images[i].link;
            try {
              imgUrl = await downloadImage(imgUrl, `amazon-${asin}-${i}`);
            } catch {
              // Keep original URL
            }
            await prisma.product_images.create({
              data: {
                product_id: product.id,
                url: imgUrl,
                position: i,
              },
            });
          } catch {
            // Skip failed images
          }
        }

        results.push({ asin, status: 'imported', product_id: product.id });
      } catch (err) {
        results.push({ asin, status: 'error', error: err.message });
      }
    }

    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get inventory from Amazon
router.get('/inventory', requireAuth, async (req, res) => {
  try {
    const { nextToken, skus } = req.query;
    const result = await getInventory({
      nextToken,
      skus: skus ? skus.split(',') : undefined,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Sync inventory: push WolfWave quantities to match Amazon
router.post('/sync-inventory', requireAuth, requireAdmin, async (req, res) => {
  try {
    const amazonInventory = await getInventory();
    const synced = [];

    for (const item of amazonInventory.items) {
      // Find matching WolfWave product by ASIN or SKU
      const product = await prisma.products.findFirst({
        where: {
          OR: [
            { amazon_asin: item.asin },
            { sku: item.sku },
          ],
        },
      });

      if (product) {
        await prisma.products.update({
          where: { id: product.id },
          data: { inventory_quantity: item.totalQuantity },
        });
        synced.push({
          product_id: product.id,
          sku: product.sku,
          asin: item.asin,
          oldQty: product.inventory_quantity,
          newQty: item.totalQuantity,
        });
      }
    }

    res.json({ success: true, synced, total: synced.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get orders from Amazon
router.get('/orders', requireAuth, async (req, res) => {
  try {
    const { createdAfter, maxResults, nextToken } = req.query;
    const result = await getOrders({
      createdAfter: createdAfter || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      maxResults: parseInt(maxResults) || 50,
      nextToken,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get order items
router.get('/orders/:orderId/items', requireAuth, async (req, res) => {
  try {
    const items = await getOrderItems(req.params.orderId);
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Import Amazon orders into WolfWave
router.post('/import-orders', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { orderIds } = req.body;
    if (!orderIds?.length) return res.status(400).json({ error: 'orderIds array required' });

    const results = [];
    for (const amazonOrderId of orderIds) {
      try {
        // Check if already imported
        const existing = await prisma.amazon_order_sync.findUnique({
          where: { amazon_order_id: amazonOrderId },
        });
        if (existing) {
          results.push({ amazonOrderId, status: 'skipped', reason: 'already imported' });
          continue;
        }

        const items = await getOrderItems(amazonOrderId);
        const totalAmount = items.reduce((sum, item) => sum + (parseFloat(item.price || 0) * item.quantity), 0);

        // Create WolfWave order
        const order = await prisma.orders.create({
          data: {
            status: 'processing',
            total: totalAmount,
            currency: items[0]?.currency || 'USD',
            payment_method: 'amazon',
            payment_status: 'paid',
            notes: `Imported from Amazon Order ${amazonOrderId}`,
          },
        });

        // Create order items
        for (const item of items) {
          const product = await prisma.products.findFirst({
            where: {
              OR: [
                { amazon_asin: item.asin },
                { sku: item.sku },
              ],
            },
          });

          await prisma.order_items.create({
            data: {
              order_id: order.id,
              product_id: product?.id || null,
              title: item.title,
              sku: item.sku || item.asin,
              quantity: item.quantity,
              price: parseFloat(item.price || 0),
            },
          });
        }

        // Track sync
        await prisma.amazon_order_sync.create({
          data: {
            amazon_order_id: amazonOrderId,
            order_id: order.id,
            status: 'imported',
            data: { items },
          },
        });

        results.push({ amazonOrderId, status: 'imported', order_id: order.id });
      } catch (err) {
        results.push({ amazonOrderId, status: 'error', error: err.message });
      }
    }

    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
