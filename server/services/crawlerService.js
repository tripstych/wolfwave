import axios from 'axios';
import * as cheerio from 'cheerio';
import crypto from 'crypto';
import prisma from '../lib/prisma.js';
import { runWithTenant, getCurrentDbName } from '../lib/tenantContext.js';
import { info, error as logError } from '../lib/logger.js';
import { extractMetadata } from './scraperService.js';

function normalizeUrl(url) {
  try {
    const nUrl = new URL(url);
    nUrl.hash = '';
    let cleaned = nUrl.toString();
    if (cleaned.endsWith('/') && nUrl.pathname !== '/') cleaned = cleaned.slice(0, -1);
    return cleaned;
  } catch { return null; }
}

function discoverLinks($, currentUrl, rootDomain, visited, queue, config = {}) {
  const priorityPatterns = config.priorityPatterns || ['/products/'];
  const excludePatterns = config.excludePatterns || ['/tagged/', '/search', 'sort_by='];
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
        if (excludePatterns.some(p => path.includes(p) || search.includes(p))) return;

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
    const IGNORED = new Set(['a', 'span', 'img', 'i', 'strong', 'em', 'b', 'u', 'br', 'svg', 'path', 'script', 'style', 'noscript']);
    function traverse(node, depth = 0) {
      if (depth > 6 || node.type !== 'tag' || IGNORED.has(node.name)) return;
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
          canonical: productUrl
        };

        await prisma.imported_pages.create({
          data: {
            site_id: siteId,
            url: productUrl,
            title: p.title.substring(0, 255),
            raw_html: p.body_html,
            structural_hash: 'feed-item',
            metadata: meta,
            status: 'completed'
          }
        });
        count++;
      }

      await prisma.imported_sites.update({
        where: { id: siteId },
        data: { page_count: count, status: 'completed' }
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
      const config = siteRecord?.config ? (typeof siteRecord.config === 'string' ? JSON.parse(siteRecord.config) : siteRecord.config) : {};
      
      // Use configured feed URL if available
      if (config.feedUrl) {
        const success = await syncFromFeed(siteId, config.feedUrl, dbName);
        if (success) return;
      }

      // Fall back to traditional crawling with improved limits
      info(dbName, 'CRAWL_START', `Starting traditional crawl with max pages: ${config.maxPages || 1000}`);
      await traditionalCrawl(siteId, rootUrl, config, dbName);
    } catch (err) {
      logError(dbName, err, 'CRAWL_SITE_CRITICAL');
      await prisma.imported_sites.update({ where: { id: siteId }, data: { status: 'failed' } }).catch(() => {});
    }
  });
}

/**
 * Traditional crawling fallback
 */
async function traditionalCrawl(siteId, rootUrl, config, dbName) {
  const visited = new Set();
  const queue = [normalizeUrl(rootUrl)];
  let pageCount = 0;
  const maxPages = config.maxPages || 1000; // Increased default limit
  const rootDomain = new URL(rootUrl).hostname;

  await prisma.imported_sites.update({ where: { id: siteId }, data: { status: 'crawling' } });

  info(dbName, 'CRAWL_CONFIG', `Max pages: ${maxPages}, Domain: ${rootDomain}`);

  while (queue.length > 0 && pageCount < maxPages) {
    const url = queue.shift();
    const normalizedUrl = normalizeUrl(url);
    if (!normalizedUrl || visited.has(normalizedUrl)) continue;

    const currentSite = await prisma.imported_sites.findUnique({ where: { id: siteId }, select: { status: true } });
    if (currentSite?.status === 'cancelled') return;

    visited.add(normalizedUrl);

    try {
      info(dbName, 'CRAWL_PAGE', `Fetching ${normalizedUrl} (${pageCount + 1}/${maxPages})`);
      const { data: html } = await axios.get(normalizedUrl, { headers: { 'User-Agent': 'WebWolf-Crawler/1.0' }, timeout: 10000, validateStatus: (status) => status < 400 });

      const $ = cheerio.load(html);
      const structuralHash = calculateStructuralHash(html);
      const meta = extractMetadata($, config.rules || []);

      await prisma.imported_pages.create({
        data: { site_id: siteId, url: normalizedUrl, title: (meta.title || 'Untitled').substring(0, 255), raw_html: html, structural_hash: structuralHash, metadata: meta, status: 'completed' }
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
