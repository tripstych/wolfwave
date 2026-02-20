import { Router } from 'express';
import { query } from '../db/connection.js';
import { requireAuth, requireEditor } from '../middleware/auth.js';

const router = Router();

/**
 * GET /api/dashboard/stats
 * Overview stats for the dashboard
 */
router.get('/stats', requireAuth, requireEditor, async (req, res) => {
  try {
    // 1. Basic Content Stats
    const contentStats = await query(`
      SELECT 
        (SELECT COUNT(*) FROM pages) as total_pages,
        (SELECT COUNT(*) FROM products) as total_products,
        (SELECT COUNT(*) FROM media) as total_media
    `);

    // 2. Order/Revenue Stats (Last 30 days)
    const revenueStats = await query(`
      SELECT 
        SUM(total) as total_revenue,
        COUNT(*) as total_orders
      FROM orders
      WHERE payment_status = 'paid'
      AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
    `);

    // 3. Subscription Stats
    const subscriptionStats = await query(`
      SELECT COUNT(*) as active_subscribers
      FROM customer_subscriptions
      WHERE status IN ('active', 'trialing')
    `);

    // 4. Low Stock Alert (threshold < 10)
    const lowStock = await query(`
      SELECT p.id, c.title, p.sku, p.inventory_quantity
      FROM products p
      JOIN content c ON p.content_id = c.id
      WHERE p.inventory_quantity < 10
      AND p.inventory_tracking = 1
      AND p.status = 'active'
      ORDER BY p.inventory_quantity ASC
      LIMIT 5
    `);

    // 5. Recent Orders
    const recentOrders = await query(`
      SELECT id, order_number, email, total, status, created_at
      FROM orders
      ORDER BY created_at DESC
      LIMIT 5
    `);

    res.json({
      content: contentStats[0],
      revenue: {
        amount: parseFloat(revenueStats[0]?.total_revenue || 0),
        count: revenueStats[0]?.total_orders || 0,
        period: 'Last 30 Days'
      },
      subscriptions: subscriptionStats[0],
      lowStock,
      recentOrders
    });
  } catch (err) {
    console.error('Dashboard stats error:', err);
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
});

export default router;
