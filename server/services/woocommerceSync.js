/**
 * WooCommerce Sync Service
 * 
 * Bidirectional synchronization between WolfWave native tables and WooCommerce-compatible tables.
 * This allows third-party integrations to work with WooCommerce API while maintaining WolfWave's data structure.
 */

import prisma from '../lib/prisma.js';

class WooCommerceSync {
  /**
   * Sync a WolfWave product to WooCommerce tables
   */
  async syncProductToWooCommerce(productId) {
    const [product] = await query(
      `SELECT p.*, c.data, c.title as content_title, c.slug 
       FROM products p 
       LEFT JOIN content c ON p.content_id = c.id 
       WHERE p.id = ?`,
      [productId]
    );

    if (!product) {
      throw new Error(`Product ${productId} not found`);
    }

    const contentData = product.data ? JSON.parse(product.data) : {};
    
    // Check if already synced
    const [existing] = await query(
      `SELECT woocommerce_id FROM wc_wolfwave_sync 
       WHERE entity_type = 'product' AND wolfwave_id = ?`,
      [productId]
    );

    let wcPostId;

    if (existing) {
      wcPostId = existing.woocommerce_id;
      // Update existing WooCommerce post
      await query(
        `UPDATE wp_posts SET 
          post_title = ?,
          post_content = ?,
          post_excerpt = ?,
          post_name = ?,
          post_status = ?,
          post_modified = NOW(),
          post_modified_gmt = UTC_TIMESTAMP()
         WHERE ID = ?`,
        [
          product.content_title || product.title,
          contentData.description || '',
          contentData.short_description || '',
          product.slug,
          product.status === 'active' ? 'publish' : 'draft',
          wcPostId
        ]
      );
    } else {
      // Create new WooCommerce post
      const result = await query(
        `INSERT INTO wp_posts (
          post_author, post_date, post_date_gmt, post_content, post_title,
          post_excerpt, post_status, post_name, post_type, post_modified, post_modified_gmt
        ) VALUES (1, NOW(), UTC_TIMESTAMP(), ?, ?, ?, ?, ?, 'product', NOW(), UTC_TIMESTAMP())`,
        [
          contentData.description || '',
          product.content_title || product.title,
          contentData.short_description || '',
          product.status === 'active' ? 'publish' : 'draft',
          product.slug
        ]
      );

      wcPostId = result.insertId;

      // Create sync mapping
      await query(
        `INSERT INTO wc_wolfwave_sync (entity_type, wolfwave_id, woocommerce_id) 
         VALUES ('product', ?, ?)`,
        [productId, wcPostId]
      );
    }

    // Sync product meta
    await this.syncProductMeta(wcPostId, product, contentData);

    // Sync to product meta lookup table
    await this.syncProductMetaLookup(wcPostId, product);

    return wcPostId;
  }

  /**
   * Sync product metadata to wp_postmeta
   */
  async syncProductMeta(wcPostId, product, contentData) {
    const metaFields = {
      '_sku': product.sku,
      '_regular_price': product.price.toString(),
      '_sale_price': product.compare_at_price ? product.compare_at_price.toString() : '',
      '_price': product.price.toString(),
      '_stock': product.inventory_quantity,
      '_stock_status': product.inventory_quantity > 0 ? 'instock' : 'outofstock',
      '_manage_stock': product.inventory_tracking ? 'yes' : 'no',
      '_backorders': product.allow_backorder ? 'yes' : 'no',
      '_weight': product.weight ? product.weight.toString() : '',
      '_virtual': product.requires_shipping ? 'no' : 'yes',
      '_downloadable': product.is_digital ? 'yes' : 'no',
      '_tax_status': product.taxable ? 'taxable' : 'none',
      '_visibility': 'visible',
      '_featured': 'no',
      '_product_image_gallery': contentData.images ? contentData.images.join(',') : '',
      '_thumbnail_id': contentData.featured_image_id || ''
    };

    // Delete existing meta
    await query(`DELETE FROM wp_postmeta WHERE post_id = ?`, [wcPostId]);

    // Insert all meta fields
    for (const [key, value] of Object.entries(metaFields)) {
      await query(
        `INSERT INTO wp_postmeta (post_id, meta_key, meta_value) VALUES (?, ?, ?)`,
        [wcPostId, key, value]
      );
    }
  }

  /**
   * Sync to product meta lookup table for performance
   */
  async syncProductMetaLookup(wcPostId, product) {
    await query(
      `INSERT INTO wc_product_meta_lookup (
        product_id, sku, virtual, downloadable, min_price, max_price,
        stock_quantity, stock_status, tax_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        sku = VALUES(sku),
        virtual = VALUES(virtual),
        downloadable = VALUES(downloadable),
        min_price = VALUES(min_price),
        max_price = VALUES(max_price),
        stock_quantity = VALUES(stock_quantity),
        stock_status = VALUES(stock_status),
        tax_status = VALUES(tax_status)`,
      [
        wcPostId,
        product.sku,
        product.requires_shipping ? 0 : 1,
        product.is_digital ? 1 : 0,
        product.price,
        product.price,
        product.inventory_quantity,
        product.inventory_quantity > 0 ? 'instock' : 'outofstock',
        product.taxable ? 'taxable' : 'none'
      ]
    );
  }

  /**
   * Sync a WolfWave order to WooCommerce tables
   */
  async syncOrderToWooCommerce(orderId) {
    const [order] = await query(
      `SELECT o.*, c.email as customer_email, c.first_name, c.last_name
       FROM orders o
       LEFT JOIN customers c ON o.customer_id = c.id
       WHERE o.id = ?`,
      [orderId]
    );

    if (!order) {
      throw new Error(`Order ${orderId} not found`);
    }

    // Check if already synced
    const [existing] = await query(
      `SELECT woocommerce_id FROM wc_wolfwave_sync 
       WHERE entity_type = 'order' AND wolfwave_id = ?`,
      [orderId]
    );

    let wcPostId;

    if (existing) {
      wcPostId = existing.woocommerce_id;
      // Update existing order
      await query(
        `UPDATE wp_posts SET 
          post_status = ?,
          post_modified = NOW(),
          post_modified_gmt = UTC_TIMESTAMP()
         WHERE ID = ?`,
        [this.mapOrderStatus(order.status), wcPostId]
      );
    } else {
      // Create new WooCommerce order post
      const result = await query(
        `INSERT INTO wp_posts (
          post_author, post_date, post_date_gmt, post_content, post_title,
          post_status, post_type, post_modified, post_modified_gmt
        ) VALUES (1, ?, UTC_TIMESTAMP(), '', ?, ?, 'shop_order', NOW(), UTC_TIMESTAMP())`,
        [
          order.created_at,
          `Order &ndash; ${order.created_at}`,
          this.mapOrderStatus(order.status)
        ]
      );

      wcPostId = result.insertId;

      // Create sync mapping
      await query(
        `INSERT INTO wc_wolfwave_sync (entity_type, wolfwave_id, woocommerce_id) 
         VALUES ('order', ?, ?)`,
        [orderId, wcPostId]
      );
    }

    // Sync order meta
    await this.syncOrderMeta(wcPostId, order);

    // Sync order items
    await this.syncOrderItems(wcPostId, orderId);

    return wcPostId;
  }

  /**
   * Sync order metadata
   */
  async syncOrderMeta(wcPostId, order) {
    const billingAddress = JSON.parse(order.billing_address);
    const shippingAddress = JSON.parse(order.shipping_address);

    const metaFields = {
      '_order_key': `wc_order_${order.order_number}`,
      '_customer_user': order.customer_id,
      '_payment_method': order.payment_method,
      '_payment_method_title': order.payment_method.charAt(0).toUpperCase() + order.payment_method.slice(1),
      '_order_total': order.total.toString(),
      '_order_tax': order.tax.toString(),
      '_order_shipping': order.shipping.toString(),
      '_cart_discount': order.discount.toString(),
      '_billing_first_name': billingAddress.first_name || '',
      '_billing_last_name': billingAddress.last_name || '',
      '_billing_company': billingAddress.company || '',
      '_billing_address_1': billingAddress.address1 || '',
      '_billing_address_2': billingAddress.address2 || '',
      '_billing_city': billingAddress.city || '',
      '_billing_state': billingAddress.province || '',
      '_billing_postcode': billingAddress.postal_code || '',
      '_billing_country': billingAddress.country || '',
      '_billing_email': order.email,
      '_billing_phone': billingAddress.phone || '',
      '_shipping_first_name': shippingAddress.first_name || '',
      '_shipping_last_name': shippingAddress.last_name || '',
      '_shipping_company': shippingAddress.company || '',
      '_shipping_address_1': shippingAddress.address1 || '',
      '_shipping_address_2': shippingAddress.address2 || '',
      '_shipping_city': shippingAddress.city || '',
      '_shipping_state': shippingAddress.province || '',
      '_shipping_postcode': shippingAddress.postal_code || '',
      '_shipping_country': shippingAddress.country || '',
      '_order_currency': 'USD',
      '_prices_include_tax': 'no'
    };

    // Delete existing meta
    await query(`DELETE FROM wp_postmeta WHERE post_id = ?`, [wcPostId]);

    // Insert all meta fields
    for (const [key, value] of Object.entries(metaFields)) {
      await query(
        `INSERT INTO wp_postmeta (post_id, meta_key, meta_value) VALUES (?, ?, ?)`,
        [wcPostId, key, value]
      );
    }
  }

  /**
   * Sync order items to woocommerce_order_items and woocommerce_order_itemmeta
   */
  async syncOrderItems(wcPostId, orderId) {
    // Delete existing items
    await query(
      `DELETE FROM woocommerce_order_itemmeta 
       WHERE order_item_id IN (
         SELECT order_item_id FROM woocommerce_order_items WHERE order_id = ?
       )`,
      [wcPostId]
    );
    await query(`DELETE FROM woocommerce_order_items WHERE order_id = ?`, [wcPostId]);

    // Get WolfWave order items
    const items = await query(
      `SELECT * FROM order_items WHERE order_id = ?`,
      [orderId]
    );

    for (const item of items) {
      // Create order item
      const result = await query(
        `INSERT INTO woocommerce_order_items (order_item_name, order_item_type, order_id)
         VALUES (?, 'line_item', ?)`,
        [item.product_title, wcPostId]
      );

      const orderItemId = result.insertId;

      // Get WooCommerce product ID
      const [syncMapping] = await query(
        `SELECT woocommerce_id FROM wc_wolfwave_sync 
         WHERE entity_type = 'product' AND wolfwave_id = ?`,
        [item.product_id]
      );

      const wcProductId = syncMapping ? syncMapping.woocommerce_id : 0;

      // Add item meta
      const itemMeta = {
        '_product_id': wcProductId,
        '_variation_id': item.variant_id || 0,
        '_qty': item.quantity,
        '_line_subtotal': item.subtotal.toString(),
        '_line_total': item.subtotal.toString(),
        '_line_tax': '0',
        '_line_subtotal_tax': '0'
      };

      for (const [key, value] of Object.entries(itemMeta)) {
        await query(
          `INSERT INTO woocommerce_order_itemmeta (order_item_id, meta_key, meta_value)
           VALUES (?, ?, ?)`,
          [orderItemId, key, value]
        );
      }
    }
  }

  /**
   * Sync a WolfWave customer to WordPress user tables
   */
  async syncCustomerToWooCommerce(customerId) {
    const [customer] = await query(
      `SELECT * FROM customers WHERE id = ?`,
      [customerId]
    );

    if (!customer) {
      throw new Error(`Customer ${customerId} not found`);
    }

    // Check if already synced
    const [existing] = await query(
      `SELECT woocommerce_id FROM wc_wolfwave_sync 
       WHERE entity_type = 'customer' AND wolfwave_id = ?`,
      [customerId]
    );

    let wcUserId;

    if (existing) {
      wcUserId = existing.woocommerce_id;
      // Update existing user
      await query(
        `UPDATE wp_users SET 
          user_email = ?,
          display_name = ?
         WHERE ID = ?`,
        [
          customer.email,
          `${customer.first_name || ''} ${customer.last_name || ''}`.trim(),
          wcUserId
        ]
      );
    } else {
      // Create new WordPress user
      const result = await query(
        `INSERT INTO wp_users (
          user_login, user_pass, user_nicename, user_email, 
          user_registered, display_name
        ) VALUES (?, ?, ?, ?, NOW(), ?)`,
        [
          customer.email,
          customer.password || '',
          customer.email.split('@')[0],
          customer.email,
          `${customer.first_name || ''} ${customer.last_name || ''}`.trim()
        ]
      );

      wcUserId = result.insertId;

      // Create sync mapping
      await query(
        `INSERT INTO wc_wolfwave_sync (entity_type, wolfwave_id, woocommerce_id) 
         VALUES ('customer', ?, ?)`,
        [customerId, wcUserId]
      );
    }

    // Sync customer meta
    await this.syncCustomerMeta(wcUserId, customer);

    return wcUserId;
  }

  /**
   * Sync customer metadata
   */
  async syncCustomerMeta(wcUserId, customer) {
    const metaFields = {
      'first_name': customer.first_name || '',
      'last_name': customer.last_name || '',
      'billing_first_name': customer.first_name || '',
      'billing_last_name': customer.last_name || '',
      'billing_email': customer.email,
      'billing_phone': customer.phone || ''
    };

    // Delete existing meta
    await query(`DELETE FROM wp_usermeta WHERE user_id = ?`, [wcUserId]);

    // Insert all meta fields
    for (const [key, value] of Object.entries(metaFields)) {
      await query(
        `INSERT INTO wp_usermeta (user_id, meta_key, meta_value) VALUES (?, ?, ?)`,
        [wcUserId, key, value]
      );
    }
  }

  /**
   * Map WolfWave order status to WooCommerce status
   */
  mapOrderStatus(status) {
    const statusMap = {
      'pending': 'wc-pending',
      'processing': 'wc-processing',
      'shipped': 'wc-completed',
      'completed': 'wc-completed',
      'cancelled': 'wc-cancelled',
      'refunded': 'wc-refunded'
    };
    return statusMap[status] || 'wc-pending';
  }

  /**
   * Sync all products
   */
  async syncAllProducts() {
    const products = await query(`SELECT id FROM products WHERE status = 'active'`);
    const results = [];

    for (const product of products) {
      try {
        const wcId = await this.syncProductToWooCommerce(product.id);
        results.push({ productId: product.id, wcId, success: true });
      } catch (error) {
        results.push({ productId: product.id, success: false, error: error.message });
      }
    }

    return results;
  }

  /**
   * Sync all orders
   */
  async syncAllOrders() {
    const orders = await query(`SELECT id FROM orders`);
    const results = [];

    for (const order of orders) {
      try {
        const wcId = await this.syncOrderToWooCommerce(order.id);
        results.push({ orderId: order.id, wcId, success: true });
      } catch (error) {
        results.push({ orderId: order.id, success: false, error: error.message });
      }
    }

    return results;
  }

  /**
   * Sync all customers
   */
  async syncAllCustomers() {
    const customers = await query(`SELECT id FROM customers`);
    const results = [];

    for (const customer of customers) {
      try {
        const wcId = await this.syncCustomerToWooCommerce(customer.id);
        results.push({ customerId: customer.id, wcId, success: true });
      } catch (error) {
        results.push({ customerId: customer.id, success: false, error: error.message });
      }
    }

    return results;
  }
}

export default new WooCommerceSync();
