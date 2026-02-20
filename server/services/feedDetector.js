import axios from 'axios';
import { info, warn } from '../lib/logger.js';

/**
 * Detect and validate various feed types from a target domain
 */
export class FeedDetector {
  constructor(baseUrl, dbName) {
    this.baseUrl = new URL(baseUrl);
    this.dbName = dbName;
    this.userAgent = 'WebWolf-FeedDetector/1.0';
  }

  /**
   * Try multiple feed endpoints and return the first successful one
   */
  async detectFeed() {
    const feedTests = [
      this.testSitemap(),
      this.testRssFeed(),
      this.testAtomFeed(), 
      this.testShopifyProducts(),
      this.testShopifyAdmin(),
      this.testWooCommerceAPI(),
      this.testGenericProductsAPI()
    ];

    for (const feedTest of feedTests) {
      try {
        const result = await feedTest;
        if (result) {
          info(this.dbName, 'FEED_DETECTED', `Found ${result.type} feed: ${result.url}`);
          return result;
        }
      } catch (err) {
        // Continue to next feed type
      }
    }

    warn(this.dbName, 'NO_FEED_DETECTED', 'No structured feeds found, falling back to crawling');
    return null;
  }

  /**
   * Test for sitemap.xml
   */
  async testSitemap() {
    const sitemapUrl = `${this.baseUrl.origin}/sitemap.xml`;
    try {
      const response = await axios.get(sitemapUrl, {
        headers: { 'User-Agent': this.userAgent },
        timeout: 10000,
        validateStatus: (status) => status === 200
      });

      if (response.data.includes('<urlset') || response.data.includes('<sitemapindex')) {
        return {
          type: 'sitemap',
          url: sitemapUrl,
          parser: 'parseSitemap',
          priority: 1 // Highest priority
        };
      }
    } catch (err) {
      // Sitemap not found or invalid
    }
    return null;
  }

  /**
   * Test for RSS feeds
   */
  async testRssFeed() {
    const rssPaths = ['/feed', '/rss', '/feed.xml', '/rss.xml'];
    
    for (const path of rssPaths) {
      const rssUrl = `${this.baseUrl.origin}${path}`;
      try {
        const response = await axios.get(rssUrl, {
          headers: { 'User-Agent': this.userAgent },
          timeout: 10000,
          validateStatus: (status) => status === 200
        });

        if (response.data.includes('<rss') || response.data.includes('<channel>')) {
          return {
            type: 'rss',
            url: rssUrl,
            parser: 'parseRss',
            priority: 2
          };
        }
      } catch (err) {
        // RSS feed not found
      }
    }
    return null;
  }

  /**
   * Test for Atom feeds
   */
  async testAtomFeed() {
    const atomPaths = ['/feed', '/atom', '/atom.xml'];
    
    for (const path of atomPaths) {
      const atomUrl = `${this.baseUrl.origin}${path}`;
      try {
        const response = await axios.get(atomUrl, {
          headers: { 'User-Agent': this.userAgent },
          timeout: 10000,
          validateStatus: (status) => status === 200
        });

        if (response.data.includes('<feed') || response.data.includes('<entry>')) {
          return {
            type: 'atom',
            url: atomUrl,
            parser: 'parseAtom',
            priority: 2
          };
        }
      } catch (err) {
        // Atom feed not found
      }
    }
    return null;
  }

  /**
   * Test for Shopify products.json
   */
  async testShopifyProducts() {
    const productsUrl = `${this.baseUrl.origin}/products.json`;
    try {
      const response = await axios.get(productsUrl, {
        headers: { 'User-Agent': this.userAgent },
        timeout: 10000,
        validateStatus: (status) => status === 200
      });

      if (response.data?.products && Array.isArray(response.data.products)) {
        return {
          type: 'shopify-products',
          url: productsUrl,
          parser: 'parseShopifyProducts',
          priority: 3
        };
      }
    } catch (err) {
      // Shopify products not found
    }
    return null;
  }

  /**
   * Test for Shopify Admin API (requires auth, so just detect endpoint)
   */
  async testShopifyAdmin() {
    const adminUrl = `${this.baseUrl.origin}/admin/api/2023-01/products.json`;
    try {
      const response = await axios.get(adminUrl, {
        headers: { 'User-Agent': this.userAgent },
        timeout: 5000,
        validateStatus: (status) => status === 401 || status === 403 // Auth required but endpoint exists
      });

      if (response.status === 401 || response.status === 403) {
        return {
          type: 'shopify-admin',
          url: adminUrl,
          parser: 'parseShopifyAdmin',
          priority: 4,
          requiresAuth: true
        };
      }
    } catch (err) {
      // Admin API not found
    }
    return null;
  }

  /**
   * Test for WooCommerce REST API
   */
  async testWooCommerceAPI() {
    const wcUrl = `${this.baseUrl.origin}/wp-json/wc/v3/products`;
    try {
      const response = await axios.get(wcUrl, {
        headers: { 'User-Agent': this.userAgent },
        timeout: 10000,
        validateStatus: (status) => status < 500
      });

      if (response.status === 401 || response.status === 403) {
        return {
          type: 'woocommerce',
          url: wcUrl,
          parser: 'parseWooCommerce',
          priority: 4,
          requiresAuth: true
        };
      }
    } catch (err) {
      // WooCommerce API not found
    }
    return null;
  }

  /**
   * Test for generic products API
   */
  async testGenericProductsAPI() {
    const apiPaths = ['/api/products', '/api/v1/products', '/api/items'];
    
    for (const path of apiPaths) {
      const apiUrl = `${this.baseUrl.origin}${path}`;
      try {
        const response = await axios.get(apiUrl, {
          headers: { 'User-Agent': this.userAgent },
          timeout: 10000,
          validateStatus: (status) => status === 200
        });

        if (Array.isArray(response.data) || (response.data?.data && Array.isArray(response.data.data))) {
          return {
            type: 'generic-api',
            url: apiUrl,
            parser: 'parseGenericAPI',
            priority: 5
          };
        }
      } catch (err) {
        // API not found
      }
    }
    return null;
  }
}
