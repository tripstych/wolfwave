import { Router } from 'express';
import { query } from '../db/connection.js';
import { getCustomerContext } from '../services/customerService.js';
import { calculateCartTotals } from '../lib/discountEngine.js';

const router = Router();

/**
 * Helper: Calculate cart totals using shared engine
 */
async function calculateTotals(items, shippingAddress, coupon = null, subscriberDiscount = 0, subscriberDiscountSlugs = null) {
  // Get tax rate from settings
  const settings = await query(
    'SELECT setting_value FROM settings WHERE setting_key IN (?, ?)',
    ['tax_rate', 'shipping_flat_rate']
  );
  
  const taxRate = parseFloat(settings.find(s => s.setting_key === 'tax_rate')?.setting_value) || 0;
  const shippingFlatRate = parseFloat(settings.find(s => s.setting_key === 'shipping_flat_rate')?.setting_value) || 0;

  return calculateCartTotals(items, {
    coupon,
    subscriberDiscount,
    subscriberDiscountSlugs,
    taxRate,
    shippingFlatRate,
    isInternational: shippingAddress && shippingAddress.country && shippingAddress.country !== 'US'
  });
}

/**
 * Get current cart from session
 */
router.get('/', async (req, res) => {
  try {
    const customer = await getCustomerContext(req);
    const subscriberDiscount = customer?.subscription?.plan?.product_discount || 0;
    const subscriberDiscountSlugs = customer?.subscription?.plan?.target_slugs || null;

    const cart = req.session.cart || {
      items: [],
      coupon: null,
      totals: {
        subtotal: 0,
        discount: 0,
        tax: 0,
        shipping: 0,
        total: 0
      }
    };

    // Always recalculate on GET to ensure subscriber discount is fresh
    cart.totals = await calculateTotals(cart.items, null, cart.coupon, subscriberDiscount, subscriberDiscountSlugs);
    req.session.cart = cart;

    res.json(cart);
  } catch (err) {
    console.error('Get cart error:', err);
    res.status(500).json({ error: 'Failed to get cart' });
  }
});

/**
 * Apply coupon
 */
router.post('/coupons/apply', async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Coupon code required' });

    const [coupon] = await query(
      `SELECT * FROM coupons 
       WHERE code = ? AND is_active = 1 
       AND (starts_at IS NULL OR starts_at <= NOW())
       AND (expires_at IS NULL OR expires_at >= NOW())
       AND (max_uses IS NULL OR used_count < max_uses)`,
      [code]
    );

    if (!coupon) {
      return res.status(400).json({ error: 'Invalid or expired coupon code' });
    }

    if (!req.session.cart) {
      req.session.cart = { items: [], totals: {} };
    }

    // Check minimum purchase
    const subtotal = req.session.cart.items.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    if (coupon.min_purchase && subtotal < parseFloat(coupon.min_purchase)) {
      return res.status(400).json({ 
        error: `This coupon requires a minimum purchase of $${parseFloat(coupon.min_purchase).toFixed(2)}` 
      });
    }

    req.session.cart.coupon = coupon;
    
    const customer = await getCustomerContext(req);
    const subscriberDiscount = customer?.subscription?.plan?.product_discount || 0;
    const subscriberDiscountSlugs = customer?.subscription?.plan?.target_slugs || null;
    
    req.session.cart.totals = await calculateTotals(
      req.session.cart.items, 
      null, 
      coupon, 
      subscriberDiscount,
      subscriberDiscountSlugs
    );

    res.json(req.session.cart);
  } catch (err) {
    console.error('Apply coupon error:', err);
    res.status(500).json({ error: 'Failed to apply coupon' });
  }
});

/**
 * Remove coupon
 */
router.post('/coupons/remove', async (req, res) => {
  try {
    if (req.session.cart) {
      req.session.cart.coupon = null;
      const customer = await getCustomerContext(req);
      const subscriberDiscount = customer?.subscription?.plan?.product_discount || 0;
      const subscriberDiscountSlugs = customer?.subscription?.plan?.target_slugs || null;
      req.session.cart.totals = await calculateTotals(req.session.cart.items, null, null, subscriberDiscount, subscriberDiscountSlugs);
    }
    res.json(req.session.cart);
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove coupon' });
  }
});

/**
 * Add item to cart
 */
router.post('/items', async (req, res) => {
  try {
    const { productId, variantId, quantity, price } = req.body;

    if (!productId || !quantity || !price) {
      return res.status(400).json({
        error: 'Product ID, quantity, and price are required'
      });
    }

    // Validate product exists
    const product = await query(
      'SELECT id FROM products WHERE id = ?',
      [productId]
    );

    if (!product[0]) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Initialize cart if needed
    if (!req.session.cart) {
      req.session.cart = { items: [], totals: {} };
    }

    // Check if item already in cart
    const existingItem = req.session.cart.items.find(
      item => item.productId === productId && item.variantId === variantId
    );

    if (existingItem) {
      // Update quantity
      existingItem.quantity += parseInt(quantity);
    } else {
      // Add new item
      req.session.cart.items.push({
        productId,
        variantId,
        quantity: parseInt(quantity),
        price: parseFloat(price)
      });
    }

    // Recalculate totals
    const customer = await getCustomerContext(req);
    const subscriberDiscount = customer?.subscription?.plan?.product_discount || 0;
    const subscriberDiscountSlugs = customer?.subscription?.plan?.target_slugs || null;
    req.session.cart.totals = await calculateTotals(
      req.session.cart.items, 
      null, 
      req.session.cart.coupon, 
      subscriberDiscount,
      subscriberDiscountSlugs
    );

    res.json(req.session.cart);
  } catch (err) {
    console.error('Add to cart error:', err);
    res.status(500).json({ error: 'Failed to add item to cart' });
  }
});

/**
 * Update item quantity in cart
 */
router.put('/items/:itemIndex', (req, res) => {
  try {
    const itemIndex = parseInt(req.params.itemIndex);
    const { quantity } = req.body;

    if (quantity === undefined) {
      return res.status(400).json({ error: 'Quantity is required' });
    }

    if (!req.session.cart || !req.session.cart.items[itemIndex]) {
      return res.status(404).json({ error: 'Item not found in cart' });
    }

    if (quantity <= 0) {
      // Remove item if quantity is 0 or negative
      req.session.cart.items.splice(itemIndex, 1);
    } else {
      req.session.cart.items[itemIndex].quantity = parseInt(quantity);
    }

    res.json(req.session.cart);
  } catch (err) {
    console.error('Update cart item error:', err);
    res.status(500).json({ error: 'Failed to update cart' });
  }
});

/**
 * Remove item from cart
 */
router.delete('/items/:itemIndex', async (req, res) => {
  try {
    const itemIndex = parseInt(req.params.itemIndex);

    if (!req.session.cart || !req.session.cart.items[itemIndex]) {
      return res.status(404).json({ error: 'Item not found in cart' });
    }

    req.session.cart.items.splice(itemIndex, 1);

    // Recalculate totals
    const customer = await getCustomerContext(req);
    const subscriberDiscount = customer?.subscription?.plan?.product_discount || 0;
    const subscriberDiscountSlugs = customer?.subscription?.plan?.target_slugs || null;
    req.session.cart.totals = await calculateTotals(
      req.session.cart.items, 
      null, 
      req.session.cart.coupon, 
      subscriberDiscount,
      subscriberDiscountSlugs
    );

    res.json(req.session.cart);
  } catch (err) {
    console.error('Remove cart item error:', err);
    res.status(500).json({ error: 'Failed to remove item from cart' });
  }
});

/**
 * Clear entire cart
 */
router.post('/clear', (req, res) => {
  try {
    req.session.cart = {
      items: [],
      coupon: null,
      totals: {
        subtotal: 0,
        discount: 0,
        tax: 0,
        shipping: 0,
        total: 0
      }
    };

    res.json(req.session.cart);
  } catch (err) {
    console.error('Clear cart error:', err);
    res.status(500).json({ error: 'Failed to clear cart' });
  }
});

/**
 * Calculate cart totals with shipping address
 */
router.post('/totals', async (req, res) => {
  try {
    const { items, shippingAddress } = req.body;

    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ error: 'Items array is required' });
    }

    const customer = await getCustomerContext(req);
    const subscriberDiscount = customer?.subscription?.plan?.product_discount || 0;
    const subscriberDiscountSlugs = customer?.subscription?.plan?.target_slugs || null;
    
    // Check for session coupon if items match current cart
    const coupon = req.session.cart?.coupon;

    const totals = await calculateTotals(items, shippingAddress, coupon, subscriberDiscount, subscriberDiscountSlugs);

    res.json(totals);
  } catch (err) {
    console.error('Calculate totals error:', err);
    res.status(500).json({ error: 'Failed to calculate totals' });
  }
});

export default router;
