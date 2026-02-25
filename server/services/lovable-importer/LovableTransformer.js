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
        // Note: Using sequential creation to avoid nested logic errors
        info(this.dbName, 'LOVABLE_TRANSFORM_PRISMA', `Creating content record for ${pageConfig.route_slug}`);
        const contentRecord = await prisma.content.create({
          data: {
            module: 'pages',
            title: pageConfig.title || pathKey.split('/').pop(),
            slug: pageConfig.route_slug,
            data: contentData
          }
        });

        info(this.dbName, 'LOVABLE_TRANSFORM_PRISMA', `Creating page record for ${pageConfig.route_slug}`);
        await prisma.pages.create({
          data: {
            title: pageConfig.title || pathKey.split('/').pop(),
            template_id: pageConfig.template_id,
            content_id: contentRecord.id,
            content_type: 'pages',
            status: 'draft'
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
