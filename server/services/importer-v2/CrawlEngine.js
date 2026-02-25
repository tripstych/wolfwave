import axios from 'axios';
import * as cheerio from 'cheerio';
import crypto from 'crypto';
import prisma from '../../lib/prisma.js';
import { info, error as logError } from '../../lib/logger.js';
import { ImporterServiceV2 } from './ImporterServiceV2.js';
import { jobRegistry } from './JobRegistry.js';

export class CrawlEngine {
  constructor(siteId, rootUrl, dbName, config = {}) {
    this.siteId = siteId;
    this.rootUrl = rootUrl;
    this.dbName = dbName;
    this.config = config;
    this.visited = new Set();
    this.queue = [];
    this.maxPages = config.maxPages || 500;
    this.pageCount = 0;
  }

  normalizeUrl(url) {
    try {
      const nUrl = new URL(url, this.rootUrl);
      nUrl.hash = '';
      
      // Force lowercase hostname for consistency
      nUrl.hostname = nUrl.hostname.toLowerCase();
      
      // 1. Platform Specific Normalization (Shopify)
      // Collapse /collections/.*/products/x -> /products/x
      const collectionProductMatch = nUrl.pathname.match(/\/collections\/[^/]+\/products\/(.+)/);
      if (collectionProductMatch) {
        nUrl.pathname = '/products/' + collectionProductMatch[1];
      }

      // 2. Junk Path Filtering
      const junkPaths = ['/cart', '/search', '/account', '/login', '/logout', '/checkout', '/tools/'];
      if (junkPaths.some(p => nUrl.pathname.startsWith(p))) return null;

      // 3. Strip common noisy parameters
      const stripParams = [
        'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 
        'fbclid', 'gclid', 'ref', 'variant', 'view', '_ss', '_v', '_pos', 'pr_prod_strat', 'pr_rec_id'
      ];
      stripParams.forEach(p => nUrl.searchParams.delete(p));
      
      let cleaned = nUrl.toString();
      
      // Ensure consistent trailing slash: strip if it's not the root path
      if (cleaned.endsWith('/') && nUrl.pathname !== '/') cleaned = cleaned.slice(0, -1);
      
      return cleaned;
    } catch { return null; }
  }

  stripHtml(html) {
    const $ = cheerio.load(html);
    $('head').empty();
    $('script, style, noscript, iframe').remove();
    return $.html();
  }

  /**
   * Level 3: Ultra-clean for LLM Rule Generation
   * Strips everything except the core structure and text content.
   */
  generateLlmHtml(html) {
    const $ = cheerio.load(html);
    
    // 1. Remove non-visible/non-structural metadata
    $('head, script, style, noscript, iframe, svg, path, symbol, canvas, link, meta, comment').remove();
    
    // 2. Remove purely decorative or non-content elements
    $('header, footer, nav, aside, .sidebar, .menu, .nav, .footer, .header, #header, #footer, #nav').remove();

    // 3. Clean attributes (Keep only ID and Class for selector mapping)
    $('*').each((i, el) => {
      const attribs = el.attribs || {};
      for (const key in attribs) {
        if (!['class', 'id', 'src', 'href', 'alt'].includes(key)) {
          $(el).removeAttr(key);
        }
      }
    });

    // 4. Collapse whitespace for token efficiency
    return ($('body').html() || '').replace(/\s+/g, ' ').trim();
  }

  calculateHash(strippedHtml) {
    const $ = cheerio.load(strippedHtml);
    
    // Content tags that should be ignored for structural hashing
    const contentTags = new Set([
      'a', 'span', 'i', 'strong', 'em', 'b', 'u', 'br', 'svg', 'path', 
      'small', 'label', 'button', 'img', 'p', 'h1', 'h2', 'h3', 'h4', 
      'h5', 'h6', 'input', 'select', 'textarea', 'video', 'audio', 
      'canvas', 'iframe', 'hr', 'picture', 'source', 'noscript'
    ]);
    
    const tags = [];

    function traverse(node, depth = 0) {
      if (depth > 20 || node.type !== 'tag' || contentTags.has(node.name)) return;
      
      tags.push(node.name);
      
      let lastTagName = '';
      $(node).children().each((i, el) => {
        // Deduplication: If we just saw this structural tag type as a sibling, skip it.
        // This ensures lists of products/posts don't change the hash.
        if (el.type === 'tag' && !contentTags.has(el.name)) {
          if (el.name !== lastTagName) {
            traverse(el, depth + 1);
            lastTagName = el.name;
          }
        }
      });
      
      tags.push(`/${node.name}`);
    }

    const body = $('body')[0];
    if (body) traverse(body);
    return crypto.createHash('sha256').update(tags.join('>')).digest('hex');
  }

  async run() {
    this.queue.push(this.normalizeUrl(this.rootUrl));
    const rootHostname = new URL(this.rootUrl).hostname;

    info(this.dbName, 'IMPORT_V2_CRAWL_START', `Crawling up to ${this.maxPages} pages`);

    while (this.queue.length > 0 && this.pageCount < this.maxPages) {
      if (jobRegistry.isCancelled(this.siteId)) {
        info(this.dbName, 'IMPORT_V2_CRAWL_CANCELLED', `Crawler stopped for site ${this.siteId} due to cancellation.`);
        return;
      }

      const url = this.queue.shift();
      if (!url || this.visited.has(url)) continue;
      this.visited.add(url);

      try {
        info(this.dbName, 'IMPORT_V2_CRAWL_PAGE', `Fetching: ${url}`);
        const { data: html } = await axios.get(url, {
          headers: { 'User-Agent': 'WebWolf-Importer-V2/1.0' },
          timeout: 10000,
          validateStatus: s => s < 400
        });

        const strippedHtml = this.stripHtml(html);
        const llmHtml = this.generateLlmHtml(html);
        const structuralHash = this.calculateHash(strippedHtml);
        const $ = cheerio.load(html);
        const title = $('title').text() || url;

        await prisma.staged_items.upsert({
          where: { unique_site_url: { site_id: this.siteId, url } },
          update: {
            title: title.substring(0, 255),
            raw_html: html,
            stripped_html: strippedHtml,
            llm_html: llmHtml,
            structural_hash: structuralHash,
            status: 'crawled'
          },
          create: {
            site_id: this.siteId,
            url,
            title: title.substring(0, 255),
            raw_html: html,
            stripped_html: strippedHtml,
            llm_html: llmHtml,
            structural_hash: structuralHash,
            status: 'crawled'
          }
        });

        this.pageCount++;
        
        if (this.pageCount % 10 === 0) {
          await ImporterServiceV2.updateStatus(this.siteId, 'crawling', `Crawled ${this.pageCount} pages...`);
        }

        // Discover links
        $('a[href]').each((i, el) => {
          const href = $(el).attr('href');
          if (!href) return;
          try {
            const abs = new URL(href, url);
            if (abs.hostname === rootHostname && !abs.pathname.match(/\.(jpg|jpeg|png|gif|pdf|zip|css|js)$/i)) {
              const norm = this.normalizeUrl(abs.toString());
              if (norm && !this.visited.has(norm) && !this.queue.includes(norm)) {
                this.queue.push(norm);
              }
            }
          } catch {}
        });

        await prisma.imported_sites.update({
          where: { id: this.siteId },
          data: { page_count: this.pageCount }
        });

        // Delay to be polite
        await new Promise(r => setTimeout(r, 100));
      } catch (err) {
        logError(this.dbName, err, 'IMPORT_V2_CRAWL_PAGE_FAILED', { url });
      }
    }

    await prisma.imported_sites.update({
      where: { id: this.siteId },
      data: { status: 'crawled' }
    });
    
    info(this.dbName, 'IMPORT_V2_CRAWL_COMPLETE', `Finished with ${this.pageCount} pages`);
  }
}
