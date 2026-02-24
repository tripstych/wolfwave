import { DiscoveryEngine } from './DiscoveryEngine.js';
import { CrawlEngine } from './CrawlEngine.js';
import { RuleGenerator } from './RuleGenerator.js';
import { TemplateGenerator } from './TemplateGenerator.js';
import { TransformationEngine } from './TransformationEngine.js';
import { info, error as logError } from '../../lib/logger.js';
import { runWithTenant, getCurrentDbName } from '../../lib/tenantContext.js';
import prisma from '../../lib/prisma.js';

export class ImporterServiceV2 {
  /**
   * Helper to update site status and last action
   */
  static async updateStatus(siteId, status, lastAction) {
    return await prisma.imported_sites.update({
      where: { id: siteId },
      data: { status, last_action: lastAction }
    });
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
    await runWithTenant(dbName, async () => {
      try {
        await ImporterServiceV2.updateStatus(siteId, 'analyzing', 'Starting site discovery...');
        
        // Phase 1: Discovery
        const discovery = new DiscoveryEngine(siteId, rootUrl, dbName);
        await discovery.run();

        await ImporterServiceV2.updateStatus(siteId, 'crawling', 'Starting site crawl...');

        // Phase 2: Crawl
        const site = await prisma.imported_sites.findUnique({ where: { id: siteId } });
        const config = site.config || {};
        const crawler = new CrawlEngine(siteId, rootUrl, dbName, config);
        await crawler.run();

        await ImporterServiceV2.updateStatus(siteId, 'generating_rules', 'Analyzing page structures...');

        // Phase 3: Rule Generation
        const ruleGen = new RuleGenerator(siteId, dbName);
        await ruleGen.run();

        await ImporterServiceV2.updateStatus(siteId, 'generating_templates', 'Generating Nunjucks templates...');

        // Phase 4: Template Generation
        const templateGen = new TemplateGenerator(siteId, dbName);
        await templateGen.run();

        await ImporterServiceV2.updateStatus(siteId, 'transforming', 'Transforming content to CMS...');

        // Phase 5: Transformation (Optional/Auto)
        const transform = new TransformationEngine(siteId, dbName);
        await transform.run();

        info(dbName, 'IMPORT_V2_COMPLETE', `Import process for ${rootUrl} fully completed`);
        
        await ImporterServiceV2.updateStatus(siteId, 'completed', 'Import fully completed successfully!');

      } catch (err) {
        logError(dbName, err, 'IMPORT_V2_PROCESS_FAILED');
        await ImporterServiceV2.updateStatus(siteId, 'failed', `Error: ${err.message}`);
      }
    });
  }
}
