import { DiscoveryEngine } from './DiscoveryEngine.js';
import { AssetSideloader } from './AssetSideloader.js';
import { CrawlEngine } from './CrawlEngine.js';
import { RuleGenerator } from './RuleGenerator.js';
import { TemplateGenerator } from './TemplateGenerator.js';
import { TransformationEngine } from './TransformationEngine.js';
import { info, error as logError } from '../../lib/logger.js';
import { runWithTenant, getCurrentDbName } from '../../lib/tenantContext.js';
import prisma from '../../lib/prisma.js';
import { jobRegistry } from './JobRegistry.js';

export class ImporterServiceV2 {
  /**
   * Helper to update site status and last action
   */
  static async updateStatus(siteId, status, lastAction) {
    // Before updating, check if job was cancelled
    if (jobRegistry.isCancelled(siteId)) {
      throw new Error('IMPORT_CANCELLED');
    }

    return await prisma.imported_sites.update({
      where: { id: siteId },
      data: { status, last_action: lastAction }
    });
  }

  /**
   * Clears all content, pages, products, and imported templates for a fresh start
   */
  static async nukeSiteData(dbName) {
    info(dbName, 'IMPORT_V2_NUKE_START', 'Nuking existing site data for fresh import');
    
    // Order matters for relational safety
    await prisma.pages.deleteMany({});
    await prisma.products.deleteMany({});
    await prisma.content_history.deleteMany({});
    await prisma.content.deleteMany({});
    
    // Only nuke templates we created (in the imported/ folder)
    await prisma.templates.deleteMany({
      where: { filename: { startsWith: 'imported/' } }
    });

    info(dbName, 'IMPORT_V2_NUKE_COMPLETE', 'Site data cleared');
  }

  /**
   * Start a new import process
   */
  static async startImport(siteId, rootUrl) {
    const dbName = getCurrentDbName();
    
    // Run in background
    ImporterServiceV2._runFullProcess(siteId, rootUrl, dbName).catch(err => {
      logError(dbName, err, 'IMPORT_V2_ORCHESTRATION_CRITICAL');
    });

    return { status: 'started', siteId };
  }

  static async _runFullProcess(siteId, rootUrl, dbName) {
    jobRegistry.register(siteId);

    await runWithTenant(dbName, async () => {
      try {
        const site = await prisma.imported_sites.findUnique({ where: { id: siteId } });
        if (!site) throw new Error('Site record not found');
        
        const config = site.config || {};

        if (config.nuke) {
          await ImporterServiceV2.updateStatus(siteId, 'nuking', 'Clearing existing site data...');
          await ImporterServiceV2.nukeSiteData(dbName);
        }

        // Check for cancellation before each major phase
        if (jobRegistry.isCancelled(siteId)) throw new Error('IMPORT_CANCELLED');

        await ImporterServiceV2.updateStatus(siteId, 'analyzing', 'Starting site discovery...');
        
        // Phase 1: Discovery
        const discovery = new DiscoveryEngine(siteId, rootUrl, dbName);
        await discovery.run();

        if (jobRegistry.isCancelled(siteId)) throw new Error('IMPORT_CANCELLED');

        // Phase 1b: Asset Sideloading (non-fatal)
        try {
          await ImporterServiceV2.updateStatus(siteId, 'analyzing', 'Sideloading theme assets...');
          const sideloader = new AssetSideloader(siteId, dbName);
          await sideloader.run();
        } catch (assetErr) {
          if (assetErr.message === 'IMPORT_CANCELLED') throw assetErr;
          logError(dbName, assetErr, 'IMPORT_V2_ASSET_SIDELOAD_FAILED');
          await ImporterServiceV2.updateStatus(siteId, 'analyzing', 'Asset sideloading failed, continuing with crawl...');
        }

        if (jobRegistry.isCancelled(siteId)) throw new Error('IMPORT_CANCELLED');
        await ImporterServiceV2.updateStatus(siteId, 'crawling', 'Starting site crawl...');

        // Phase 2: Crawl
        const crawler = new CrawlEngine(siteId, rootUrl, dbName, config);
        await crawler.run();

        if (jobRegistry.isCancelled(siteId)) throw new Error('IMPORT_CANCELLED');
        await ImporterServiceV2.updateStatus(siteId, 'generating_rules', 'Analyzing page structures...');

        // Phase 3: Rule Generation
        const ruleGen = new RuleGenerator(siteId, dbName);
        await ruleGen.run();

        if (jobRegistry.isCancelled(siteId)) throw new Error('IMPORT_CANCELLED');
        await ImporterServiceV2.updateStatus(siteId, 'generating_templates', 'Generating Nunjucks templates...');

        // Phase 4: Template Generation
        const templateGen = new TemplateGenerator(siteId, dbName);
        await templateGen.run();

        info(dbName, 'IMPORT_V2_READY', `Import process for ${rootUrl} is ready for manual finalization`);
        await ImporterServiceV2.updateStatus(siteId, 'ready', 'Templates generated. Ready for final migration!');

      } catch (err) {
        if (err.message === 'IMPORT_CANCELLED') {
          info(dbName, 'IMPORT_V2_CANCELLED', `Import for ${rootUrl} was cancelled/stopped.`);
          // Status might already be 'cancelled' from the stop route, but let's be sure
          try {
            await prisma.imported_sites.update({
              where: { id: siteId },
              data: { status: 'cancelled', last_action: 'Import cancelled by user.' }
            }).catch(() => {}); // Site record might be gone
          } catch {}
        } else {
          logError(dbName, err, 'IMPORT_V2_PROCESS_FAILED');
          try {
            await ImporterServiceV2.updateStatus(siteId, 'failed', `Error: ${err.message}`);
          } catch {}
        }
      } finally {
        jobRegistry.unregister(siteId);
      }
    });
  }
}
