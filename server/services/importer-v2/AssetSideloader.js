import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import prisma from '../../lib/prisma.js';
import { info, error as logError } from '../../lib/logger.js';
import { ImporterServiceV2 } from './ImporterServiceV2.js';

/**
 * AssetSideloader downloads CSS and JS files identified during discovery
 * and saves them to the local template directory for the import.
 */
export class AssetSideloader {
  constructor(siteId, dbName) {
    this.siteId = siteId;
    this.dbName = dbName;
  }

  async run() {
    try {
      info(this.dbName, 'IMPORT_V2_ASSETS_START', `Sideloading assets for site ${this.siteId}`);

      const site = await prisma.imported_sites.findUnique({
        where: { id: this.siteId }
      });

      if (!site || !site.llm_ruleset) {
        info(this.dbName, 'IMPORT_V2_ASSETS_SKIP', 'No ruleset found, skipping asset sideloading');
        return;
      }
      const ruleset = site.llm_ruleset;
      const rootUrl = ruleset.root_url || site.root_url;
      const theme = ruleset.theme;
      if (!theme) {
        info(this.dbName, 'IMPORT_V2_ASSETS_SKIP', 'No theme info in ruleset, skipping asset sideloading');
        return;
      }
      const assets = theme.assets || {};

      const baseDir = path.join(process.cwd(), 'templates', 'imported', String(this.siteId), 'assets');
      await fs.mkdir(baseDir, { recursive: true });

      const localAssets = {
        stylesheets: [],
        scripts: []
      };

      // 1. Process Stylesheets
      if (assets.stylesheets) {
        for (const css of assets.stylesheets) {
          if (!css.recommend) continue;
          
          const localPath = await this.downloadAsset(css.url, rootUrl, baseDir, 'css');
          if (localPath) {
            localAssets.stylesheets.push({
              ...css,
              local_url: `/imported/${this.siteId}/assets/${localPath}`,
              original_url: css.url
            });
          }
        }
      }

      // 2. Process Scripts
      if (assets.scripts) {
        for (const js of assets.scripts) {
          if (!js.recommend) continue;

          const localPath = await this.downloadAsset(js.url, rootUrl, baseDir, 'js');
          if (localPath) {
            localAssets.scripts.push({
              ...js,
              local_url: `/imported/${this.siteId}/assets/${localPath}`,
              original_url: js.url
            });
          }
        }
      }

      // Update ruleset with local asset info
      ruleset.theme.local_assets = localAssets;

      await prisma.imported_sites.update({
        where: { id: this.siteId },
        data: { llm_ruleset: ruleset }
      });

      info(this.dbName, 'IMPORT_V2_ASSETS_COMPLETE', `Sideloaded ${localAssets.stylesheets.length} CSS and ${localAssets.scripts.length} JS files`);
      await ImporterServiceV2.updateStatus(this.siteId, 'assets_loaded', 'Theme assets sideloaded successfully.');

    } catch (err) {
      logError(this.dbName, err, 'IMPORT_V2_ASSETS_FAILED');
      throw err;
    }
  }

  async downloadAsset(url, rootUrl, baseDir, type) {
    try {
      let absoluteUrl = url;
      if (url.startsWith('//')) {
        absoluteUrl = 'https:' + url;
      } else if (url.startsWith('/')) {
        const origin = new URL(rootUrl).origin;
        absoluteUrl = origin + url;
      } else if (!url.startsWith('http')) {
        const origin = new URL(rootUrl).origin;
        absoluteUrl = origin + '/' + url;
      }

      const filename = path.basename(new URL(absoluteUrl).pathname) || `asset-${Date.now()}.${type}`;
      const destPath = path.join(baseDir, filename);

      info(this.dbName, 'IMPORT_V2_ASSET_DL', `Downloading ${absoluteUrl}`);

      const response = await axios.get(absoluteUrl, {
        timeout: 10000,
        responseType: 'arraybuffer',
        headers: { 'User-Agent': 'WebWolf-Importer-V2/1.0' }
      });

      await fs.writeFile(destPath, response.data);
      return filename;
    } catch (err) {
      console.error(`Failed to download asset ${url}:`, err.message);
      return null;
    }
  }
}
