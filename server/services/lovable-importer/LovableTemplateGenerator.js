import { TemplateGenerator } from '../assisted-import/TemplateGenerator.js';
import prisma from '../../lib/prisma.js';
import { info, error as logError } from '../../lib/logger.js';
import { downloadAsset } from '../mediaService.js';
import { generateTemplateFromHtml, comparePageStructures } from '../aiService.js';
import { AssistedImportService } from '../assisted-import/AssistedImportService.js';
import path from 'path';
import fs from 'fs/promises';

/**
 * Lovable-specific template generator.
 * Handles style sideloading to ensure WYSIWYG support.
 */
export class LovableTemplateGenerator extends TemplateGenerator {
  async run() {
    try {
      info(this.dbName, 'LOVABLE_TEMPLATE_GEN_START', `Generating WYSIWYG templates for site ${this.siteId}`);

      const site = await prisma.imported_sites.findUnique({
        where: { id: this.siteId }
      });

      if (!site || !site.llm_ruleset) throw new Error('Ruleset not found');
      const ruleset = site.llm_ruleset;
      const generatedTemplates = [];

      // Sideload Lovable Styles
      let localStyleLinks = [];
      if (ruleset.lovable_styles?.links) {
        info(this.dbName, 'LOVABLE_TEMPLATE_SIDELOAD', `Sideloading ${ruleset.lovable_styles.links.length} stylesheets...`);
        localStyleLinks = await Promise.all(
          ruleset.lovable_styles.links.map(link => downloadAsset(link))
        );
      }

      const hashes = Object.keys(ruleset.types || {});
      for (let i = 0; i < hashes.length; i++) {
        const hash = hashes[i];
        const group = ruleset.types[hash];
        
        const sample = await prisma.staged_items.findFirst({
          where: { site_id: this.siteId, structural_hash: hash }
        });

        if (!sample || !sample.stripped_html) continue;

        info(this.dbName, 'LOVABLE_TEMPLATE_GEN_TYPE', `Processing ${group.page_type} (${hash})`);
        
        // Deduplication (using base class logic)
        let existingTemplateId = null;
        const candidates = generatedTemplates.filter(t => t.page_type === group.page_type);
        for (const candidate of candidates) {
          const comparison = await comparePageStructures(sample.llm_html, candidate.llm_html);
          if (comparison.can_share) {
            existingTemplateId = candidate.template_id;
            break;
          }
        }

        if (existingTemplateId) {
          ruleset.types[hash].template_id = existingTemplateId;
          continue;
        }

        // Generate Nunjucks with Styles
        const assets = {
          lovable_styles: {
            links: localStyleLinks,
            inline: ruleset.lovable_styles?.inline || []
          }
        };

        const njkCode = await generateTemplateFromHtml(
          sample.stripped_html,
          group.selector_map,
          group.page_type,
          assets
        );

        let contentType = 'pages';
        if (group.page_type === 'product') contentType = 'products';

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

        const template = await prisma.templates.upsert({
          where: { filename: filename },
          update: {
            name: `Lovable ${group.page_type} (${hash.substring(0,4)})`,
            content_type: contentType,
            content: njkCode,
            description: group.summary,
            blueprint: group.selector_map,
            regions: JSON.stringify(cmsRegions),
            updated_at: new Date()
          },
          create: {
            name: `Lovable ${group.page_type} (${hash.substring(0,4)})`,
            filename: filename,
            content: njkCode,
            content_type: contentType,
            description: group.summary,
            blueprint: group.selector_map,
            regions: JSON.stringify(cmsRegions)
          }
        });

        ruleset.types[hash].template_id = template.id;
        generatedTemplates.push({ template_id: template.id, page_type: group.page_type, llm_html: sample.llm_html });
      }

      await prisma.imported_sites.update({ where: { id: this.siteId }, data: { llm_ruleset: ruleset } });

      info(this.dbName, 'LOVABLE_TEMPLATE_GEN_COMPLETE', `WYSIWYG templates generated`);

    } catch (err) {
      logError(this.dbName, err, 'LOVABLE_TEMPLATE_GEN_FAILED');
      throw err;
    }
  }
}
