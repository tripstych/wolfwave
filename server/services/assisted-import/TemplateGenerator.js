import prisma from '../../lib/prisma.js';
import { generateTemplateFromHtml, comparePageStructures } from '../aiService.js';
import { info, error as logError } from '../../lib/logger.js';
import { AssistedImportService } from './AssistedImportService.js';
import path from 'path';
import fs from 'fs/promises';

/**
 * TemplateGenerator creates WebWolf-compatible .njk templates
 * based on the LLM analysis of the imported site.
 * Includes deduplication logic to avoid creating redundant templates.
 */
export class TemplateGenerator {
  constructor(siteId, dbName) {
    this.siteId = siteId;
    this.dbName = dbName;
  }

  async run() {
    try {
      info(this.dbName, 'ASSISTED_IMPORT_TEMPLATE_GEN_START', `Generating templates for site ${this.siteId}`);

      const site = await prisma.imported_sites.findUnique({
        where: { id: this.siteId }
      });

      if (!site || !site.llm_ruleset) throw new Error('Ruleset not found');
      const ruleset = site.llm_ruleset;
      const generatedTemplates = []; // Track { template_id, hash, page_type, llm_html }

      const hashes = Object.keys(ruleset.types || {});
      for (let i = 0; i < hashes.length; i++) {
        const hash = hashes[i];
        const group = ruleset.types[hash];
        
        // Get the sample item's HTML
        const sample = await prisma.staged_items.findFirst({
          where: { site_id: this.siteId, structural_hash: hash }
        });

        if (!sample || !sample.stripped_html) continue;

        info(this.dbName, 'ASSISTED_IMPORT_TEMPLATE_GEN_TYPE', `Processing ${group.page_type} (${hash})`);
        await AssistedImportService.updateStatus(this.siteId, 'generating_templates', `Analyzing structure ${i + 1}/${hashes.length} (${group.page_type})...`);

        // --- Deduplication Check ---
        let existingTemplateId = null;
        const candidates = generatedTemplates.filter(t => t.page_type === group.page_type);
        
        for (const candidate of candidates) {
          const comparison = await comparePageStructures(sample.llm_html, candidate.llm_html);
          if (comparison.can_share) {
            info(this.dbName, 'ASSISTED_IMPORT_TEMPLATE_DEDUPE', `Group ${hash} will share template with ${candidate.hash} (${comparison.reason})`);
            existingTemplateId = candidate.template_id;
            break;
          }
        }

        if (existingTemplateId) {
          ruleset.types[hash].template_id = existingTemplateId;
          ruleset.types[hash].is_duplicate = true;
          continue;
        }

        // --- Generate New Template ---
        await AssistedImportService.updateStatus(this.siteId, 'generating_templates', `Creating unique Nunjucks template for ${group.page_type}...`);

        const njkCode = await generateTemplateFromHtml(
          sample.stripped_html,
          group.selector_map,
          group.page_type,
          ruleset.theme?.local_assets || null
        );

        let contentType = 'pages';
        if (group.page_type === 'product') contentType = 'products';
        if (['article', 'blog_post', 'post'].includes(group.page_type)) contentType = 'posts';

        const filename = `imported/${this.siteId}/${group.page_type}-${hash.substring(0, 8)}.njk`;
        const fullPath = path.join(process.cwd(), 'templates', filename);

        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, njkCode);

        // Convert dynamic regions to standard CMS regions format
        const cmsRegions = (group.regions || []).map(r => ({
          name: r.key,
          label: r.label,
          type: r.type === 'richtext' ? 'richtext' : (r.type === 'image' ? 'image' : 'text'),
          multiple: !!r.multiple
        }));

        // Clean name: "Imported Homepage", "Imported Product", etc.
        const typeCount = generatedTemplates.filter(t => t.page_type === group.page_type).length;
        const displayName = `Imported ${group.page_type.charAt(0).toUpperCase() + group.page_type.slice(1)}${typeCount > 0 ? ` (${typeCount + 1})` : ''}`;

        const template = await prisma.templates.upsert({
          where: { filename: filename },
          update: {
            name: displayName,
            content_type: contentType,
            content: njkCode,
            description: group.summary,
            blueprint: group.selector_map,
            regions: JSON.stringify(cmsRegions),
            updated_at: new Date()
          },
          create: {
            name: displayName,
            filename: filename,
            content: njkCode,
            content_type: contentType,
            description: group.summary,
            blueprint: group.selector_map,
            regions: JSON.stringify(cmsRegions)
          }
        });

        ruleset.types[hash].template_id = template.id;
        
        // Store for future deduplication checks
        generatedTemplates.push({
          template_id: template.id,
          hash: hash,
          page_type: group.page_type,
          llm_html: sample.llm_html
        });
      }

      await prisma.imported_sites.update({
        where: { id: this.siteId },
        data: { llm_ruleset: ruleset }
      });

      // Update all staged items in each group with their template_id for the transformation engine
      for (const [hash, group] of Object.entries(ruleset.types || {})) {
        if (group.template_id) {
          await prisma.staged_items.updateMany({
            where: { site_id: this.siteId, structural_hash: hash },
            data: { metadata: { ...group, last_updated: new Date() } } // Store template info in metadata
          });
        }
      }

      info(this.dbName, 'ASSISTED_IMPORT_TEMPLATE_GEN_COMPLETE', `Templates generated and deduplicated`);

    } catch (err) {
      logError(this.dbName, err, 'ASSISTED_IMPORT_TEMPLATE_GEN_FAILED');
      throw err;
    }
  }
}
