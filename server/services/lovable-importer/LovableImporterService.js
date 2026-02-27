import { RepoManager } from './RepoManager.js';
import { LovableRuleGenerator } from './LovableRuleGenerator.js';
import { LovableTemplateGenerator } from './LovableTemplateGenerator.js';
import { LovableTransformer } from './LovableTransformer.js';
import { info, error as logError } from '../../lib/logger.js';
import { runWithTenant, getCurrentDbName } from '../../lib/tenantContext.js';
import { getTenantUploadsDir, registerMediaFile } from '../mediaService.js';
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
    // Safety: Truncate message to avoid DB length errors
    const safeAction = lastAction?.substring(0, 250);

    return await prisma.imported_sites.update({
      where: { id: siteId },
      data: { status, last_action: safeAction }
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
  static async startImport(siteId, repoUrl, liveUrl) {
    const dbName = getCurrentDbName();
    LovableImporterService._runFullProcess(siteId, repoUrl, liveUrl, dbName).catch(err => {
      logError(dbName, err, 'LOVABLE_GIT_IMPORT_CRITICAL');
    });
    return { status: 'started', siteId };
  }

  static async _runFullProcess(siteId, repoUrl, liveUrl, dbName) {
    jobRegistry.register(siteId);
    const repo = new RepoManager(siteId, repoUrl, dbName);

    await runWithTenant(dbName, async () => {
      try {
        const site = await prisma.imported_sites.findUnique({ where: { id: siteId } });
        if (!site) throw new Error('Site record not found');

        // 1. Live Crawl (Optional but recommended for Look & Feel)
        let liveAssets = null;
        if (liveUrl) {
          await LovableImporterService.updateStatus(siteId, 'crawling', `Crawling live site: ${liveUrl}`);
          // We can use the existing DiscoveryEngine if available
          const { DiscoveryEngine } = await import('../assisted-import/DiscoveryEngine.js');
          const disco = new DiscoveryEngine(siteId, liveUrl, dbName);
          const platformInfo = await disco.run();
          
          liveAssets = {
            fonts: platformInfo.fonts || [],
            colors: platformInfo.color_palette || [],
            stylesheets: [],
            scripts: []
          };

          const { downloadAsset } = await import('../mediaService.js');
          
          // Localize Stylesheets
          const remoteStylesheets = platformInfo.stylesheets?.filter(s => s.recommend).map(s => s.url) || [];
          for (const remoteUrl of remoteStylesheets) {
            try {
              const localUrl = await downloadAsset(remoteUrl);
              liveAssets.stylesheets.push(localUrl);
            } catch (err) { console.error('CSS Download Fail:', remoteUrl); }
          }

          // Localize Scripts (for UI interactions)
          const remoteScripts = platformInfo.scripts?.filter(s => s.recommend).map(s => s.url) || [];
          for (const remoteUrl of remoteScripts) {
            try {
              const localUrl = await downloadAsset(remoteUrl);
              liveAssets.scripts.push(localUrl);
            } catch (err) { console.error('JS Download Fail:', remoteUrl); }
          }

          // Basic crawl of primary pages to match them later
          const { CrawlEngine } = await import('../assisted-import/CrawlEngine.js');
          const crawler = new CrawlEngine(siteId, liveUrl, dbName);
          await crawler.run(); // This populates staged_items with rendered HTML
        }

        // 2. Clone & Scan Git Repo
        await LovableImporterService.updateStatus(siteId, 'cloning', `Cloning repository: ${repoUrl}`);
        await repo.clone();

        if (jobRegistry.isCancelled(siteId)) throw new Error('IMPORT_CANCELLED');
        await LovableImporterService.updateStatus(siteId, 'deploying_assets', 'Sideloading repository assets...');
        
        // Sideload assets programmatically
        const tenantUploadsDir = getTenantUploadsDir();
        const deployedAssets = await repo.deployAssets(tenantUploadsDir);
        
        // Register assets in media library for visibility
        for (const asset of deployedAssets) {
          const ext = asset.relPath.split('.').pop().toLowerCase();
          if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'mp4', 'webm', 'woff', 'woff2', 'ttf', 'otf'].includes(ext)) {
            let mimeType = 'application/octet-stream';
            if (['jpg', 'jpeg'].includes(ext)) mimeType = 'image/jpeg';
            else if (ext === 'png') mimeType = 'image/png';
            else if (ext === 'svg') mimeType = 'image/svg+xml';
            else if (ext === 'webp') mimeType = 'image/webp';
            else if (ext === 'mp4') mimeType = 'video/mp4';

            await registerMediaFile(
              asset.relPath, 
              asset.name, 
              mimeType, 
              asset.size
            );
          }
        }

        await LovableImporterService.updateStatus(siteId, 'analyzing', 'Scanning source files...');
        
        const files = await repo.scan();
        const globalStyles = await repo.getGlobalStyles();
        
        // Detect Tailwind and extract config
        const usesTailwind = await repo.detectTailwind();
        let tailwindConfig = null;
        if (usesTailwind) {
          tailwindConfig = await repo.getTailwindConfig();
          info(dbName, 'LOVABLE_TAILWIND_STATUS', `Tailwind detected, config: ${tailwindConfig ? 'found' : 'default'}`);
        }
        
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
        const ruleGen = new LovableRuleGenerator(siteId, dbName, liveUrl);
        const ruleset = await ruleGen.run();
        
        // Add global styles and assets to ruleset
        ruleset.theme = ruleset.theme || {};
        ruleset.theme.styles = globalStyles;
        ruleset.theme.tailwind = usesTailwind;
        ruleset.theme.tailwind_config = tailwindConfig;
        if (liveAssets) {
          ruleset.theme.live_assets = liveAssets;
        }
        
        await prisma.imported_sites.update({
          where: { id: siteId },
          data: { llm_ruleset: ruleset }
        });

        // 3. Template Generation (Source to Nunjucks)
        if (jobRegistry.isCancelled(siteId)) throw new Error('IMPORT_CANCELLED');
        await LovableImporterService.updateStatus(siteId, 'generating_templates', 'Converting components to Nunjucks templates...');
        const templateGen = new LovableTemplateGenerator(siteId, dbName);
        await templateGen.run();

        // 4. CMS Ingestion (Requirement 3: Explicit Prisma Creation)
        if (jobRegistry.isCancelled(siteId)) throw new Error('IMPORT_CANCELLED');
        await LovableImporterService.updateStatus(siteId, 'transforming', 'Ingesting content into WolfWave database...');
        const transformer = new LovableTransformer(siteId, dbName);
        await transformer.run();
        
        info(dbName, 'LOVABLE_IMPORT_READY', `Industrial import for ${repoUrl} complete`);
        await LovableImporterService.updateStatus(siteId, 'completed', 'Source imported, templates generated, and pages created!');

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
