import { info } from '../lib/logger.js';
import * as cheerio from 'cheerio';

/**
 * Parse different feed types into standardized page format
 */
export class FeedParsers {
  constructor(dbName) {
    this.dbName = dbName;
  }

  /**
   * Parse sitemap.xml to extract URLs
   */
  async parseSitemap(sitemapUrl, siteId) {
    try {
      const axios = (await import('axios')).default;
      const { data } = await axios.get(sitemapUrl, {
        headers: { 'User-Agent': 'WebWolf-FeedParser/1.0' },
        timeout: 15000
      });

      const $ = cheerio.load(data, { xmlMode: true });
      const urls = [];

      // Handle sitemap index
      if ($('sitemapindex').length > 0) {
        info(this.dbName, 'SITEMAP_INDEX', 'Processing sitemap index');
        const sitemaps = $('sitemap > loc').map((i, el) => $(el).text()).get();
        
        for (const childSitemap of sitemaps) {
          const childUrls = await this.parseSitemap(childSitemap, siteId);
          urls.push(...childUrls);
        }
      } 
      // Handle URL set
      else if ($('urlset').length > 0) {
        $('url').each((i, el) => {
          const loc = $(el).find('loc').text();
          const lastmod = $(el).find('lastmod').text();
          const priority = $(el).find('priority').text();
          
          if (loc && this.isValidUrl(loc)) {
            urls.push({
              url: loc,
              lastmod: lastmod || null,
              priority: parseFloat(priority) || 0.5,
              source: 'sitemap'
            });
          }
        });
      }

      info(this.dbName, 'SITEMAP_PARSED', `Found ${urls.length} URLs in sitemap`);
      return urls;
    } catch (err) {
      info(this.dbName, 'SITEMAP_ERROR', `Failed to parse sitemap: ${err.message}`);
      return [];
    }
  }

  /**
   * Parse RSS feed
   */
  async parseRss(feedUrl, siteId) {
    try {
      const axios = (await import('axios')).default;
      const { data } = await axios.get(feedUrl, {
        headers: { 'User-Agent': 'WebWolf-FeedParser/1.0' },
        timeout: 15000
      });

      const $ = cheerio.load(data, { xmlMode: true });
      const items = [];

      $('item').each((i, el) => {
        const title = $(el).find('title').text().trim();
        const link = $(el).find('link').text().trim();
        const description = $(el).find('description').text().trim();
        const pubDate = $(el).find('pubDate').text().trim();

        if (link && this.isValidUrl(link)) {
          items.push({
            url: link,
            title: title || 'Untitled',
            description: description || '',
            pubDate: pubDate || null,
            source: 'rss'
          });
        }
      });

      info(this.dbName, 'RSS_PARSED', `Found ${items.length} items in RSS feed`);
      return items;
    } catch (err) {
      info(this.dbName, 'RSS_ERROR', `Failed to parse RSS: ${err.message}`);
      return [];
    }
  }

  /**
   * Parse Atom feed
   */
  async parseAtom(feedUrl, siteId) {
    try {
      const axios = (await import('axios')).default;
      const { data } = await axios.get(feedUrl, {
        headers: { 'User-Agent': 'WebWolf-FeedParser/1.0' },
        timeout: 15000
      });

      const $ = cheerio.load(data, { xmlMode: true });
      const items = [];

      $('entry').each((i, el) => {
        const title = $(el).find('title').text().trim();
        const link = $(el).find('link').attr('href');
        const summary = $(el).find('summary').text().trim() || $(el).find('content').text().trim();
        const updated = $(el).find('updated').text().trim();

        if (link && this.isValidUrl(link)) {
          items.push({
            url: link,
            title: title || 'Untitled',
            description: summary || '',
            pubDate: updated || null,
            source: 'atom'
          });
        }
      });

      info(this.dbName, 'ATOM_PARSED', `Found ${items.length} items in Atom feed`);
      return items;
    } catch (err) {
      info(this.dbName, 'ATOM_ERROR', `Failed to parse Atom: ${err.message}`);
      return [];
    }
  }

  /**
   * Parse Shopify products.json (already exists in crawlerService, but standardized)
   */
  async parseShopifyProducts(feedUrl, siteId) {
    try {
      const axios = (await import('axios')).default;
      const { data } = await axios.get(feedUrl, {
        headers: { 'User-Agent': 'WebWolf-FeedParser/1.0' },
        timeout: 15000
      });

      if (!data.products || !Array.isArray(data.products)) {
        return [];
      }

      const items = data.products.map(product => ({
        url: `${new URL(feedUrl).origin}/products/${product.handle}`,
        title: product.title || 'Untitled',
        description: product.body_html || '',
        price: product.variants?.[0]?.price || 0,
        sku: product.variants?.[0]?.sku || '',
        images: product.images?.map(img => img.src) || [],
        source: 'shopify-products'
      }));

      info(this.dbName, 'SHOPIFY_PARSED', `Found ${items.length} products`);
      return items;
    } catch (err) {
      info(this.dbName, 'SHOPIFY_ERROR', `Failed to parse Shopify products: ${err.message}`);
      return [];
    }
  }

  /**
   * Parse generic API response
   */
  async parseGenericAPI(apiUrl, siteId) {
    try {
      const axios = (await import('axios')).default;
      const { data } = await axios.get(apiUrl, {
        headers: { 'User-Agent': 'WebWolf-FeedParser/1.0' },
        timeout: 15000
      });

      let items = [];
      
      // Handle different API response formats
      if (Array.isArray(data)) {
        items = data;
      } else if (data.data && Array.isArray(data.data)) {
        items = data.data;
      } else if (data.products && Array.isArray(data.products)) {
        items = data.products;
      } else {
        return [];
      }

      const normalized = items.map(item => ({
        url: item.url || item.link || item.href,
        title: item.title || item.name || 'Untitled',
        description: item.description || item.body || '',
        price: item.price || 0,
        sku: item.sku || '',
        images: item.images || [],
        source: 'generic-api'
      })).filter(item => item.url && this.isValidUrl(item.url));

      info(this.dbName, 'GENERIC_API_PARSED', `Found ${normalized.length} items`);
      return normalized;
    } catch (err) {
      info(this.dbName, 'GENERIC_API_ERROR', `Failed to parse generic API: ${err.message}`);
      return [];
    }
  }

  /**
   * Validate URL format
   */
  isValidUrl(url) {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }
}
