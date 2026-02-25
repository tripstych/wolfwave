import prisma from '../../lib/prisma.js';
import { analyzeSiteImport } from '../aiService.js';
import { info, error as logError } from '../../lib/logger.js';
import { ImporterServiceV2 } from './ImporterServiceV2.js';

/**
 * RuleGenerator analyzes the crawled pages and creates fine-grained extraction rules.
 * It groups pages by structural hash to avoid redundant LLM calls.
 */
export class RuleGenerator {
  constructor(siteId, dbName) {
    this.siteId = siteId;
    this.dbName = dbName;
  }

  async run() {
    try {
      info(this.dbName, 'IMPORT_V2_RULEGEN_START', `Generating rules for site ${this.siteId}`);

      const site = await prisma.imported_sites.findUnique({
        where: { id: this.siteId }
      });

      if (!site) throw new Error('Site not found');
      const ruleset = site.llm_ruleset || {};
      if (!ruleset.types) ruleset.types = {};

      // Get unique structural hashes
      const groups = await prisma.staged_items.groupBy({
        by: ['structural_hash'],
        where: { site_id: this.siteId },
        _count: { id: true }
      });

      info(this.dbName, 'IMPORT_V2_RULEGEN_GROUPS', `Found ${groups.length} unique structural groups`);

      let processedGroups = 0;
      for (const group of groups) {
        if (!group.structural_hash) continue;
        processedGroups++;

        // Take one sample page from this group
        const sample = await prisma.staged_items.findFirst({
          where: {
            site_id: this.siteId,
            structural_hash: group.structural_hash
          }
        });

        if (!sample || !sample.llm_html) continue;

        info(this.dbName, 'IMPORT_V2_RULEGEN_ANALYZE', `Analyzing group ${group.structural_hash} (Sample: ${sample.url})`);
        await ImporterServiceV2.updateStatus(this.siteId, 'generating_rules', `Analyzing group ${processedGroups}/${groups.length} (${group.structural_hash.substring(0,8)})...`);

        // Use LLM to analyze the ultra-clean LLM HTML
        const analysis = await analyzeSiteImport(sample.stripped_html, sample.url);

        // --- VALIDATION STEP: Test regions against other group members ---
        info(this.dbName, 'IMPORT_V2_RULEGEN_VALIDATE', `Validating ${analysis.regions?.length || 0} regions for group ${group.structural_hash}`);
        const groupMembers = await prisma.staged_items.findMany({
          where: { site_id: this.siteId, structural_hash: group.structural_hash },
          take: 5,
          select: { url: true, stripped_html: true }
        });

        const validatedRegions = (analysis.regions || []).map(region => {
          let successCount = 0;
          for (const member of groupMembers) {
            const $ = (await import('cheerio')).load(member.stripped_html);
            if ($(region.selector).length > 0) successCount++;
          }

          const successRate = successCount / groupMembers.length;
          return {
            ...region,
            validation: {
              success_rate: successRate,
              is_brittle: successRate < 1.0,
              is_invalid: successRate === 0
            }
          };
        });

        // Convert to selector_map for Transformation Engine compatibility
        const selectorMap = {};
        validatedRegions.forEach(r => {
          selectorMap[r.key] = {
            selector: r.selector,
            attr: r.attr,
            multiple: r.multiple,
            type: r.type
          };
        });

        ruleset.types[group.structural_hash] = {
          page_type: analysis.page_type,
          regions: validatedRegions, // Rich metadata for Template Gen and UI
          selector_map: selectorMap,   // Simplified map for Transformation Engine
          confidence: analysis.confidence,
          summary: analysis.summary,
          sample_url: sample.url
        };

        // Update staged items in this group with the detected type
        await prisma.staged_items.updateMany({
          where: {
            site_id: this.siteId,
            structural_hash: group.structural_hash
          },
          data: {
            item_type: analysis.page_type
          }
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
      logError(this.dbName, err, 'IMPORT_V2_RULEGEN_FAILED');
      throw err;
    }
  }
}
