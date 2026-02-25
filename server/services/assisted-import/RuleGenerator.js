import prisma from '../../lib/prisma.js';
import { analyzeSiteImport } from '../aiService.js';
import { info, error as logError } from '../../lib/logger.js';
import { AssistedImportService } from './AssistedImportService.js';

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
      info(this.dbName, 'ASSISTED_IMPORT_RULEGEN_START', `Generating rules for site ${this.siteId}`);

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

      info(this.dbName, 'ASSISTED_IMPORT_RULEGEN_GROUPS', `Found ${groups.length} unique structural groups`);

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

        info(this.dbName, 'ASSISTED_IMPORT_RULEGEN_ANALYZE', `Analyzing group ${group.structural_hash} (Sample: ${sample.url})`);
        await AssistedImportService.updateStatus(this.siteId, 'generating_rules', `Analyzing group ${processedGroups}/${groups.length} (${group.structural_hash.substring(0,8)})...`);

        // Use LLM to analyze the ultra-clean LLM HTML
        const analysis = await analyzeSiteImport(sample.stripped_html, sample.url);

        // --- VALIDATION STEP: Test regions against other group members ---
        info(this.dbName, 'IMPORT_V2_RULEGEN_VALIDATE', `Validating ${analysis.regions?.length || 0} regions for group ${group.structural_hash}`);
        const groupMembers = await prisma.staged_items.findMany({
          where: { site_id: this.siteId, structural_hash: group.structural_hash },
          take: 5,
          select: { url: true, stripped_html: true }
        });

        const validatedRegions = [];
        const failureReport = [];

        for (const region of (analysis.regions || [])) {
          let successCount = 0;
          let totalDensityScore = 0;
          const failures = [];

          for (const member of groupMembers) {
            const cheerio = await import('cheerio');
            const $ = cheerio.load(member.stripped_html);
            const $el = $(region.selector);
            
            if ($el.length > 0) {
              successCount++;
              
              // --- SEMANTIC DENSITY CALCULATION ---
              const text = $el.text().trim();
              const html = $el.html() || '';
              
              // Clues: Paragraphs, headers, and lists are "semantic"
              const semanticTags = $el.find('p, h1, h2, h3, h4, h5, h6, li, article, section').length;
              // Noise: Too many links relative to text is a "navigation" block
              const linkTags = $el.find('a').length;
              const linkTextLength = $el.find('a').text().length;
              
              const textDensity = text.length > 0 ? (text.length - linkTextLength) / text.length : 0;
              
              // Score Formula: Reward text and semantic tags, penalize high link ratios
              const densityScore = (text.length / 200) + (semanticTags * 2) - (linkTags * 3);
              totalDensityScore += densityScore;
            } else {
              failures.push(member.url);
            }
          }

          const successRate = successCount / groupMembers.length;
          const avgDensity = successCount > 0 ? totalDensityScore / successCount : 0;

          if (successRate < 1.0) {
            failureReport.push({
              field: region.key,
              selector: region.selector,
              success_rate: successRate,
              failed_urls: failures
            });
          }

          validatedRegions.push({
            ...region,
            validation: {
              success_rate: successRate,
              density_score: Math.round(avgDensity * 10) / 10,
              is_brittle: successRate < 1.0,
              is_low_density: (region.key === 'content' || region.type === 'richtext') && avgDensity < 5,
              is_invalid: successRate === 0,
              failed_urls: failures
            }
          });
        }

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
          regions: validatedRegions,
          selector_map: selectorMap,
          validation_report: failureReport, // Detailed report for this group
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
      logError(this.dbName, err, 'ASSISTED_IMPORT_RULEGEN_FAILED');
      throw err;
    }
  }
}
