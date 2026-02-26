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
      info(this.dbName, 'LOVABLE_TRANSFORM_START', `Starting explicit CMS ingestion for site ${this.siteId}`);

      const site = await prisma.imported_sites.findUnique({
        where: { id: this.siteId }
      });

      if (!site || !site.llm_ruleset) throw new Error('Route manifest (ruleset) not found');
      const ruleset = site.llm_ruleset;

      // Iterate through the discovered manifest
      for (const [pathKey, pageConfig] of Object.entries(ruleset.pages)) {
        const routeSlug = pageConfig.route_slug === 'home' ? '/' : `/${pageConfig.route_slug.replace(/^\//, '')}`;
        info(this.dbName, 'LOVABLE_TRANSFORM_PAGE', `Ingesting: ${pathKey} -> ${routeSlug}`);

        // Construct the content data object from extracted literals
        const contentData = {};
        (pageConfig.regions || []).forEach(region => {
          contentData[region.key] = region.raw_value;
        });

        // Step A: Upsert the content record
        // We use a unique slug per site import to avoid clobbering other sites
        const finalSlug = pageConfig.route_slug === 'home' ? `imported-${this.siteId}-home` : pageConfig.route_slug;
        
        info(this.dbName, 'LOVABLE_TRANSFORM_PRISMA', `Upserting content for ${finalSlug}`);
        const contentRecord = await prisma.content.upsert({
          where: { slug: finalSlug },
          update: {
            title: pageConfig.title || pathKey.split('/').pop(),
            data: contentData,
            updated_at: new Date()
          },
          create: {
            module: 'pages',
            title: pageConfig.title || pathKey.split('/').pop(),
            slug: finalSlug,
            data: contentData
          }
        });

        // Step B: Manage the page record
        info(this.dbName, 'LOVABLE_TRANSFORM_PRISMA', `Managing page record for ${routeSlug}`);
        
        // Try to find existing page by slug and site context if possible, 
        // but for now we'll use title + template as a proxy
        const existingPage = await prisma.pages.findFirst({
          where: { 
            title: pageConfig.title || pathKey.split('/').pop(),
            template_id: pageConfig.template_id 
          }
        });

        if (existingPage) {
          await prisma.pages.update({
            where: { id: existingPage.id },
            data: { 
              content_id: contentRecord.id, 
              status: 'published',
              updated_at: new Date() 
            }
          });
        } else {
          await prisma.pages.create({
            data: {
              title: pageConfig.title || pathKey.split('/').pop(),
              template_id: pageConfig.template_id,
              content_id: contentRecord.id,
              content_type: 'pages',
              status: 'published'
            }
          });
        }

        // Update the site home_page_id if this is the home page
        if (pageConfig.route_slug === 'home') {
          const page = await prisma.pages.findFirst({
             where: { content_id: contentRecord.id }
          });
          if (page) {
            await query('UPDATE settings SET setting_value = ? WHERE setting_key = ?', [page.id, 'home_page_id']);
          }
        }

        info(this.dbName, 'LOVABLE_TRANSFORM_SUCCESS', `Created CMS page for ${routeSlug}`);
      }

      info(this.dbName, 'LOVABLE_TRANSFORM_COMPLETE', `Successfully ingested all pages from manifest`);

    } catch (err) {
      logError(this.dbName, err, 'LOVABLE_TRANSFORM_FAILED');
      throw err;
    }
  }
}
