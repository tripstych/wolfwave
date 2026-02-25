import prisma from '../../lib/prisma.js';
import { info, error as logError } from '../../lib/logger.js';
import { analyzeLovableSource } from '../aiService.js';

/**
 * REBUILD: LovableRuleGenerator (Senior Systems Engineer)
 * Task: Discovery & Route Mapping.
 */
export class LovableRuleGenerator {
  constructor(siteId, dbName) {
    this.siteId = siteId;
    this.dbName = dbName;
  }

  async run() {
    try {
      info(this.dbName, 'LOVABLE_MANIFEST_START', `Building route manifest for site ${this.siteId}`);

      const ruleset = {
        importer_type: 'lovable_industrial',
        pages: {}, // The Route Manifest: Correlates file -> route -> content
        theme: {}
      };

      // 1. Discovery & Route Mapping (Requirement 1)
      const stagedFiles = await prisma.staged_items.findMany({
        where: { site_id: this.siteId }
      });

      // Scan src/pages for primary routes
      const sourcePages = stagedFiles.filter(f => 
        f.url.includes('src/pages/') && f.url.match(/\.(tsx|jsx)$/)
      );

      info(this.dbName, 'LOVABLE_MANIFEST_PAGES', `Discovered ${sourcePages.length} potential routes`);

      for (const pageItem of sourcePages) {
        info(this.dbName, 'LOVABLE_EXTRACT_START', `Scoped content extraction: ${pageItem.url}`);
        
        // 2. Scoped Content Extraction (Requirement 2)
        // AI analyzes source for RAW literals only
        const analysis = await analyzeLovableSource(pageItem.raw_html, pageItem.url);
        
        // Correlate route to manifest
        ruleset.pages[pageItem.url] = {
          file_path: pageItem.url,
          route_slug: analysis.route_slug || this.deriveSlug(pageItem.url),
          title: analysis.title,
          page_type: analysis.page_type,
          regions: analysis.regions, // Extracted literals
          media_paths: analysis.media_paths
        };

        // Update item type for visibility
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
      logError(this.dbName, err, 'LOVABLE_MANIFEST_FAILED');
      throw err;
    }
  }

  deriveSlug(filePath) {
    const filename = filePath.split('/').pop().replace(/\.(tsx|jsx)$/, '').toLowerCase();
    if (filename === 'index') return 'home';
    return filename;
  }
}
