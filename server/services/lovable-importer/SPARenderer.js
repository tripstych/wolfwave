import puppeteer from 'puppeteer';
import prisma from '../../lib/prisma.js';
import { info, error as logError } from '../../lib/logger.js';
import { LovableImporterService } from './LovableImporterService.js';
import { jobRegistry } from '../assisted-import/JobRegistry.js';

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
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
    });
    this.page = await this.browser.newPage();
    await this.page.setViewport({ width: 1280, height: 800 });
    await this.page.setUserAgent('WebWolf-LovableImporter/1.0');
  }

  async renderPage(url, useInteraction = false) {
    const currentUrl = this.page.url();
    
    if (useInteraction && this.normalizeUrl(currentUrl) !== this.normalizeUrl(url)) {
      info(this.dbName, 'LOVABLE_RENDER_INTERACT', `Attempting internal navigation to ${url}`);
      
      // Try to find the link and click it instead of a full reload
      const clicked = await this.page.evaluate((targetUrl) => {
        const links = Array.from(document.querySelectorAll('a[href]'));
        const target = links.find(l => l.href === targetUrl || l.getAttribute('href') === targetUrl);
        if (target) {
          target.click();
          return true;
        }
        return false;
      }, url);

      if (clicked) {
        try {
          await this.page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 5000 }).catch(() => {});
        } catch {}
      } else {
        // Fallback to goto if no link found to click
        await this.page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
      }
    } else if (this.normalizeUrl(currentUrl) !== this.normalizeUrl(url)) {
      await this.page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
    }

    // --- SPA Stability & Hydration ---
    try {
      await this.page.waitForSelector('#root > *', { timeout: 5000 });
    } catch {
      // Fallback: wait for any content if #root is missing
      await new Promise(r => setTimeout(r, 2000));
    }

    // --- Discover Hidden Content (Expand Menus/Tabs) ---
    await this.page.evaluate(() => {
      // Auto-click common "revealer" elements to find more links/content
      const revealers = document.querySelectorAll('button[aria-expanded="false"], .menu-toggle, [data-headlessui-state=""], .tabs-trigger');
      revealers.forEach(el => {
        // Only click if it won't navigate away (heuristically)
        if (!el.closest('a') && el.innerText.length < 20) {
          try { el.click(); } catch(e) {}
        }
      });
    });

    // Scroll to trigger lazy-loaded images/content
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
        }, 50);
      });
    });

    await new Promise(r => setTimeout(r, 1000));

    const html = await this.page.content();
    const title = await this.page.title();

    // Capture Stylesheets and Inline Styles for WYSIWYG
    const styles = await this.page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(l => l.href);
      const inline = Array.from(document.querySelectorAll('style')).map(s => s.innerHTML);
      return { links, inline };
    });

    return { html, title, styles };
  }

  async run() {
    try {
      await this.launch();

      const rootNorm = this.normalizeUrl(this.rootUrl);
      this.queue.push(rootNorm);

      info(this.dbName, 'LOVABLE_CRAWL_START', `Exploring SPA states for up to ${this.maxPages} pages`);

      while (this.queue.length > 0 && this.pageCount < this.maxPages) {
        if (jobRegistry.isCancelled(this.siteId)) {
          info(this.dbName, 'LOVABLE_CRAWL_CANCELLED', 'Rendering cancelled by user');
          return;
        }

        const url = this.queue.shift();
        if (!url || this.visited.has(url)) continue;
        this.visited.add(url);

        try {
          info(this.dbName, 'LOVABLE_RENDER_PAGE', `Processing State: ${url}`);
          
          // For the first page, we use goto. For subsequent, we try to stay in-app.
          const isFirst = this.pageCount === 0;
          const { html, title, styles } = await this.renderPage(url, !isFirst);

          // Store rendered state
          await prisma.staged_items.upsert({
            where: { unique_site_url: { site_id: this.siteId, url } },
            update: {
              title: (title || url).substring(0, 255),
              raw_html: html,
              status: 'rendered',
              metadata: { styles }
            },
            create: {
              site_id: this.siteId,
              url,
              title: (title || url).substring(0, 255),
              raw_html: html,
              status: 'rendered',
              metadata: { styles }
            }
          });

          this.pageCount++;

          // Discover new routes from this visual state
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
              this.siteId, 'rendering', `Captured ${this.pageCount} SPA states...`
            );
          }

          // Brief delay to allow app to settle
          await new Promise(r => setTimeout(r, 500));
        } catch (err) {
          logError(this.dbName, err, 'LOVABLE_RENDER_STATE_FAILED', { url });
          // If interaction failed, maybe reload and try again
          if (!url.includes(this.rootUrl)) continue; 
        }
      }

      info(this.dbName, 'LOVABLE_CRAWL_COMPLETE', `Finished capturing ${this.pageCount} SPA states`);
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
