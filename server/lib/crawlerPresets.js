/**
 * Predefined configurations for common web platforms.
 * These "Blueprints" capture the quirks of different systems.
 */
export const CRAWLER_PRESETS = {
  shopify: {
    name: 'Shopify',
    maxPages: 1000,
    feedUrl: '/products.json',
    priorityPatterns: ['/products/', '/collections/', '/pages/', '/blogs/'],
    excludePatterns: ['/tagged/', '/search', 'sort_by=', 'view=', 'variant='],
    rules: [
      { selector: 'form[action="/cart/add"]', action: 'setType', value: 'product' },
      { selector: '.product-single__title, .product__title', action: 'setField', value: 'title' },
      { selector: '.product-single__description, .product__description', action: 'setField', value: 'description' },
      { selector: '[data-product-sku]', action: 'setField', value: 'sku' }
    ]
  },
  woocommerce: {
    name: 'WooCommerce',
    maxPages: 1000, // Increased limit
    priorityPatterns: ['/product/', '/product-category/'],
    excludePatterns: ['/cart/', '/checkout/', '/my-account/', 'add-to-cart='],
    rules: [
      { selector: '.type-product', action: 'setType', value: 'product' },
      { selector: '.product_title', action: 'setField', value: 'title' },
      { selector: '.woocommerce-product-details__short-description', action: 'setField', value: 'description' },
      { selector: '.sku', action: 'setField', value: 'sku' }
    ]
  },
  generic_ecommerce: {
    name: 'Generic Store',
    maxPages: 800, // Increased limit
    priorityPatterns: ['/p/', '/product', '/item/'],
    excludePatterns: ['/cart', '/login', '/admin'],
    rules: [
      { selector: 'product-card', action: 'setType', value: 'product' }
    ]
  },
  blog: {
    name: 'Blog/CMS',
    maxPages: 2000, // Higher limit for blogs
    priorityPatterns: ['/post/', '/article/', '/blog/'],
    excludePatterns: ['/wp-admin/', '/admin/', '/login', '/search'],
    rules: [
      { selector: 'article', action: 'setType', value: 'page' },
      { selector: '.post-title, h1', action: 'setField', value: 'title' },
      { selector: '.post-content, .entry-content', action: 'setField', value: 'description' }
    ]
  },
  corporate: {
    name: 'Corporate Site',
    maxPages: 1500, // Corporate sites can be large
    priorityPatterns: ['/about', '/services', '/products', '/contact'],
    excludePatterns: ['/admin', '/login', '/wp-admin'],
    rules: [
      { selector: 'main', action: 'setType', value: 'page' },
      { selector: 'h1', action: 'setField', value: 'title' }
    ]
  }
};
