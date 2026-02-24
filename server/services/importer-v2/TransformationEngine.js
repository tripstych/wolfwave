import prisma from '../../lib/prisma.js';
import { structuredScrape } from '../aiService.js';
import { info, error as logError } from '../../lib/logger.js';

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

      // 1. Process each crawled page
      const items = await prisma.staged_items.findMany({
        where: { site_id: this.siteId, status: 'crawled' }
      });

      for (const item of items) {
        const groupRules = ruleset.types?.[item.structural_hash];
        if (!groupRules) continue;

        info(this.dbName, 'IMPORT_V2_TRANSFORM_ITEM', `Transforming ${item.url} using ${groupRules.page_type} rules`);

        // Use AI to extract content based on the ruleset's selector map
        // We pass the fields defined in the selector_map to structuredScrape
        const fields = Object.keys(groupRules.selector_map).map(name => ({
          name,
          type: name === 'description' || name === 'content' ? 'richtext' : 'text'
        }));

        const extractedContent = await structuredScrape(fields, item.stripped_html);

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
