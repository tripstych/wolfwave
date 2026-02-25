import puppeteer from 'puppeteer';
import prisma from '../../lib/prisma.js';
import { info, error as logError } from '../../lib/logger.js';
import { LovableImporterService } from './LovableImporterService.js';
import { jobRegistry } from '../importer-v2/JobRegistry.js';

/**
 * SPARenderer uses Puppeteer to render Lovable's React/Vite SPAs,
 * capturing the fully-rendered DOM that axios would miss.
 */
export class SPARenderer {
  constructor(siteId, rootUrl, dbName, config = {}) {
    this.siteId = siteId;
    this.rootUrl = rootUrl;
    this.dbName = dbName;
    this.config = config;
    this.visited = new Set();
    this.queue = [];
    this.maxPages = config.maxPages || 50;
    this.pageCount = 0;
    this.browser = null;
    this.page = null;
  }

  normalizeUrl(url) {
    try {
      const nUrl = new URL(url, this.rootUrl);
      nUrl.hash = '';
      nUrl.hostname = nUrl.hostname.toLowerCase();

      // Strip noisy parameters
      const stripParams = [
        'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
        'fbclid', 'gclid', 'ref'
      ];
      stripParams.forEach(p => nUrl.searchParams.delete(p));

      let cleaned = nUrl.toString();
      if (cleaned.endsWith('/') && nUrl.pathname !== '/') cleaned = cleaned.slice(0, -1);
      return cleaned;
    } catch { return null; }
  }

  async launch() {
    info(this.dbName, 'LOVABLE_RENDERER_LAUNCH', 'Launching headless browser...');
    this.browser = await puppeteer.launch({
      headless: true,
      args: ['--disable-gpu', '--disable-dev-shm-usage']
    });
    this.page = await this.browser.newPage();
    await this.page.setViewport({ width: 1280, height: 800 });
    await this.page.setUserAgent('WebWolf-LovableImporter/1.0');
  }

  async renderPage(url) {
    await this.page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });

    // Wait for React to hydrate (root div gets children)
    try {
      await this.page.waitForSelector('#root > *', { timeout: 10000 });
    } catch {
      // Some Lovable sites may not use #root — try body content
      info(this.dbName, 'LOVABLE_RENDERER_NO_ROOT', `No #root found for ${url}, using body content`);
    }

    // Scroll to trigger lazy-loaded images
    await this.page.evaluate(async () => {
      await new Promise(resolve => {
        let totalHeight = 0;
        const distance = 400;
        const timer = setInterval(() => {
          window.scrollBy(0, distance);
          totalHeight += distance;
          if (totalHeight >= document.body.scrollHeight) {
            clearInterval(timer);
            window.scrollTo(0, 0);
            resolve();
          }
        }, 80);
      });
    });

    // Brief wait for any images triggered by scrolling
    await new Promise(r => setTimeout(r, 500));

    const html = await this.page.content();
    const title = await this.page.title();

    return { html, title };
  }

  async discoverRoutes() {
    const rootHostname = new URL(this.rootUrl).hostname;

    const links = await this.page.evaluate((hostname) => {
      return Array.from(document.querySelectorAll('a[href]'))
        .map(a => a.href)
        .filter(href => {
          try {
            const url = new URL(href);
            return url.hostname === hostname &&
              !url.pathname.match(/\.(jpg|jpeg|png|gif|svg|pdf|zip|css|js)$/i) &&
              !url.hash;
          } catch { return false; }
        });
    }, rootHostname);

    return [...new Set(links)];
  }

  async run() {
    try {
      await this.launch();

      const rootNorm = this.normalizeUrl(this.rootUrl);
      this.queue.push(rootNorm);

      info(this.dbName, 'LOVABLE_CRAWL_START', `Rendering up to ${this.maxPages} pages`);

      while (this.queue.length > 0 && this.pageCount < this.maxPages) {
        if (jobRegistry.isCancelled(this.siteId)) {
          info(this.dbName, 'LOVABLE_CRAWL_CANCELLED', 'Rendering cancelled by user');
          return;
        }

        const url = this.queue.shift();
        if (!url || this.visited.has(url)) continue;
        this.visited.add(url);

        try {
          info(this.dbName, 'LOVABLE_RENDER_PAGE', `Rendering: ${url}`);
          const { html, title } = await this.renderPage(url);

          // Store raw rendered HTML (sanitization happens in Phase 2)
          await prisma.staged_items.upsert({
            where: { unique_site_url: { site_id: this.siteId, url } },
            update: {
              title: (title || url).substring(0, 255),
              raw_html: html,
              status: 'rendered'
            },
            create: {
              site_id: this.siteId,
              url,
              title: (title || url).substring(0, 255),
              raw_html: html,
              status: 'rendered'
            }
          });

          this.pageCount++;

          // Discover new routes from rendered page
          const discovered = await this.discoverRoutes();
          for (const link of discovered) {
            const norm = this.normalizeUrl(link);
            if (norm && !this.visited.has(norm) && !this.queue.includes(norm)) {
              this.queue.push(norm);
            }
          }

          await prisma.imported_sites.update({
            where: { id: this.siteId },
            data: { page_count: this.pageCount }
          });

          if (this.pageCount % 5 === 0) {
            await LovableImporterService.updateStatus(
              this.siteId, 'rendering', `Rendered ${this.pageCount} pages...`
            );
          }

          // Brief delay between pages
          await new Promise(r => setTimeout(r, 200));
        } catch (err) {
          logError(this.dbName, err, 'LOVABLE_RENDER_PAGE_FAILED', { url });
        }
      }

      info(this.dbName, 'LOVABLE_CRAWL_COMPLETE', `Finished rendering ${this.pageCount} pages`);
    } finally {
      await this.cleanup();
    }
  }

  async cleanup() {
    try {
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
        this.page = null;
      }
    } catch (err) {
      logError(this.dbName, err, 'LOVABLE_BROWSER_CLEANUP_FAILED');
    }
  }
}
