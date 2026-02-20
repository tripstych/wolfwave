import jwt from 'jsonwebtoken';
import { query } from '../db/connection.js';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET is required in production');
  }
}
const SAFE_JWT_SECRET = JWT_SECRET || 'dev-secret-change-in-production';

export async function getCustomerContext(req) {
  try {
    const customerToken = req.cookies?.customer_token;
    if (!customerToken) return null;

    const decoded = jwt.verify(customerToken, SAFE_JWT_SECRET);
    // Explicitly check for customer type, or if it's missing (legacy), ensure it's not an admin
    if (decoded.role === 'admin' && decoded.type !== 'customer') return null;
    if (!decoded.id) return null;

    const custRows = await query('SELECT id, email, first_name, last_name FROM customers WHERE id = ?', [decoded.id]);
    if (!custRows || !custRows.length || !custRows[0]) return null;

    // Fetch default shipping address (isolated so failures don't kill customer context)
    let defaultAddress = null;
    try {
      const addrRows = await query(
        `SELECT first_name, last_name, address1, address2, city, province, postal_code, country, phone
         FROM addresses WHERE customer_id = ? AND type = 'shipping' ORDER BY is_default DESC, id DESC LIMIT 1`,
        [custRows[0].id]
      );
      defaultAddress = addrRows[0] || null;
    } catch (e) {
      console.error('Error fetching customer address:', e.message);
    }

    let subscription = null;
    try {
      const subRows = await query(
        `SELECT cs.*, sp.name as plan_name, sp.slug as plan_slug,
                sp.price as plan_price, sp.\`interval\` as plan_interval, sp.features as plan_features,
                sp.product_discount
         FROM customer_subscriptions cs
         JOIN subscription_plans sp ON cs.plan_id = sp.id
         WHERE cs.customer_id = ? AND cs.status IN ('active', 'trialing', 'paused', 'past_due')
         ORDER BY cs.created_at DESC LIMIT 1`,
        [custRows[0].id]
      );
      const sub = subRows[0];
      if (sub) {
        let features = [];
        if (sub.plan_features) {
          try { features = JSON.parse(sub.plan_features); } catch (e) {}
        }
        subscription = {
          id: sub.id,
          status: sub.status,
          plan: { 
            name: sub.plan_name, 
            slug: sub.plan_slug, 
            price: sub.plan_price, 
            interval: sub.plan_interval, 
            features,
            product_discount: parseFloat(sub.product_discount || 0)
          },
          current_period_start: sub.current_period_start,
          current_period_end: sub.current_period_end,
          cancel_at_period_end: sub.cancel_at_period_end,
          canceled_at: sub.canceled_at,
          paused_at: sub.paused_at
        };
      }
    } catch (e) {
      console.error('Error fetching customer subscription:', e.message);
    }

    return {
      id: custRows[0].id,
      email: custRows[0].email,
      first_name: custRows[0].first_name,
      last_name: custRows[0].last_name,
      default_address: defaultAddress,
      subscription
    };
  } catch (e) {
    console.error('Error in getCustomerContext:', e.message);
    return null;
  }
}
