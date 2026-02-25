import * as cheerio from 'cheerio';
import crypto from 'crypto';
import prisma from '../../lib/prisma.js';
import { info, error as logError } from '../../lib/logger.js';
import { LovableImporterService } from './LovableImporterService.js';
import { jobRegistry } from '../assisted-import/JobRegistry.js';

/**
 * HTMLSanitizer strips Tailwind utility classes, React/Radix artifacts,
 * and meaningless wrapper divs to produce clean semantic HTML.
 */
export class HTMLSanitizer {
  constructor(siteId, dbName) {
    this.siteId = siteId;
    this.dbName = dbName;
  }

  /**
   * Attributes to keep on elements (everything else is stripped)
   */
  static KEEP_ATTRS = new Set(['id', 'href', 'src', 'alt', 'for', 'name', 'type', 'action', 'method', 'role']);

  /**
   * Main sanitization: Removes React/Vite artifacts but PRESERVES classes for WYSIWYG.
   */
  sanitize(html) {
    const $ = cheerio.load(html);

    // 1. Remove non-content elements (but we will sideload the styles later)
    $('script, noscript, link[rel="preload"], link[rel="modulepreload"], meta, canvas').remove();

    // 2. Remove React error overlays / dev tools
    $('#webpack-dev-server-client-overlay, [data-nextjs-scroll-focus-boundary], #lovable-badge').remove();

    // 3. Clean attributes
    $('*').each((i, el) => {
      const attribs = el.attribs || {};
      for (const key in attribs) {
        // Keep: 1. Whitelisted keys, 2. 'class', 3. 'data-*', 4. 'aria-*'
        const shouldKeep = 
          HTMLSanitizer.KEEP_ATTRS.has(key) || 
          key === 'class' || 
          key.startsWith('data-') || 
          key.startsWith('aria-');

        if (!shouldKeep) {
          $(el).removeAttr(key);
        }
      }
    });

    // 4. Unwrap the #root wrapper
    const rootContent = $('#root').html();
    if (rootContent) {
      $('body').html(rootContent);
    }

    // 5. Clean up <head> — keep title
    const title = $('title').text();
    $('head').html(`<meta charset="UTF-8"><title>${title}</title>`);

    return $.html();
  }

  /**
   * Level 3: Context-Rich HTML for LLM Rule Generation
   * Keeps structure and semantic clues, removes only technical bloat.
   */
  generateLlmHtml(sanitizedHtml) {
    const $ = cheerio.load(sanitizedHtml);

    // 1. Remove high-token technical bloat
    $('head, script, style, noscript, iframe, canvas, link, meta, comment').remove();

    // 2. Simplify SVGs to placeholders
    $('svg').each((i, el) => {
      $(el).replaceWith('<svg-icon-placeholder />');
    });

    // 3. Keep all semantic attributes (role, aria, data-*) but remove style
    $('*').removeAttr('style');

    // 4. Collapse whitespace
    return ($('body').html() || '').replace(/\s+/g, ' ').trim();
  }

  /**
   * Structural hash for grouping similar page layouts.
   * Mirrors CrawlEngine.calculateHash().
   */
  calculateHash(sanitizedHtml) {
    const $ = cheerio.load(sanitizedHtml);

    const contentTags = new Set([
      'a', 'span', 'i', 'strong', 'em', 'b', 'u', 'br', 'svg', 'path',
      'small', 'label', 'button', 'img', 'p', 'h1', 'h2', 'h3', 'h4',
      'h5', 'h6', 'input', 'select', 'textarea', 'video', 'audio',
      'canvas', 'iframe', 'hr', 'picture', 'source', 'noscript'
    ]);

    const tags = [];

    function traverse(node, depth = 0) {
      if (depth > 20 || node.type !== 'tag' || contentTags.has(node.name)) return;

      let tagSignature = node.name;
      if (node.attribs?.class) {
        const classes = node.attribs.class.split(/\s+/).filter(Boolean).sort().join('.');
        if (classes) tagSignature += `.${classes}`;
      }

      tags.push(tagSignature);

      let lastTagName = '';
      $(node).children().each((i, el) => {
        if (el.type === 'tag' && !contentTags.has(el.name)) {
          const childSignature = el.name + (el.attribs?.class ? '.' + el.attribs.class.split(/\s+/).filter(Boolean).sort().join('.') : '');
          if (childSignature !== lastTagName) {
            traverse(el, depth + 1);
            lastTagName = childSignature;
          }
        }
      });

      tags.push(`/${tagSignature}`);
    }

    const body = $('body')[0];
    if (body) traverse(body);
    return crypto.createHash('sha256').update(tags.join('>')).digest('hex');
  }

  async run() {
    try {
      info(this.dbName, 'LOVABLE_SANITIZE_START', `Sanitizing rendered pages for site ${this.siteId}`);

      const items = await prisma.staged_items.findMany({
        where: { site_id: this.siteId, status: 'rendered' },
        select: { id: true, url: true, raw_html: true }
      });

      for (let i = 0; i < items.length; i++) {
        if (jobRegistry.isCancelled(this.siteId)) return;

        const item = items[i];
        if (!item.raw_html) continue;

        const strippedHtml = this.sanitize(item.raw_html);
        const llmHtml = this.generateLlmHtml(strippedHtml);
        const structuralHash = this.calculateHash(strippedHtml);

        await prisma.staged_items.update({
          where: { id: item.id },
          data: {
            stripped_html: strippedHtml,
            llm_html: llmHtml,
            structural_hash: structuralHash,
            status: 'crawled',
            metadata: item.metadata // Preserve styles captured in Phase 1
          }
        });

        if ((i + 1) % 5 === 0) {
          await LovableImporterService.updateStatus(
            this.siteId, 'sanitizing', `Cleaned ${i + 1}/${items.length} pages...`
          );
        }
      }

      info(this.dbName, 'LOVABLE_SANITIZE_COMPLETE', `Sanitized ${items.length} pages`);
    } catch (err) {
      logError(this.dbName, err, 'LOVABLE_SANITIZE_FAILED');
      throw err;
    }
  }
}
