import axios from 'axios';
import * as cheerio from 'cheerio';
import { analyzeSiteAssets, analyzeSiteImport } from '../aiService.js';
import { info, error as logError } from '../../lib/logger.js';
import prisma from '../../lib/prisma.js';
import { AssistedImportService } from './AssistedImportService.js';

/**
 * DiscoveryEngine is responsible for the initial analysis of a site.
 * It identifies the platform and generates the first set of extraction rules.
 */
export class DiscoveryEngine {
  constructor(siteId, rootUrl, dbName) {
    this.siteId = siteId;
    this.rootUrl = rootUrl;
    this.dbName = dbName;
  }

  async run() {
    try {
      info(this.dbName, 'ASSISTED_IMPORT_DISCOVERY_START', `Analyzing ${this.rootUrl}`);

      const { data: html } = await axios.get(this.rootUrl, {
        headers: { 'User-Agent': 'WebWolf-AssistedImport/1.0' },
        timeout: 15000
      });

      // 1. Analyze Assets & Platform
      const assetAnalysis = await analyzeSiteAssets(html, this.rootUrl);
      info(this.dbName, 'ASSISTED_IMPORT_PLATFORM_DETECTED', `Platform: ${assetAnalysis.platform}`);
      await AssistedImportService.updateStatus(this.siteId, 'analyzing', `Detected ${assetAnalysis.platform} platform. Analyzing structure...`);

      // 2. Initial Content Structure Analysis
      const contentAnalysis = await analyzeSiteImport(html, this.rootUrl);
      await AssistedImportService.updateStatus(this.siteId, 'analyzing', `Found ${contentAnalysis.page_type} structure on homepage.`);
      
      // Convert regions to selector_map for initial extraction_rules
      const homepageSelectors = {};
      (contentAnalysis.regions || []).forEach(r => {
        homepageSelectors[r.key] = {
          selector: r.selector,
          attr: r.attr,
          multiple: r.multiple,
          type: r.type
        };
      });

      const ruleset = {
        root_url: this.rootUrl,
        platform: assetAnalysis.platform,
        theme: {
          name: assetAnalysis.theme_name,
          fonts: assetAnalysis.fonts,
          colors: assetAnalysis.color_palette,
          assets: {
            stylesheets: assetAnalysis.stylesheets,
            scripts: assetAnalysis.scripts
          }
        },
        extraction_rules: {
          homepage: homepageSelectors,
          // Placeholder for dynamic type rules
          types: {} 
        },
        discovery_info: assetAnalysis.summary
      };

      await prisma.imported_sites.update({
        where: { id: this.siteId },
        data: {
          platform_info: assetAnalysis,
          llm_ruleset: ruleset,
          status: 'analyzed'
        }
      });

      return ruleset;
    } catch (err) {
      logError(this.dbName, err, 'ASSISTED_IMPORT_DISCOVERY_FAILED');
      throw err;
    }
  }
}
