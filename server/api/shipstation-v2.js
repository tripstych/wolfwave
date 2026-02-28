/**
 * ShipStation v2 API Routes
 *
 * Push-based integration: WolfWave pushes orders to ShipStation
 * instead of ShipStation polling for them.
 */

import { Router } from 'express';
import { requireAuth, requireEditor } from '../middleware/auth.js';
import { getPrisma } from '../lib/prisma.js';
import { pushOrder, getOrder, testConnection } from '../services/shipstationService.js';

const router = Router();

/**
 * POST /api/shipstation/test-connection
 * Verify the ShipStation API key is valid
 */
router.post('/test-connection', requireAuth, requireEditor, async (req, res) => {
  try {
    const result = await testConnection();
    res.json({ success: true, warehouses: result });
  } catch (error) {
    const status = error.response?.status || 500;
    const message = error.response?.data?.Message || error.message;
    res.status(status).json({ success: false, error: message });
  }
});

/**
 * POST /api/shipstation/push/:orderId
 * Push a single order to ShipStation
 */
router.post('/push/:orderId', requireAuth, requireEditor, async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId);
    const prisma = getPrisma();

    const order = await prisma.orders.findUnique({
      where: { id: orderId },
      include: {
        order_items: {
          include: {
            products: {
              select: { sku: true, weight: true, image: true }
            }
          }
        },
        customers: true
      }
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Merge product data into items for the service
    const items = order.order_items.map(item => ({
      ...item,
      sku: item.sku || item.products?.sku || '',
      weight: item.products?.weight || null,
      image: item.products?.image || null
    }));

    const result = await pushOrder(order, items, order.customers);

    res.json({
      success: true,
      shipstation_order_id: result.orderId,
      order_number: result.orderNumber,
      order_key: result.orderKey
    });
  } catch (error) {
    console.error('ShipStation push error:', error.response?.data || error.message);
    const status = error.response?.status || 500;
    const message = error.response?.data?.Message || error.message;
    res.status(status).json({ error: `Failed to push order: ${message}` });
  }
});

/**
 * POST /api/shipstation/push-batch
 * Push multiple orders to ShipStation
 * Body: { orderIds: [1, 2, 3] }
 */
router.post('/push-batch', requireAuth, requireEditor, async (req, res) => {
  try {
    const { orderIds } = req.body;

    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({ error: 'orderIds array is required' });
    }

    const prisma = getPrisma();
    const results = [];

    for (const orderId of orderIds) {
      try {
        const order = await prisma.orders.findUnique({
          where: { id: orderId },
          include: {
            order_items: {
              include: {
                products: {
                  select: { sku: true, weight: true, image: true }
                }
              }
            },
            customers: true
          }
        });

        if (!order) {
          results.push({ orderId, success: false, error: 'Order not found' });
          continue;
        }

        const items = order.order_items.map(item => ({
          ...item,
          sku: item.sku || item.products?.sku || '',
          weight: item.products?.weight || null,
          image: item.products?.image || null
        }));

        const result = await pushOrder(order, items, order.customers);
        results.push({
          orderId,
          success: true,
          shipstation_order_id: result.orderId,
          order_number: result.orderNumber
        });
      } catch (error) {
        results.push({
          orderId,
          success: false,
          error: error.response?.data?.Message || error.message
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    res.json({
      total: orderIds.length,
      success: successCount,
      failed: orderIds.length - successCount,
      results
    });
  } catch (error) {
    console.error('ShipStation batch push error:', error.message);
    res.status(500).json({ error: 'Failed to process batch push' });
  }
});

/**
 * GET /api/shipstation/status/:shipstationOrderId
 * Check order status in ShipStation
 */
router.get('/status/:shipstationOrderId', requireAuth, requireEditor, async (req, res) => {
  try {
    const result = await getOrder(req.params.shipstationOrderId);
    res.json(result);
  } catch (error) {
    const status = error.response?.status || 500;
    const message = error.response?.data?.Message || error.message;
    res.status(status).json({ error: message });
  }
});

export default router;
