import { SPARenderer } from './SPARenderer.js';
import { HTMLSanitizer } from './HTMLSanitizer.js';
import { LovableRuleGenerator } from './LovableRuleGenerator.js';
import { LovableTemplateGenerator } from './LovableTemplateGenerator.js';
import { LovableTransformer } from './LovableTransformer.js';
import { info, error as logError } from '../../lib/logger.js';
import { runWithTenant, getCurrentDbName } from '../../lib/tenantContext.js';
import prisma from '../../lib/prisma.js';
import { jobRegistry } from '../importer-v2/JobRegistry.js';

export class LovableImporterService {
  /**
   * Update site status and last action (with cancellation check)
   */
  static async updateStatus(siteId, status, lastAction) {
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
    info(dbName, 'LOVABLE_NUKE_START', 'Nuking existing site data for fresh import');

    await prisma.pages.deleteMany({});
    await prisma.products.deleteMany({});
    await prisma.content_history.deleteMany({});
    await prisma.content.deleteMany({});
    await prisma.templates.deleteMany({
      where: { filename: { startsWith: 'imported/' } }
    });

    info(dbName, 'LOVABLE_NUKE_COMPLETE', 'Site data cleared');
  }

  /**
   * Start a new Lovable import process (runs in background)
   */
  static async startImport(siteId, rootUrl) {
    const dbName = getCurrentDbName();

    LovableImporterService._runFullProcess(siteId, rootUrl, dbName).catch(err => {
      logError(dbName, err, 'LOVABLE_IMPORT_CRITICAL');
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

        // Optional nuke
        if (config.nuke) {
          await LovableImporterService.updateStatus(siteId, 'nuking', 'Clearing existing site data...');
          await LovableImporterService.nukeSiteData(dbName);
        }

        // Phase 1: SPA Rendering
        if (jobRegistry.isCancelled(siteId)) throw new Error('IMPORT_CANCELLED');
        await LovableImporterService.updateStatus(siteId, 'rendering', 'Launching headless browser...');
        const renderer = new SPARenderer(siteId, rootUrl, dbName, config);
        await renderer.run();

        // Phase 2: HTML Sanitization (Tailwind stripping)
        if (jobRegistry.isCancelled(siteId)) throw new Error('IMPORT_CANCELLED');
        await LovableImporterService.updateStatus(siteId, 'sanitizing', 'Stripping Tailwind classes and React artifacts...');
        const sanitizer = new HTMLSanitizer(siteId, dbName);
        await sanitizer.run();

        // Phase 3: Rule Generation (AI analysis)
        if (jobRegistry.isCancelled(siteId)) throw new Error('IMPORT_CANCELLED');
        await LovableImporterService.updateStatus(siteId, 'generating_rules', 'AI analyzing page structures...');
        const ruleGen = new LovableRuleGenerator(siteId, dbName);
        await ruleGen.run();

        // Phase 4: Template Generation
        if (jobRegistry.isCancelled(siteId)) throw new Error('IMPORT_CANCELLED');
        await LovableImporterService.updateStatus(siteId, 'generating_templates', 'Generating Nunjucks templates...');
        const templateGen = new LovableTemplateGenerator(siteId, dbName);
        await templateGen.run();

        info(dbName, 'LOVABLE_IMPORT_READY', `Lovable import for ${rootUrl} ready for finalization`);
        await LovableImporterService.updateStatus(siteId, 'ready', 'Templates generated. Ready for final migration!');

      } catch (err) {
        if (err.message === 'IMPORT_CANCELLED') {
          info(dbName, 'LOVABLE_IMPORT_CANCELLED', `Import for ${rootUrl} cancelled.`);
          try {
            await prisma.imported_sites.update({
              where: { id: siteId },
              data: { status: 'cancelled', last_action: 'Import cancelled by user.' }
            }).catch(() => {});
          } catch {}
        } else {
          logError(dbName, err, 'LOVABLE_IMPORT_FAILED');
          try {
            await LovableImporterService.updateStatus(siteId, 'failed', `Error: ${err.message}`);
          } catch {}
        }
      } finally {
        jobRegistry.unregister(siteId);
      }
    });
  }
}
