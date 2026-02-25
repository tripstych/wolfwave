import prisma from '../../lib/prisma.js';
import { info, error as logError } from '../../lib/logger.js';

/**
 * REBUILD: LovableTransformer (Senior Systems Engineer)
 * Task: Explicit Prisma Creation and Content Mapping.
 */
export class LovableTransformer {
  constructor(siteId, dbName) {
    this.siteId = siteId;
    this.dbName = dbName;
  }

  async run() {
    try {
      info(this.dbName, 'LOVABLE_TRANSFORM_START', `Starting explicit Prisma ingestion for site ${this.siteId}`);

      const site = await prisma.imported_sites.findUnique({
        where: { id: this.siteId }
      });

      if (!site || !site.llm_ruleset) throw new Error('Route manifest (ruleset) not found');
      const ruleset = site.llm_ruleset;

      // Iterate through the discovered manifest
      for (const [pathKey, pageConfig] of Object.entries(ruleset.pages)) {
        info(this.dbName, 'LOVABLE_TRANSFORM_PAGE', `Ingesting: ${pathKey} -> /${pageConfig.route_slug}`);

        // Construct the content data object from extracted literals
        const contentData = {};
        (pageConfig.regions || []).forEach(region => {
          contentData[region.key] = region.raw_value;
        });

        // 3. Explicit Prisma Creation (Requirement 3)
        // Note: Using WolfWave 'pages' and 'content' models
        await prisma.pages.create({
          data: {
            title: pageConfig.title || pathKey.split('/').pop(),
            slug: pageConfig.route_slug,
            template_id: pageConfig.template_id, // Linked during Template Gen phase
            content_type: 'pages',
            status: 'draft',
            content: {
              create: {
                module: 'pages',
                title: pageConfig.title,
                data: contentData // The raw extracted literals
              }
            }
          }
        });

        info(this.dbName, 'LOVABLE_TRANSFORM_SUCCESS', `Created CMS page for ${pageConfig.route_slug}`);
      }

      info(this.dbName, 'LOVABLE_TRANSFORM_COMPLETE', `Successfully ingested all pages from manifest`);

    } catch (err) {
      logError(this.dbName, err, 'LOVABLE_TRANSFORM_FAILED');
      throw err;
    }
  }
}
