import { RuleGenerator } from '../importer-v2/RuleGenerator.js';
import prisma from '../../lib/prisma.js';
import { info } from '../../lib/logger.js';

/**
 * Lovable-specific rule generator.
 * Aggregates styles from staged items to ensure WYSIWYG support.
 */
export class LovableRuleGenerator extends RuleGenerator {
  async run() {
    // Run the standard rule generation first
    const ruleset = await super.run();

    info(this.dbName, 'LOVABLE_RULEGEN_STYLES', `Aggregating styles for WYSIWYG...`);

    // Aggregate unique styles from all structural groups
    const globalStyles = {
      links: new Set(),
      inline: new Set()
    };

    const items = await prisma.staged_items.findMany({
      where: { site_id: this.siteId, status: 'crawled' },
      select: { metadata: true }
    });

    for (const item of items) {
      const styles = item.metadata?.styles;
      if (!styles) continue;

      if (Array.isArray(styles.links)) {
        styles.links.forEach(l => globalStyles.links.add(l));
      }
      if (Array.isArray(styles.inline)) {
        styles.inline.forEach(i => globalStyles.inline.add(i));
      }
    }

    // Convert Sets to Arrays for JSON storage
    ruleset.lovable_styles = {
      links: Array.from(globalStyles.links),
      inline: Array.from(globalStyles.inline)
    };

    // Update the site with the enriched ruleset
    await prisma.imported_sites.update({
      where: { id: this.siteId },
      data: { llm_ruleset: ruleset }
    });

    return ruleset;
  }
}
