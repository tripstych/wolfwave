import prisma from '../../lib/prisma.js';
import { structuredScrape } from '../aiService.js';
import { info, error as logError } from '../../lib/logger.js';
import { ImporterServiceV2 } from './ImporterServiceV2.js';
import { downloadMedia, processHtmlMedia } from '../mediaService.js';

/**
 * TransformationEngine applies the generated ruleset to staged items
 * to create actual CMS content and templates.
 */
export class TransformationEngine {
  constructor(siteId, dbName) {
    this.siteId = siteId;
    this.dbName = dbName;
  }

  async run() {
    try {
      info(this.dbName, 'IMPORT_V2_TRANSFORM_START', `Starting transformation for site ${this.siteId}`);

      const site = await prisma.imported_sites.findUnique({
        where: { id: this.siteId }
      });

      if (!site || !site.llm_ruleset) throw new Error('Ruleset not found');
      const ruleset = site.llm_ruleset;
      const rootOrigin = new URL(site.root_url).origin;

      // 1. Process each crawled page
      const items = await prisma.staged_items.findMany({
        where: { site_id: this.siteId, status: 'crawled' }
      });

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const groupRules = ruleset.types?.[item.structural_hash];
        if (!groupRules) continue;

        if (i % 5 === 0) {
          await ImporterServiceV2.updateStatus(this.siteId, 'transforming', `Migrating items to CMS ${i + 1}/${items.length}...`);
        }

        info(this.dbName, 'IMPORT_V2_TRANSFORM_ITEM', `Transforming ${item.url} using ${groupRules.page_type} rules`);

        // Use AI to extract content based on the ruleset's selector map
        // We pass the fields defined in the selector_map to structuredScrape
        const fields = Object.keys(groupRules.selector_map).map(name => ({
          name,
          type: (name === 'description' || name === 'content' || name === 'body') ? 'richtext' : 
                (name === 'image' || name === 'images' || name === 'gallery') ? 'image' : 'text'
        }));

        const extractedContent = await structuredScrape(fields, item.stripped_html);

        // --- Sideload Media & Remap Links ---
        for (const [key, value] of Object.entries(extractedContent)) {
          if (!value) continue;

          // 1. Handle Richtext (Images and internal Links)
          if (typeof value === 'string' && (value.includes('<img') || value.includes('<a'))) {
            let processed = await processHtmlMedia(value);
            // Remap internal absolute links to relative slugs
            // e.g. https://old-site.com/about -> /about
            processed = processed.replace(new RegExp(rootOrigin, 'g'), '');
            extractedContent[key] = processed;
          }

          // 2. Handle specific image fields
          else if (key === 'image' || key === 'thumbnail' || key === 'featured_image') {
            if (typeof value === 'string' && value.startsWith('http')) {
              extractedContent[key] = await downloadMedia(value, extractedContent.title || item.title);
            }
          }

          // 3. Handle galleries/arrays
          else if (Array.isArray(value)) {
            extractedContent[key] = await Promise.all(value.map(async (v) => {
              if (typeof v === 'string' && v.startsWith('http')) {
                return await downloadMedia(v, extractedContent.title || item.title);
              }
              return v;
            }));
          }
        }

        // Save to CMS content table
        const content = await prisma.content.create({
          data: {
            module: groupRules.page_type === 'product' ? 'products' : 'pages',
            title: extractedContent.title || item.title,
            slug: this.generateSlug(item.url),
            data: extractedContent,
            source_url: item.url
          }
        });

        // Link staged item to content
        await prisma.staged_items.update({
          where: { id: item.id },
          data: { status: 'transformed', metadata: { ...item.metadata, content_id: content.id } }
        });
      }

      await prisma.imported_sites.update({
        where: { id: this.siteId },
        data: { status: 'completed' }
      });

      info(this.dbName, 'IMPORT_V2_TRANSFORM_COMPLETE', `Transformation finished for ${items.length} items`);

    } catch (err) {
      logError(this.dbName, err, 'IMPORT_V2_TRANSFORM_FAILED');
      throw err;
    }
  }

  generateSlug(url) {
    try {
      const path = new URL(url).pathname;
      if (path === '/') return 'home';
      return path.replace(/^\/+|\/+$/g, '').replace(/\//g, '-');
    } catch {
      return 'item-' + Date.now();
    }
  }
}
