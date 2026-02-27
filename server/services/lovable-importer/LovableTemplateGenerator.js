import prisma from '../../lib/prisma.js';
import { info, error as logError } from '../../lib/logger.js';
import { convertReactToNunjucks } from '../aiService.js';
import path from 'path';
import fs from 'fs/promises';

/**
 * LovableTemplateGenerator converts React source code into Nunjucks templates.
 */
export class LovableTemplateGenerator {
  constructor(siteId, dbName) {
    this.siteId = siteId;
    this.dbName = dbName;
  }

  async run() {
    try {
      info(this.dbName, 'LOVABLE_TEMPLATE_GEN_START', `Converting components to Nunjucks for site ${this.siteId}`);

      const site = await prisma.imported_sites.findUnique({ where: { id: this.siteId } });
      const ruleset = site.llm_ruleset;
      if (!ruleset || !ruleset.pages) throw new Error('No pages mapped in ruleset');

      const themeStyles = ruleset.theme?.styles || '';
      const liveAssets = ruleset.theme?.live_assets || {};
      const usesTailwind = ruleset.theme?.tailwind || false;
      const tailwindConfig = ruleset.theme?.tailwind_config || null;

      // Write merged stylesheet to disk so templates can <link> to it
      const importDir = path.join(process.cwd(), 'templates', 'imported', String(this.siteId));
      await fs.mkdir(importDir, { recursive: true });
      let stylesheetUrl = null;

      if (themeStyles.trim().length > 0) {
        const cssPath = path.join(importDir, 'styles.css');
        await fs.writeFile(cssPath, themeStyles);
        stylesheetUrl = `/imported/${this.siteId}/styles.css`;
        info(this.dbName, 'LOVABLE_STYLES_SAVED', `Wrote ${themeStyles.length} chars to ${cssPath}`);
      }

      // Build the links array — start with any live-crawled stylesheets
      const baseLinks = [...(liveAssets.stylesheets || [])];
      if (stylesheetUrl) baseLinks.push(stylesheetUrl);

      // Build the scripts array — start with any live-crawled scripts
      const baseScripts = [...(liveAssets.scripts || [])];

      for (const [pathKey, pageConfig] of Object.entries(ruleset.pages)) {
        info(this.dbName, 'LOVABLE_TEMPLATE_GEN_CONVERT', `Converting ${pathKey}...`);

        const sourceItem = await prisma.staged_items.findFirst({
          where: { site_id: this.siteId, url: pathKey }
        });

        if (!sourceItem) continue;

        // Ask AI to convert .tsx to .njk
        const njkCode = await convertReactToNunjucks(
          sourceItem.raw_html, 
          pageConfig.regions, 
          pageConfig.page_type,
          themeStyles,
          pageConfig.live_rendered_html,
          baseLinks,
          baseScripts,
          liveAssets.fonts || [],
          null,
          usesTailwind,
          tailwindConfig
        );

        const filename = `imported/${this.siteId}/${pathKey.split('/').pop().replace(/\.(tsx|jsx)$/, '')}.njk`;
        const fullPath = path.join(process.cwd(), 'templates', filename);

        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, njkCode);

        // Convert regions to standard CMS format
        const cmsRegions = (pageConfig.regions || []).map(r => ({
          name: r.key,
          label: r.label,
          type: r.type,
          multiple: !!r.multiple
        }));

        const template = await prisma.templates.upsert({
          where: { filename: filename },
          update: {
            name: `Lovable ${pageConfig.page_type} (${pathKey.split('/').pop()})`,
            content_type: pageConfig.page_type === 'product' ? 'products' : 'pages',
            content: njkCode,
            description: pageConfig.summary,
            blueprint: { regions: pageConfig.regions },
            regions: JSON.stringify(cmsRegions),
            updated_at: new Date()
          },
          create: {
            name: `Lovable ${pageConfig.page_type} (${pathKey.split('/').pop()})`,
            filename: filename,
            content: njkCode,
            content_type: pageConfig.page_type === 'product' ? 'products' : 'pages',
            description: pageConfig.summary,
            blueprint: { regions: pageConfig.regions },
            regions: JSON.stringify(cmsRegions)
          }
        });

        ruleset.pages[pathKey].template_id = template.id;
      }

      await prisma.imported_sites.update({
        where: { id: this.siteId },
        data: { llm_ruleset: ruleset }
      });

      info(this.dbName, 'LOVABLE_TEMPLATE_GEN_COMPLETE', `Templates generated from source`);

    } catch (err) {
      logError(this.dbName, err, 'LOVABLE_TEMPLATE_GEN_FAILED');
      throw err;
    }
  }
}
