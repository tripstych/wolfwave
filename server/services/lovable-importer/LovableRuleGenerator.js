import prisma from '../../lib/prisma.js';
import { info, error as logError } from '../../lib/logger.js';
import { analyzeLovableSource } from '../aiService.js';
import { LovableImporterService } from './LovableImporterService.js';

/**
 * LovableRuleGenerator analyzes source code (.tsx/.jsx) instead of rendered HTML.
 * It identifies logical "Pages" and their "Editable Regions".
 */
export class LovableRuleGenerator {
  constructor(siteId, dbName) {
    this.siteId = siteId;
    this.dbName = dbName;
  }

  async run() {
    try {
      info(this.dbName, 'LOVABLE_RULEGEN_START', `Analyzing source for site ${this.siteId}`);

      const site = await prisma.imported_sites.findUnique({ where: { id: this.siteId } });
      const ruleset = {
        importer_type: 'git_source',
        pages: {}, // Maps path -> region definitions
        components: {},
        theme: {}
      };

      // 1. Identify primary pages (usually in src/pages/ or src/App.tsx routes)
      const stagedFiles = await prisma.staged_items.findMany({
        where: { site_id: this.siteId }
      });

      const sourcePages = stagedFiles.filter(f => 
        f.url.includes('pages/') && f.url.match(/\.(tsx|jsx)$/)
      );

      info(this.dbName, 'LOVABLE_RULEGEN_PAGES', `Found ${sourcePages.length} primary page components`);

      for (const pageItem of sourcePages) {
        info(this.dbName, 'LOVABLE_RULEGEN_ANALYZE', `Analyzing component: ${pageItem.url}`);
        
        // Ask AI to find props/state/literals that should be CMS regions
        const analysis = await analyzeLovableSource(pageItem.raw_html, pageItem.url);
        
        ruleset.pages[pageItem.url] = {
          file_path: pageItem.url,
          page_type: analysis.page_type,
          regions: analysis.regions,
          summary: analysis.summary
        };

        // Update the item type in DB
        await prisma.staged_items.update({
          where: { id: pageItem.id },
          data: { item_type: analysis.page_type }
        });
      }

      await prisma.imported_sites.update({
        where: { id: this.siteId },
        data: {
          llm_ruleset: ruleset,
          status: 'rules_generated'
        }
      });

      return ruleset;
    } catch (err) {
      logError(this.dbName, err, 'LOVABLE_RULEGEN_FAILED');
      throw err;
    }
  }
}
