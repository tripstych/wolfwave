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

        let attempts = 0;
        const maxAttempts = 3;
        let bestAnalysis = null;
        let feedback = null;
        const attemptedSamples = new Set();

        while (attempts < maxAttempts) {
          attempts++;
          
          // 1. Pick a sample page we haven't tried yet
          const sample = await prisma.staged_items.findFirst({
            where: {
              site_id: this.siteId,
              structural_hash: group.structural_hash,
              url: { notIn: Array.from(attemptedSamples) }
            },
            select: { id: true, url: true, stripped_html: true, llm_html: true }
          });

          if (!sample) break;
          attemptedSamples.add(sample.url);

          info(this.dbName, 'ASSISTED_IMPORT_RULEGEN_ANALYZE', `Attempt ${attempts}/${maxAttempts} for group ${group.structural_hash.substring(0,8)} (Sample: ${sample.url})`);
          await AssistedImportService.updateStatus(this.siteId, 'generating_rules', `Analyzing group ${processedGroups}/${groups.length} (Attempt ${attempts})...`);

          // 2. AI Analysis (Technical Content Engineer Prompt)
          const analysis = await analyzeSiteImport(sample.stripped_html, sample.url, null, null, feedback);

          // --- TRANSLATE NEW SCHEMA TO INTERNAL REGIONS ---
          const suggestedRegions = [];
          if (analysis.content) {
            Object.entries(analysis.content).forEach(([selector, sampleValue]) => {
              // Create a clean key from the selector (e.g. ".main-title" -> "main_title")
              const cleanKey = selector.replace(/[.#]/g, '').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
              
              // Guess type based on sampleValue (if it has tags, it's richtext)
              const type = (typeof sampleValue === 'string' && /<[a-z][\s\S]*>/i.test(sampleValue)) ? 'richtext' : 'text';
              
              suggestedRegions.push({
                key: cleanKey,
                label: cleanKey.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
                selector: selector,
                type: type,
                multiple: false // Default for this schema, can be overridden by specific logic if needed
              });
            });
          }

          // Handle Media
          if (analysis.media && analysis.media.length > 0) {
            // Find a common selector for media if the LLM didn't provide one
            // For now, we'll create a generic 'images' region
            suggestedRegions.push({
              key: 'images',
              label: 'Primary Media',
              selector: 'img', // Fallback, will be validated below
              type: 'image',
              multiple: true
            });
          }

          // 3. Validation
          info(this.dbName, 'ASSISTED_IMPORT_RULEGEN_VALIDATE', `Validating ${suggestedRegions.length} suggested regions for group ${group.structural_hash}`);
          const groupMembers = await prisma.staged_items.findMany({
            where: { site_id: this.siteId, structural_hash: group.structural_hash },
            take: 5,
            select: { url: true, stripped_html: true }
          });

          const validatedRegions = [];
          const currentFailures = [];
          let groupHasFailures = false;

          for (const region of suggestedRegions) {
            let successCount = 0;
            let totalDensityScore = 0;
            const failures = [];

            for (const member of groupMembers) {
              const cheerio = await import('cheerio');
              const $ = cheerio.load(member.stripped_html);
              const $el = $(region.selector);
              
              if ($el.length > 0) {
                successCount++;
                const text = $el.text().trim();
                const semanticTags = $el.find('p, h1, h2, h3, h4, h5, h6, li, article, section').length;
                const linkTags = $el.find('a').length;
                const densityScore = (text.length / 200) + (semanticTags * 2) - (linkTags * 3);
                totalDensityScore += densityScore;
              } else {
                failures.push(member.url);
              }
            }

            const successRate = successCount / groupMembers.length;
            const avgDensity = successCount > 0 ? totalDensityScore / successCount : 0;
            const isLowDensity = (region.key.includes('content') || region.type === 'richtext') && avgDensity < 5;

            if (successRate < 1.0) { // We care most about selector matching in this phase
              groupHasFailures = true;
              currentFailures.push({
                key: region.key,
                selector: region.selector,
                reason: 'Selector not found on all pages'
              });
            }

            validatedRegions.push({
              ...region,
              validation: {
                success_rate: successRate,
                density_score: Math.round(avgDensity * 10) / 10,
                is_brittle: successRate < 1.0,
                is_low_density: isLowDensity,
                is_invalid: successRate === 0,
                failed_urls: failures,
                total_checked: groupMembers.length
              }
            });
          }

          // 4. Store the best result so far
          bestAnalysis = {
            page_type: analysis.page_type,
            regions: validatedRegions,
            navigation: analysis.navigation,
            media_samples: analysis.media,
            summary: analysis.summary,
            confidence: analysis.confidence,
            sample_url: sample.url,
            attempts: attempts
          };

          // 5. If perfect, stop. Otherwise, prepare feedback and retry.
          if (!groupHasFailures) {
            info(this.dbName, 'ASSISTED_IMPORT_RULEGEN_SUCCESS', `Found perfect selectors for group ${group.structural_hash.substring(0,8)} after ${attempts} attempts`);
            break; 
          }

          feedback = currentFailures;
          info(this.dbName, 'ASSISTED_IMPORT_RULEGEN_RETRY', `Group ${group.structural_hash.substring(0,8)} failed validation. Retrying with different sample...`);
        }

        // --- Post-Loop: Finalize with best result ---
        const selectorMap = {};
        bestAnalysis.regions.forEach(r => {
          selectorMap[r.key] = {
            selector: r.selector,
            attr: r.attr,
            multiple: r.multiple,
            type: r.type
          };
        });

        ruleset.types[group.structural_hash] = {
          ...bestAnalysis,
          selector_map: selectorMap
        };

        // Update staged items in this group with the detected type
        await prisma.staged_items.updateMany({
          where: { site_id: this.siteId, structural_hash: group.structural_hash },
          data: { item_type: bestAnalysis.page_type }
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
