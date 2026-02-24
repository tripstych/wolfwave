import axios from 'axios';
import * as cheerio from 'cheerio';
import crypto from 'crypto';
import prisma from '../lib/prisma.js';
import { runWithTenant, getCurrentDbName } from '../lib/tenantContext.js';
import { info, error as logError } from '../lib/logger.js';
import { extractMetadata } from './scraperService.js';
import { CRAWLER_PRESETS } from '../lib/crawlerPresets.js';
import { SYSTEM_ROUTES } from '../lib/systemRoutes.js';

function normalizeUrl(url) {
  try {
    const nUrl = new URL(url);
    nUrl.hash = '';
    
    // List of common query params to strip
    const stripParams = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 
      'fbclid', 'gclid', 'ref', 'variant', 'view',
      'pr_prod_strat', 'pr_rec_id', 'pr_rec_pid', 'pr_ref_pid', 'pr_seq', '_ss', '_v', '_pos'
    ];
    stripParams.forEach(p => nUrl.searchParams.delete(p));

    let cleaned = nUrl.toString();
    if (cleaned.endsWith('/') && nUrl.pathname !== '/') cleaned = cleaned.slice(0, -1);
    return cleaned;
  } catch { return null; }
}

async function detectBlueprint(rootUrl, dbName) {
  try {
    const { data: html, headers } = await axios.get(rootUrl, {
      timeout: 10000,
      headers: { 'User-Agent': 'WebWolf-Detector/1.0' }
    });
    const $ = cheerio.load(html);

    // Shopify detection
    if (html.includes('Shopify.shop') || html.includes('cdn.shopify.com') || headers['x-shopify-stage']) {
      info(dbName, 'BLUEPRINT_DETECTED', 'Platform: Shopify');
      return CRAWLER_PRESETS.shopify;
    }

    // WooCommerce detection
    if (html.includes('woocommerce') || html.includes('wp-content/plugins/woocommerce') || $('body').hasClass('woocommerce')) {
      info(dbName, 'BLUEPRINT_DETECTED', 'Platform: WooCommerce');
      return CRAWLER_PRESETS.woocommerce;
    }

    // Magento detection
    if (html.includes('Mage.Cookies') || html.includes('skin/frontend') || html.includes('js/varien')) {
      info(dbName, 'BLUEPRINT_DETECTED', 'Platform: Magento');
      return CRAWLER_PRESETS.magento;
    }

    // BigCommerce detection
    if (html.includes('cdn11.bigcommerce.com') || html.includes('Stencil') || html.includes('BCData')) {
      info(dbName, 'BLUEPRINT_DETECTED', 'Platform: BigCommerce');
      return CRAWLER_PRESETS.bigcommerce;
    }

    // PrestaShop detection
    if (html.includes('prestashop') || html.includes('themes/prestashop')) {
      info(dbName, 'BLUEPRINT_DETECTED', 'Platform: PrestaShop');
      return CRAWLER_PRESETS.prestashop;
    }

    // Webflow detection
    if (html.includes('w-webflow') || $('html').attr('data-wf-page') || $('meta[name="generator"]').attr('content')?.includes('Webflow')) {
      info(dbName, 'BLUEPRINT_DETECTED', 'Platform: Webflow');
      return CRAWLER_PRESETS.webflow;
    }

    // Squarespace detection
    if (html.includes('Static.SQUARESPACE_CACHE') || html.includes('squarespace.com')) {
      info(dbName, 'BLUEPRINT_DETECTED', 'Platform: Squarespace');
      return CRAWLER_PRESETS.squarespace;
    }

    // Wix detection
    if (html.includes('wix.com') || html.includes('static.wixstatic.com')) {
      info(dbName, 'BLUEPRINT_DETECTED', 'Platform: Wix');
      return CRAWLER_PRESETS.wix;
    }

    info(dbName, 'BLUEPRINT_DETECTED', 'No specific platform detected, using generic');
    return null;
  } catch (err) {
    logError(dbName, err, 'BLUEPRINT_DETECTION_FAILED');
    return null;
  }
}

function discoverLinks($, currentUrl, rootDomain, visited, queue, config = {}) {
  const priorityPatterns = config.priorityPatterns || ['/products/'];
  const excludePatterns = config.excludePatterns || ['/tagged/', '/search', 'sort_by='];
  
  // Add all system routes to exclude list
  const systemPaths = SYSTEM_ROUTES.map(r => r.url);
  
  let found = 0;

  $('a[href]').each((i, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    try {
      const absoluteUrl = new URL(href, currentUrl);
      const path = absoluteUrl.pathname.toLowerCase();
      const search = absoluteUrl.search.toLowerCase();

      if (absoluteUrl.hostname === rootDomain && ['http:', 'https:'].includes(absoluteUrl.protocol)) {
        if (path.match(/\.(jpg|jpeg|png|gif|pdf|zip|gz|mp4|mp3|css|js|svg|woff|woff2)$/)) return;
        
        // Exclude custom patterns AND system paths
        if (excludePatterns.some(p => path.includes(p) || search.includes(p))) return;
        if (systemPaths.some(p => path === p || path === p + '/')) return;

        // Normalize Shopify collection product URLs to canonical /products/ form
        const collectionProductMatch = path.match(/\/collections\/[^/]+\/products\/(.+)/);
        if (collectionProductMatch) {
          absoluteUrl.pathname = '/products/' + collectionProductMatch[1];
        }

        const cleanUrl = normalizeUrl(absoluteUrl.toString());
        if (cleanUrl && !visited.has(cleanUrl) && !queue.includes(cleanUrl)) {
          found++;
          if (priorityPatterns.some(p => path.includes(p))) queue.unshift(cleanUrl);
          else queue.push(cleanUrl);
        }
      }
    } catch {}
  });
}

function calculateStructuralHash(html) {
  try {
    const $ = cheerio.load(html);
    $('script, style, noscript').remove();
    const body = $('body')[0];
    if (!body) return null;
    const tags = [];
    const IGNORED = new Set(['a', 'span', 'i', 'strong', 'em', 'b', 'u', 'br', 'svg', 'path', 'script', 'style', 'noscript']);
    function traverse(node, depth = 0) {
      if (depth > 10 || node.type !== 'tag' || IGNORED.has(node.name)) return;
      tags.push(node.name);
      let last = '';
      $(node).children().each((i, el) => {
        if (el.type === 'tag' && el.name !== last) { traverse(el, depth + 1); last = el.name; }
      });
      tags.push(`/${node.name}`);
    }
    traverse(body);
    return crypto.createHash('sha256').update(tags.join('>')).digest('hex');
  } catch { return null; }
}

/**
 * Fast sync for structured feeds (Shopify products.json, etc.)
 */
async function syncFromFeed(siteId, feedUrl, dbName) {
  try {
    info(dbName, 'FEED_SYNC_START', `Starting fast sync from ${feedUrl}`);
    const { data } = await axios.get(feedUrl, {
      headers: { 'User-Agent': 'WebWolf-Sync/1.0' },
      timeout: 15000
    });

    if (data.products && Array.isArray(data.products)) {
      let count = 0;
      for (const p of data.products) {
        const productUrl = `${new URL(feedUrl).origin}/products/${p.handle}`;
        const meta = {
          title: p.title,
          description: p.body_html,
          images: p.images?.map(img => img.src) || [],
          sku: p.variants?.[0]?.sku || '',
          price: p.variants?.[0]?.price || 0,
          type: 'product',
          canonical: productUrl,
          options: p.options?.map(o => ({ name: o.name, values: o.values })) || [],
          variants: p.variants?.map((v, i) => ({
            title: v.title,
            sku: v.sku || '',
            price: v.price,
            compare_at_price: v.compare_at_price,
            option1: v.option1 || null,
            option2: v.option2 || null,
            option3: v.option3 || null,
            inventory_quantity: v.inventory_quantity || 0,
            image: v.featured_image?.src || null,
            position: i + 1
          })) || []
        };

        const existing = await prisma.staged_items.findFirst({
          where: { site_id: siteId, url: productUrl }
        });
        if (existing) {
          await prisma.staged_items.update({
            where: { id: existing.id },
            data: { title: p.title.substring(0, 255), item_type: 'product', raw_html: p.body_html, metadata: meta, status: 'completed' }
          });
        } else {
          await prisma.staged_items.create({
            data: {
              site_id: siteId,
              url: productUrl,
              title: p.title.substring(0, 255),
              item_type: 'product',
              raw_html: p.body_html,
              structural_hash: 'feed-item',
              metadata: meta,
              status: 'completed'
            }
          });
        }
        count++;
      }

      await prisma.imported_sites.update({
        where: { id: siteId },
        data: { page_count: count }
      });
      return true;
    }
    return false;
  } catch (err) {
    logError(dbName, err, 'FEED_SYNC_FAILED');
    return false;
  }
}

export async function crawlSite(siteId, rootUrl) {
  const dbName = getCurrentDbName();
  runWithTenant(dbName, async () => {
    try {
      const siteRecord = await prisma.imported_sites.findUnique({ where: { id: siteId } });
      let config = siteRecord?.config ? (typeof siteRecord.config === 'string' ? JSON.parse(siteRecord.config) : siteRecord.config) : {};
      
      // Auto-detect blueprint if requested and no specific rules are set
      if (config.autoDetect) {
        const detected = await detectBlueprint(rootUrl, dbName);
        if (detected) {
          // Merge detected settings into config, but provided config takes precedence
          config = {
            ...detected,
            ...config,
            rules: [...(detected.rules || []), ...(config.rules || [])]
          };
          
          // Deduplicate rules by value (simplistic)
          const seen = new Set();
          config.rules = config.rules.filter(r => {
            const key = `${r.action}:${r.value}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });

          // Update the site record with the enriched config
          await prisma.imported_sites.update({
            where: { id: siteId },
            data: { config }
          });
        }
      }

      // Use configured feed URL if available (products only)
      let feedSynced = false;
      if (config.feedUrl) {
        feedSynced = await syncFromFeed(siteId, config.feedUrl, dbName);
        if (feedSynced) {
          info(dbName, 'FEED_SYNC_DONE', 'Feed sync complete, continuing crawl for pages/blogs');
        }
      }

      // Always do a traditional crawl to pick up pages, blogs, etc.
      info(dbName, 'CRAWL_START', `Starting traditional crawl with max pages: ${config.maxPages || 1000}`);
      await traditionalCrawl(siteId, rootUrl, config, dbName, feedSynced);
    } catch (err) {
      logError(dbName, err, 'CRAWL_SITE_CRITICAL');
      await prisma.imported_sites.update({ where: { id: siteId }, data: { status: 'failed' } }).catch(() => {});
    }
  });
}

async function fetchSitemap(rootUrl, dbName) {
  const sitemaps = [
    '/sitemap.xml',
    '/sitemap_products_1.xml',
    '/sitemap_pages_1.xml'
  ];
  const urls = [];

  for (const path of sitemaps) {
    try {
      const sitemapUrl = new URL(path, rootUrl).toString();
      const { data } = await axios.get(sitemapUrl, { timeout: 5000, headers: { 'User-Agent': 'WebWolf-Sitemap/1.0' } });
      const $ = cheerio.load(data, { xmlMode: true });
      
      $('url loc').each((i, el) => {
        const url = $(el).text().trim();
        if (url) urls.push(url);
      });
      
      // Also look for nested sitemaps
      $('sitemap loc').each((i, el) => {
        const nestedUrl = $(el).text().trim();
        // We'll only follow one level deep for simplicity
        if (nestedUrl && nestedUrl.endsWith('.xml')) {
           // We could recurse here, but let's stick to simple discovery
        }
      });

      if (urls.length > 0) {
        info(dbName, 'SITEMAP_FOUND', `Found ${urls.length} URLs in ${path}`);
      }
    } catch (e) {}
  }
  return [...new Set(urls)];
}

/**
 * Traditional crawling fallback
 */
async function traditionalCrawl(siteId, rootUrl, config, dbName, feedSynced = false) {
  const visited = new Set();
  const queue = [normalizeUrl(rootUrl)];
  const maxPages = config.maxPages || 1000;
  const rootDomain = new URL(rootUrl).hostname;

  // 1. Sitemap Discovery (Priority Seed)
  info(dbName, 'SITEMAP_START', `Attempting sitemap discovery for ${rootUrl}`);
  const sitemapUrls = await fetchSitemap(rootUrl, dbName);
  sitemapUrls.forEach(url => {
    const norm = normalizeUrl(url);
    if (norm && !queue.includes(norm)) queue.push(norm);
  });

  // Pre-populate visited set with URLs already imported (e.g. from feed sync)
  const existingPages = await prisma.staged_items.findMany({
    where: { site_id: siteId },
    select: { url: true }
  });
  let pageCount = existingPages.length;
  for (const p of existingPages) {
    visited.add(normalizeUrl(p.url));
  }

  await prisma.imported_sites.update({ where: { id: siteId }, data: { status: 'crawling' } });

  info(dbName, 'CRAWL_CONFIG', `Max pages: ${maxPages}, Domain: ${rootDomain}`);

  while (queue.length > 0 && pageCount < maxPages) {
    const url = queue.shift();
    const normalizedUrl = normalizeUrl(url);
    if (!normalizedUrl || visited.has(normalizedUrl)) continue;

    const currentSite = await prisma.imported_sites.findUnique({ where: { id: siteId }, select: { status: true } });
    if (currentSite?.status === 'cancelled') return;

    visited.add(normalizedUrl);

    // Feed sync already imported products with full variant data — skip product URLs
    if (feedSynced) {
      const urlPath = new URL(normalizedUrl).pathname.toLowerCase();
      if (urlPath.match(/^\/products\/[^/]+/) || urlPath.match(/^\/collections\/[^/]+\/products\//)) {
        continue;
      }
    }

    try {
      info(dbName, 'CRAWL_PAGE', `Fetching ${normalizedUrl} (${pageCount + 1}/${maxPages})`);
      const { data: html } = await axios.get(normalizedUrl, { headers: { 'User-Agent': 'WebWolf-Crawler/1.0' }, timeout: 10000, validateStatus: (status) => status < 400 });

      const $ = cheerio.load(html);
      const structuralHash = calculateStructuralHash(html);
      const meta = extractMetadata($, config.rules || [], normalizedUrl);

      // REDIRECT TO CANONICAL: If the page has a canonical link, we should use that as the primary URL
      let targetUrl = normalizedUrl;
      if (meta.canonical) {
        try {
          const canonicalUrl = normalizeUrl(new URL(meta.canonical, normalizedUrl).toString());
          if (canonicalUrl && canonicalUrl !== normalizedUrl) {
            info(dbName, 'CRAWL_CANONICAL', `Using canonical URL: ${canonicalUrl} instead of ${normalizedUrl}`);
            targetUrl = canonicalUrl;
            visited.add(targetUrl);
          }
        } catch {}
      }

      await prisma.staged_items.upsert({
        where: { unique_site_url: { site_id: siteId, url: targetUrl } },
        update: {
          title: (meta.title || 'Untitled').substring(0, 255),
          item_type: meta.type || 'page',
          raw_html: html,
          structural_hash: structuralHash,
          metadata: meta,
          status: 'completed'
        },
        create: {
          site_id: siteId,
          url: targetUrl,
          title: (meta.title || 'Untitled').substring(0, 255),
          item_type: meta.type || 'page',
          raw_html: html,
          structural_hash: structuralHash,
          metadata: meta,
          status: 'completed'
        }
      });

      pageCount++;
      await prisma.imported_sites.update({ where: { id: siteId }, data: { page_count: pageCount } });

      discoverLinks($, normalizedUrl, rootDomain, visited, queue, config);

      if (meta.canonical) {
        const canonicalUrl = normalizeUrl(new URL(meta.canonical, normalizedUrl).toString());
        if (canonicalUrl && canonicalUrl !== normalizedUrl && !visited.has(canonicalUrl) && !queue.includes(canonicalUrl)) {
          queue.unshift(canonicalUrl);
        }
      }

      await new Promise(resolve => setTimeout(resolve, 200)); // Reduced delay for faster crawling
    } catch (err) {
      logError(dbName, err, 'CRAWL_PAGE_FAILED', { url: normalizedUrl });
    }
  }

  await prisma.imported_sites.update({ where: { id: siteId }, data: { status: 'completed' } });
  info(dbName, 'CRAWL_COMPLETE', `Traditional crawl completed with ${pageCount} pages found`);
}
