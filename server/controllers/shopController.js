import { query } from '../db/connection.js';
import { themeRender, renderError } from '../lib/renderer.js';

export const cart = async (req, res) => {
  const { site } = res.locals;
  themeRender(req, res, 'shop/cart.njk', {
    page: { title: 'Shopping Cart', slug: '/cart' },
    seo: {
      title: 'Shopping Cart - ' + site.site_name,
      description: 'View your shopping cart',
      robots: 'noindex, follow'
    }
  });
};

export const checkout = async (req, res) => {
  const { site } = res.locals;
  themeRender(req, res, 'shop/checkout.njk', {
    page: { title: 'Checkout', slug: '/checkout' },
    canceled: req.query.canceled === 'true',
    seo: {
      title: 'Checkout - ' + site.site_name,
      description: 'Complete your purchase',
      robots: 'noindex, follow'
    }
  });
};

export const orderConfirmation = async (req, res) => {
  const { orderNumber } = req.params;
  const { site } = res.locals;

  // Format order number with # prefix for database lookup
  const formattedOrderNumber = orderNumber.startsWith('#') ? orderNumber : `#${orderNumber}`;

  try {
    // Get order from database
    const orders = await query(
      'SELECT * FROM orders WHERE order_number = ?',
      [formattedOrderNumber]
    );

    if (!orders[0]) {
      return renderError(req, res, 404, { title: 'Order Not Found' });
    }

    const order = orders[0];

    // Parse JSON address fields
    try {
      if (typeof order.shipping_address === 'string') {
        order.shipping_address = JSON.parse(order.shipping_address);
      }
      if (typeof order.billing_address === 'string') {
        order.billing_address = JSON.parse(order.billing_address);
      }
    } catch (e) {
      console.warn('Failed to parse order addresses:', e);
    }

    // Get order items
    const orderItems = await query(
      'SELECT * FROM order_items WHERE order_id = ?',
      [order.id]
    );

    themeRender(req, res, 'shop/order-confirmation.njk', {
      page: { title: 'Order Confirmation', slug: `/order-confirmation/${orderNumber}` },
      seo: {
        title: 'Order Confirmation - ' + site.site_name,
        description: 'Your order has been confirmed',
        robots: 'noindex, follow'
      },
      order,
      orderItems
    });
  } catch (err) {
    console.error('Order confirmation error:', err);
    renderError(req, res, 500);
  }
};
