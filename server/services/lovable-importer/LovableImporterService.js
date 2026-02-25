import { RepoManager } from './RepoManager.js';
import { LovableRuleGenerator } from './LovableRuleGenerator.js';
import { LovableTemplateGenerator } from './LovableTemplateGenerator.js';
import { LovableTransformer } from './LovableTransformer.js';
import { info, error as logError } from '../../lib/logger.js';
import { runWithTenant, getCurrentDbName } from '../../lib/tenantContext.js';
import prisma from '../../lib/prisma.js';
import { jobRegistry } from '../assisted-import/JobRegistry.js';

export class LovableImporterService {
  /**
   * Update site status and last action
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
   * Clears content and templates
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
   * Start a new Lovable Git-based import process
   */
  static async startImport(siteId, repoUrl) {
    const dbName = getCurrentDbName();
    LovableImporterService._runFullProcess(siteId, repoUrl, dbName).catch(err => {
      logError(dbName, err, 'LOVABLE_GIT_IMPORT_CRITICAL');
    });
    return { status: 'started', siteId };
  }

  static async _runFullProcess(siteId, repoUrl, dbName) {
    jobRegistry.register(siteId);
    const repo = new RepoManager(siteId, repoUrl, dbName);

    await runWithTenant(dbName, async () => {
      try {
        const site = await prisma.imported_sites.findUnique({ where: { id: siteId } });
        if (!site) throw new Error('Site record not found');

        // 1. Clone & Scan
        await LovableImporterService.updateStatus(siteId, 'cloning', `Cloning repository: ${repoUrl}`);
        await repo.clone();

        if (jobRegistry.isCancelled(siteId)) throw new Error('IMPORT_CANCELLED');
        await LovableImporterService.updateStatus(siteId, 'analyzing', 'Scanning source files...');
        
        const files = await repo.scan();
        info(dbName, 'LOVABLE_REPO_SCANNED', `Found ${files.length} source files`);

        // Create staged items from source files (Phase 1 equivalent)
        for (const file of files) {
          const relativePath = repo.getRelativePath(file);
          const content = await repo.readFile(relativePath);
          
          await prisma.staged_items.upsert({
            where: { unique_site_url: { site_id: siteId, url: relativePath } },
            update: {
              title: relativePath,
              raw_html: content, // Storing source code in raw_html field
              status: 'crawled'
            },
            create: {
              site_id: siteId,
              url: relativePath,
              title: relativePath,
              raw_html: content,
              status: 'crawled'
            }
          });
        }

        // 2. Rule Generation (AI analyzes source files)
        if (jobRegistry.isCancelled(siteId)) throw new Error('IMPORT_CANCELLED');
        await LovableImporterService.updateStatus(siteId, 'generating_rules', 'AI mapping source components to CMS regions...');
        const ruleGen = new LovableRuleGenerator(siteId, dbName);
        await ruleGen.run();

        // 3. Template Generation (Source to Nunjucks)
        if (jobRegistry.isCancelled(siteId)) throw new Error('IMPORT_CANCELLED');
        await LovableImporterService.updateStatus(siteId, 'generating_templates', 'Converting components to Nunjucks...');
        const templateGen = new LovableTemplateGenerator(siteId, dbName);
        await templateGen.run();

        // 4. Content Extraction (optional first pass)
        // For Git imports, transformation might be simpler as we're mostly creating templates.
        
        info(dbName, 'LOVABLE_IMPORT_READY', `Git import for ${repoUrl} ready`);
        await LovableImporterService.updateStatus(siteId, 'ready', 'Source imported and templates generated!');

      } catch (err) {
        if (err.message === 'IMPORT_CANCELLED') {
          info(dbName, 'LOVABLE_IMPORT_CANCELLED', `Import for ${repoUrl} cancelled.`);
        } else {
          logError(dbName, err, 'LOVABLE_IMPORT_FAILED');
          await LovableImporterService.updateStatus(siteId, 'failed', `Error: ${err.message}`);
        }
      } finally {
        await repo.cleanup();
        jobRegistry.unregister(siteId);
      }
    });
  }
}
