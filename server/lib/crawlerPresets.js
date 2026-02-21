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
      { urlPattern: '/pages/', action: 'setType', value: 'page' },
      { urlPattern: '/blogs/', action: 'setType', value: 'page' },
      { urlPattern: '^/collections(/|$)', action: 'setType', value: 'page' },
      { urlPattern: '^/products$', action: 'setType', value: 'page' },
      { selector: 'form[action="/cart/add"]', urlPattern: '^/products/[^/]+$', action: 'setType', value: 'product' },
      { selector: '.product-single__title, .product__title', action: 'setField', value: 'title' },
      { selector: '.product-single__description, .product__description', action: 'setField', value: 'description' },
      { selector: '[data-product-sku]', action: 'setField', value: 'sku' }
    ]
  },
  woocommerce: {
    name: 'WooCommerce',
    maxPages: 1000,
    priorityPatterns: ['/product/', '/product-category/'],
    excludePatterns: ['/cart/', '/checkout/', '/my-account/', 'add-to-cart='],
    rules: [
      { selector: '.type-product', action: 'setType', value: 'product' },
      { selector: '.product_title', action: 'setField', value: 'title' },
      { selector: '.woocommerce-product-details__short-description', action: 'setField', value: 'description' },
      { selector: '.sku', action: 'setField', value: 'sku' }
    ]
  },
  magento: {
    name: 'Magento',
    maxPages: 1000,
    priorityPatterns: ['/catalog/product/', '.html'],
    excludePatterns: ['/customer/', '/checkout/', '/catalogsearch/', 'dir=', 'mode='],
    rules: [
      { selector: '.catalog-product-view', action: 'setType', value: 'product' },
      { selector: '.page-title .value, .product-name h1', action: 'setField', value: 'title' },
      { selector: '.product-description, .description .std', action: 'setField', value: 'description' },
      { selector: '.product-info-stock-sku .sku', action: 'setField', value: 'sku' }
    ]
  },
  bigcommerce: {
    name: 'BigCommerce',
    maxPages: 1000,
    priorityPatterns: ['/products/', '/categories/'],
    excludePatterns: ['/cart.php', '/login.php', '/checkout'],
    rules: [
      { selector: '.productView', action: 'setType', value: 'product' },
      { selector: '.productView-title', action: 'setField', value: 'title' },
      { selector: '.productView-description', action: 'setField', value: 'description' }
    ]
  },
  prestashop: {
    name: 'PrestaShop',
    maxPages: 1000,
    priorityPatterns: ['/controller=product', '/p/'],
    excludePatterns: ['/controller=cart', '/controller=authentication'],
    rules: [
      { selector: '#product', action: 'setType', value: 'product' },
      { selector: 'h1[itemprop="name"]', action: 'setField', value: 'title' },
      { selector: '#description', action: 'setField', value: 'description' }
    ]
  },
  webflow: {
    name: 'Webflow',
    maxPages: 1000,
    rules: [
      { selector: 'h1', action: 'setField', value: 'title' }
    ]
  },
  squarespace: {
    name: 'Squarespace',
    maxPages: 1000,
    priorityPatterns: ['/pages/', '/products/'],
    excludePatterns: ['/cart', '/login', '/config'],
    rules: [
      { selector: '.Main-content, .sqs-layout', action: 'setType', value: 'page' },
      { selector: 'h1.entry-title, .ProductItem-details-title', action: 'setField', value: 'title' },
      { selector: '.sqs-block-html, .ProductItem-details-excerpt', action: 'setField', value: 'description' }
    ]
  },
  wix: {
    name: 'Wix',
    maxPages: 1000,
    rules: [
      { selector: 'main', action: 'setType', value: 'page' },
      { selector: 'h1', action: 'setField', value: 'title' }
    ]
  },
  generic_ecommerce: {
    name: 'Generic Store',
    maxPages: 800,
    priorityPatterns: ['/p/', '/product', '/item/'],
    excludePatterns: ['/cart', '/login', '/admin'],
    rules: [
      { selector: 'product-card', action: 'setType', value: 'product' }
    ]
  },
  blog: {
    name: 'Blog/CMS',
    maxPages: 2000,
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
    maxPages: 1500,
    priorityPatterns: ['/about', '/services', '/products', '/contact'],
    excludePatterns: ['/admin', '/login', '/wp-admin'],
    rules: [
      { selector: 'main', action: 'setType', value: 'page' },
      { selector: 'h1', action: 'setField', value: 'title' }
    ]
  }
};
