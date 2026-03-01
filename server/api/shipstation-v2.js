/**
 * ShipStation API Routes
 *
 * Full ShipStation integration: orders, shipments, rates, carriers,
 * warehouses, products, customers, webhooks, and more.
 */

import { Router } from 'express';
import { requireAuth, requireEditor } from '../middleware/auth.js';
import { getPrisma } from '../lib/prisma.js';
import * as ss from '../services/shipstationService.js';

const router = Router();

/**
 * Helper: load a WolfWave order with items and customer for pushing to ShipStation
 */
async function loadOrderForPush(orderId) {
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

  if (!order) return null;

  const items = order.order_items.map(item => ({
    ...item,
    sku: item.sku || item.products?.sku || '',
    weight: item.products?.weight || null,
    image: item.products?.image || null
  }));

  return { order, items, customer: order.customers };
}

// ─── Connection ──────────────────────────────────────────────────────

router.post('/test-connection', requireAuth, requireEditor, async (req, res) => {
  try {
    const result = await ss.testConnection();
    res.json({ success: true, warehouses: result });
  } catch (error) {
    const status = error.response?.status || 500;
    res.status(status).json({ success: false, error: error.response?.data?.Message || error.message });
  }
});

// ─── Orders ──────────────────────────────────────────────────────────

// Push a single WolfWave order to ShipStation
router.post('/orders/push/:orderId', requireAuth, requireEditor, async (req, res) => {
  try {
    const data = await loadOrderForPush(parseInt(req.params.orderId));
    if (!data) return res.status(404).json({ error: 'Order not found' });

    const result = await ss.createOrder(data.order, data.items, data.customer);
    res.json({ success: true, shipstation_order_id: result.order_id, order_number: result.order_number });
  } catch (error) {
    console.error('ShipStation push error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({ error: error.response?.data?.Message || error.message });
  }
});

// Push multiple WolfWave orders to ShipStation
router.post('/orders/push-batch', requireAuth, requireEditor, async (req, res) => {
  try {
    const { orderIds } = req.body;
    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({ error: 'orderIds array is required' });
    }

    const results = [];
    for (const orderId of orderIds) {
      try {
        const data = await loadOrderForPush(orderId);
        if (!data) {
          results.push({ orderId, success: false, error: 'Order not found' });
          continue;
        }
        const result = await ss.createOrder(data.order, data.items, data.customer);
        results.push({ orderId, success: true, shipstation_order_id: result.order_id });
      } catch (error) {
        results.push({ orderId, success: false, error: error.response?.data?.Message || error.message });
      }
    }

    const successCount = results.filter(r => r.success).length;
    res.json({ total: orderIds.length, success: successCount, failed: orderIds.length - successCount, results });
  } catch (error) {
    res.status(500).json({ error: 'Failed to process batch push' });
  }
});

// List orders in ShipStation
router.get('/orders', requireAuth, requireEditor, async (req, res) => {
  try {
    const result = await ss.listOrders(req.query);
    res.json(result);
  } catch (error) {
    res.status(error.response?.status || 500).json({ error: error.response?.data?.Message || error.message });
  }
});

// Get a single order from ShipStation
router.get('/orders/:id', requireAuth, requireEditor, async (req, res) => {
  try {
    const result = await ss.getOrder(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(error.response?.status || 500).json({ error: error.response?.data?.Message || error.message });
  }
});

// Delete an order in ShipStation
router.delete('/orders/:id', requireAuth, requireEditor, async (req, res) => {
  try {
    await ss.deleteOrder(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(error.response?.status || 500).json({ error: error.response?.data?.Message || error.message });
  }
});

// Hold an order
router.post('/orders/:id/hold', requireAuth, requireEditor, async (req, res) => {
  try {
    const result = await ss.holdOrder(parseInt(req.params.id), req.body.holdUntilDate);
    res.json(result);
  } catch (error) {
    res.status(error.response?.status || 500).json({ error: error.response?.data?.Message || error.message });
  }
});

// Restore an order from hold
router.post('/orders/:id/restore', requireAuth, requireEditor, async (req, res) => {
  try {
    const result = await ss.restoreOrder(parseInt(req.params.id));
    res.json(result);
  } catch (error) {
    res.status(error.response?.status || 500).json({ error: error.response?.data?.Message || error.message });
  }
});

// Mark order as shipped
router.post('/orders/:id/mark-shipped', requireAuth, requireEditor, async (req, res) => {
  try {
    const { carrierCode, shipDate, trackingNumber, notifyCustomer, notifySalesChannel } = req.body;
    const result = await ss.markAsShipped(
      parseInt(req.params.id), carrierCode, shipDate, trackingNumber,
      notifyCustomer ?? true, notifySalesChannel ?? true
    );

    // Update WolfWave order with tracking info
    if (trackingNumber) {
      const prisma = getPrisma();
      // Find WolfWave order by ShipStation order ID if we have a mapping
      // For now, tracking updates come back through webhooks
    }

    res.json(result);
  } catch (error) {
    res.status(error.response?.status || 500).json({ error: error.response?.data?.Message || error.message });
  }
});

// Add tag to order
router.post('/orders/:id/tag', requireAuth, requireEditor, async (req, res) => {
  try {
    const result = await ss.assignTag(parseInt(req.params.id), req.body.tagId);
    res.json(result);
  } catch (error) {
    res.status(error.response?.status || 500).json({ error: error.response?.data?.Message || error.message });
  }
});

// Remove tag from order
router.delete('/orders/:id/tag', requireAuth, requireEditor, async (req, res) => {
  try {
    const result = await ss.removeTag(parseInt(req.params.id), req.body.tagId);
    res.json(result);
  } catch (error) {
    res.status(error.response?.status || 500).json({ error: error.response?.data?.Message || error.message });
  }
});

// ─── Shipments & Labels ──────────────────────────────────────────────

router.get('/shipments', requireAuth, requireEditor, async (req, res) => {
  try {
    const result = await ss.listShipments(req.query);
    res.json(result);
  } catch (error) {
    res.status(error.response?.status || 500).json({ error: error.response?.data?.Message || error.message });
  }
});

// Get shipping rates
router.post('/rates', requireAuth, requireEditor, async (req, res) => {
  try {
    const result = await ss.getShippingRates(req.body);
    res.json(result);
  } catch (error) {
    res.status(error.response?.status || 500).json({ error: error.response?.data?.Message || error.message });
  }
});

// ─── Labels ─────────────────────────────────────────────────────────

// List labels
router.get('/labels', requireAuth, requireEditor, async (req, res) => {
  try {
    const result = await ss.listLabels(req.query);
    res.json(result);
  } catch (error) {
    res.status(error.response?.status || 500).json({ error: error.response?.data?.Message || error.message });
  }
});

// Get a single label
router.get('/labels/:labelId', requireAuth, requireEditor, async (req, res) => {
  try {
    const result = await ss.getLabel(req.params.labelId);
    res.json(result);
  } catch (error) {
    res.status(error.response?.status || 500).json({ error: error.response?.data?.Message || error.message });
  }
});

// Create a shipping label (full shipment)
router.post('/labels', requireAuth, requireEditor, async (req, res) => {
  try {
    const result = await ss.createLabel(req.body);
    res.json(result);
  } catch (error) {
    res.status(error.response?.status || 500).json({ error: error.response?.data?.Message || error.message });
  }
});

// Create label from a rate
router.post('/labels/rates/:rateId', requireAuth, requireEditor, async (req, res) => {
  try {
    const result = await ss.createLabelFromRate(req.params.rateId, req.body);
    res.json(result);
  } catch (error) {
    res.status(error.response?.status || 500).json({ error: error.response?.data?.Message || error.message });
  }
});

// Create label from a shipment
router.post('/labels/shipment/:shipmentId', requireAuth, requireEditor, async (req, res) => {
  try {
    const result = await ss.createLabelFromShipment(req.params.shipmentId, req.body);
    res.json(result);
  } catch (error) {
    res.status(error.response?.status || 500).json({ error: error.response?.data?.Message || error.message });
  }
});

// Void a shipping label
router.put('/labels/:labelId/void', requireAuth, requireEditor, async (req, res) => {
  try {
    const result = await ss.voidLabel(req.params.labelId);
    res.json(result);
  } catch (error) {
    res.status(error.response?.status || 500).json({ error: error.response?.data?.Message || error.message });
  }
});

// Cancel a shipment
router.get('/shipments/:shipmentId/cancel', requireAuth, requireEditor, async (req, res) => {
  try {
    const result = await ss.cancelShipment(req.params.shipmentId);
    res.json(result);
  } catch (error) {
    res.status(error.response?.status || 500).json({ error: error.response?.data?.Message || error.message });
  }
});

// ─── Carriers ────────────────────────────────────────────────────────

router.get('/carriers', requireAuth, requireEditor, async (req, res) => {
  try {
    const result = await ss.listCarriers();
    res.json(result);
  } catch (error) {
    res.status(error.response?.status || 500).json({ error: error.response?.data?.Message || error.message });
  }
});

router.get('/carriers/:carrierCode', requireAuth, requireEditor, async (req, res) => {
  try {
    const result = await ss.getCarrier(req.params.carrierCode);
    res.json(result);
  } catch (error) {
    res.status(error.response?.status || 500).json({ error: error.response?.data?.Message || error.message });
  }
});

router.get('/carriers/:carrierCode/services', requireAuth, requireEditor, async (req, res) => {
  try {
    const result = await ss.listCarrierServices(req.params.carrierCode);
    res.json(result);
  } catch (error) {
    res.status(error.response?.status || 500).json({ error: error.response?.data?.Message || error.message });
  }
});

router.get('/carriers/:carrierCode/packages', requireAuth, requireEditor, async (req, res) => {
  try {
    const result = await ss.listCarrierPackages(req.params.carrierCode);
    res.json(result);
  } catch (error) {
    res.status(error.response?.status || 500).json({ error: error.response?.data?.Message || error.message });
  }
});

// ─── Warehouses ──────────────────────────────────────────────────────

router.get('/warehouses', requireAuth, requireEditor, async (req, res) => {
  try {
    const result = await ss.listWarehouses();
    res.json(result);
  } catch (error) {
    res.status(error.response?.status || 500).json({ error: error.response?.data?.Message || error.message });
  }
});

router.post('/warehouses', requireAuth, requireEditor, async (req, res) => {
  try {
    const result = await ss.createWarehouse(req.body);
    res.json(result);
  } catch (error) {
    res.status(error.response?.status || 500).json({ error: error.response?.data?.Message || error.message });
  }
});

router.put('/warehouses/:id', requireAuth, requireEditor, async (req, res) => {
  try {
    const result = await ss.updateWarehouse({ ...req.body, warehouseId: parseInt(req.params.id) });
    res.json(result);
  } catch (error) {
    res.status(error.response?.status || 500).json({ error: error.response?.data?.Message || error.message });
  }
});

router.delete('/warehouses/:id', requireAuth, requireEditor, async (req, res) => {
  try {
    await ss.deleteWarehouse(parseInt(req.params.id));
    res.json({ success: true });
  } catch (error) {
    res.status(error.response?.status || 500).json({ error: error.response?.data?.Message || error.message });
  }
});

// ─── Products ────────────────────────────────────────────────────────

router.get('/products', requireAuth, requireEditor, async (req, res) => {
  try {
    const result = await ss.listProducts(req.query);
    res.json(result);
  } catch (error) {
    res.status(error.response?.status || 500).json({ error: error.response?.data?.Message || error.message });
  }
});

router.get('/products/:id', requireAuth, requireEditor, async (req, res) => {
  try {
    const result = await ss.getProduct(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(error.response?.status || 500).json({ error: error.response?.data?.Message || error.message });
  }
});

router.put('/products/:id', requireAuth, requireEditor, async (req, res) => {
  try {
    const result = await ss.updateProduct(req.params.id, req.body);
    res.json(result);
  } catch (error) {
    res.status(error.response?.status || 500).json({ error: error.response?.data?.Message || error.message });
  }
});

// ─── Customers ───────────────────────────────────────────────────────

router.get('/customers', requireAuth, requireEditor, async (req, res) => {
  try {
    const result = await ss.listCustomers(req.query);
    res.json(result);
  } catch (error) {
    res.status(error.response?.status || 500).json({ error: error.response?.data?.Message || error.message });
  }
});

router.get('/customers/:id', requireAuth, requireEditor, async (req, res) => {
  try {
    const result = await ss.getCustomer(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(error.response?.status || 500).json({ error: error.response?.data?.Message || error.message });
  }
});

// ─── Stores ──────────────────────────────────────────────────────────

router.get('/stores', requireAuth, requireEditor, async (req, res) => {
  try {
    const result = await ss.listStores();
    res.json(result);
  } catch (error) {
    res.status(error.response?.status || 500).json({ error: error.response?.data?.Message || error.message });
  }
});

router.put('/stores/:id/refresh', requireAuth, requireEditor, async (req, res) => {
  try {
    const result = await ss.refreshStore(parseInt(req.params.id), req.body.refreshDate);
    res.json(result);
  } catch (error) {
    res.status(error.response?.status || 500).json({ error: error.response?.data?.Message || error.message });
  }
});

// ─── Fulfillments ────────────────────────────────────────────────────

router.get('/fulfillments', requireAuth, requireEditor, async (req, res) => {
  try {
    const result = await ss.listFulfillments(req.query);
    res.json(result);
  } catch (error) {
    res.status(error.response?.status || 500).json({ error: error.response?.data?.Message || error.message });
  }
});

// ─── Tags ────────────────────────────────────────────────────────────

router.get('/tags', requireAuth, requireEditor, async (req, res) => {
  try {
    const result = await ss.listTags();
    res.json(result);
  } catch (error) {
    res.status(error.response?.status || 500).json({ error: error.response?.data?.Message || error.message });
  }
});

router.post('/tags', requireAuth, requireEditor, async (req, res) => {
  try {
    const result = await ss.createTag(req.body.name);
    res.json(result);
  } catch (error) {
    res.status(error.response?.status || 500).json({ error: error.response?.data?.Message || error.message });
  }
});

router.delete('/tags/:name', requireAuth, requireEditor, async (req, res) => {
  try {
    await ss.deleteTag(req.params.name);
    res.json({ success: true });
  } catch (error) {
    res.status(error.response?.status || 500).json({ error: error.response?.data?.Message || error.message });
  }
});

// Add/remove tags from shipments
router.post('/shipments/:shipmentId/tags/:tagName', requireAuth, requireEditor, async (req, res) => {
  try {
    const result = await ss.addShipmentTag(req.params.shipmentId, req.params.tagName);
    res.json(result);
  } catch (error) {
    res.status(error.response?.status || 500).json({ error: error.response?.data?.Message || error.message });
  }
});

router.delete('/shipments/:shipmentId/tags/:tagName', requireAuth, requireEditor, async (req, res) => {
  try {
    await ss.removeShipmentTag(req.params.shipmentId, req.params.tagName);
    res.json({ success: true });
  } catch (error) {
    res.status(error.response?.status || 500).json({ error: error.response?.data?.Message || error.message });
  }
});

// ─── Webhooks Management ─────────────────────────────────────────────

router.get('/webhooks', requireAuth, requireEditor, async (req, res) => {
  try {
    const result = await ss.listWebhooks();
    res.json(result);
  } catch (error) {
    res.status(error.response?.status || 500).json({ error: error.response?.data?.Message || error.message });
  }
});

router.post('/webhooks', requireAuth, requireEditor, async (req, res) => {
  try {
    const { targetUrl, event, storeId } = req.body;
    const result = await ss.subscribeWebhook(targetUrl, event, storeId);
    res.json(result);
  } catch (error) {
    res.status(error.response?.status || 500).json({ error: error.response?.data?.Message || error.message });
  }
});

router.delete('/webhooks/:id', requireAuth, requireEditor, async (req, res) => {
  try {
    await ss.unsubscribeWebhook(parseInt(req.params.id));
    res.json({ success: true });
  } catch (error) {
    res.status(error.response?.status || 500).json({ error: error.response?.data?.Message || error.message });
  }
});

// ─── Webhook Callback (incoming from ShipStation) ────────────────────

router.post('/webhook/callback', async (req, res) => {
  try {
    const { resource_url, resource_type } = req.body;

    if (!resource_url) {
      return res.status(400).json({ error: 'Missing resource_url' });
    }

    // ShipStation sends a resource_url we need to fetch to get the actual data
    const apiKey = await (await import('../db/connection.js')).query(
      "SELECT setting_value FROM settings WHERE setting_key = 'shipstation_auth_key'"
    );
    const key = apiKey[0]?.setting_value || process.env.SHIPSTATION_API_KEY;

    if (!key) {
      console.error('ShipStation webhook received but no API key configured');
      return res.status(200).send('ok');
    }

    const axios = (await import('axios')).default;
    const { data } = await axios.get(resource_url, {
      headers: { 'API-Key': key }
    });

    const prisma = getPrisma();

    // Handle shipped orders - update tracking in WolfWave
    if (resource_type === 'SHIP_NOTIFY' || resource_type === 'ORDER_NOTIFY') {
      const shipments = data?.shipments || (Array.isArray(data) ? data : [data]);

      for (const shipment of shipments) {
        if (!shipment.order_number || !shipment.tracking_number) continue;

        // Find matching WolfWave order
        const order = await prisma.orders.findFirst({
          where: { order_number: shipment.order_number }
        });

        if (order) {
          await prisma.orders.update({
            where: { id: order.id },
            data: {
              tracking_number: shipment.tracking_number,
              status: 'shipped',
              shipped_at: shipment.ship_date ? new Date(shipment.ship_date) : new Date()
            }
          });
          console.log(`ShipStation webhook: Updated order ${shipment.order_number} with tracking ${shipment.tracking_number}`);
        }
      }
    }

    res.status(200).send('ok');
  } catch (error) {
    console.error('ShipStation webhook error:', error.message);
    // Always return 200 so ShipStation doesn't retry endlessly
    res.status(200).send('ok');
  }
});

export default router;
