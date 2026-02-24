import prisma from '../../lib/prisma.js';
import { generateTemplateFromHtml } from '../aiService.js';
import { info, error as logError } from '../../lib/logger.js';
import path from 'path';
import fs from 'fs/promises';

/**
 * TemplateGenerator creates WebWolf-compatible .njk templates
 * based on the LLM analysis of the imported site.
 */
export class TemplateGenerator {
  constructor(siteId, dbName) {
    this.siteId = siteId;
    this.dbName = dbName;
  }

  async run() {
    try {
      info(this.dbName, 'IMPORT_V2_TEMPLATE_GEN_START', `Generating templates for site ${this.siteId}`);

      const site = await prisma.imported_sites.findUnique({
        where: { id: this.siteId }
      });

      if (!site || !site.llm_ruleset) throw new Error('Ruleset not found');
      const ruleset = site.llm_ruleset;

      for (const [hash, group] of Object.entries(ruleset.types || {})) {
        info(this.dbName, 'IMPORT_V2_TEMPLATE_GEN_TYPE', `Generating template for ${group.page_type} (${hash})`);

        // Get the sample item's HTML
        const sample = await prisma.staged_items.findFirst({
          where: { site_id: this.siteId, structural_hash: hash }
        });

        if (!sample || !sample.raw_html) continue;

        // Generate Nunjucks template using AI
        const njkCode = await generateTemplateFromHtml(
          sample.raw_html,
          group.selector_map,
          group.page_type
        );

        const filename = `imported/${this.siteId}/${group.page_type}-${hash.substring(0, 8)}.njk`;
        const fullPath = path.join(process.cwd(), 'templates', filename);

        // Ensure directory exists
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, njkCode);

        // Register template in DB
        const template = await prisma.templates.create({
          data: {
            name: `Imported ${group.page_type} (${hash.substring(0, 8)})`,
            filename: filename,
            content_type: group.page_type === 'product' ? 'products' : 'pages',
            description: group.summary,
            blueprint: group.selector_map // Use the selector map as initial blueprint
          }
        });

        // Store template ID back in ruleset
        ruleset.types[hash].template_id = template.id;
      }

      await prisma.imported_sites.update({
        where: { id: this.siteId },
        data: { llm_ruleset: ruleset }
      });

      info(this.dbName, 'IMPORT_V2_TEMPLATE_GEN_COMPLETE', `Templates generated and saved`);

    } catch (err) {
      logError(this.dbName, err, 'IMPORT_V2_TEMPLATE_GEN_FAILED');
      throw err;
    }
  }
}
