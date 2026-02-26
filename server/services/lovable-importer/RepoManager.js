import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { info, error as logError } from '../../lib/logger.js';

const execAsync = promisify(exec);

/**
 * RepoManager handles Git operations for Lovable source-first imports.
 */
export class RepoManager {
  constructor(siteId, repoUrl, dbName) {
    this.siteId = siteId;
    this.repoUrl = repoUrl;
    this.dbName = dbName;
    this.workDir = path.join(process.cwd(), 'tmp', 'imports', `lovable-${siteId}`);
  }

  /**
   * Clone the repository to a temporary directory
   */
  async clone() {
    try {
      info(this.dbName, 'LOVABLE_REPO_CLONE_START', `Cloning ${this.repoUrl} to ${this.workDir}`);
      
      // Ensure tmp dir exists
      await fs.mkdir(path.dirname(this.workDir), { recursive: true });
      
      // Clean existing if necessary
      await this.cleanup();

      // Perform clone (HTTPS or SSH)
      // Note: For private repos, the URL must include token or be SSH with pre-configured keys
      await execAsync(`git clone --depth 1 ${this.repoUrl} "${this.workDir}"`);
      
      info(this.dbName, 'LOVABLE_REPO_CLONE_SUCCESS', `Cloned successfully`);
      return this.workDir;
    } catch (err) {
      logError(this.dbName, err, 'LOVABLE_REPO_CLONE_FAILED');
      throw new Error(`Failed to clone repository: ${err.message}`);
    }
  }

  /**
   * Copy assets from the repo to the tenant's uploads directory
   */
  async deployAssets(targetBaseDir) {
    const publicDir = path.join(this.workDir, 'public');
    const srcAssetsDir = path.join(this.workDir, 'src', 'assets');
    const deployed = [];

    // 1. Copy Public folder (root of the web server in Lovable)
    try {
      const stats = await fs.stat(publicDir).catch(() => null);
      if (stats && stats.isDirectory()) {
        info(this.dbName, 'LOVABLE_REPO_DEPLOY', 'Deploying /public assets...');
        const files = await this.copyDir(publicDir, targetBaseDir);
        deployed.push(...files.map(f => ({ ...f, relPath: f.relPath })));
      }
    } catch (err) {
      logError(this.dbName, err, 'LOVABLE_DEPLOY_PUBLIC_FAILED');
    }

    // 2. Copy src/assets folder
    try {
      const stats = await fs.stat(srcAssetsDir).catch(() => null);
      if (stats && stats.isDirectory()) {
        info(this.dbName, 'LOVABLE_REPO_DEPLOY', 'Deploying /src/assets...');
        const dest = path.join(targetBaseDir, 'assets');
        await fs.mkdir(dest, { recursive: true });
        const files = await this.copyDir(srcAssetsDir, dest, 'assets/');
        deployed.push(...files);
      }
    } catch (err) {
      logError(this.dbName, err, 'LOVABLE_DEPLOY_SRC_ASSETS_FAILED');
    }

    return deployed;
  }

  /**
   * Helper to recursively copy directories
   */
  async copyDir(src, dest, prefix = '') {
    const files = [];
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      const relPath = prefix + entry.name;

      if (entry.isDirectory()) {
        const nested = await this.copyDir(srcPath, destPath, relPath + '/');
        files.push(...nested);
      } else {
        await fs.copyFile(srcPath, destPath);
        const stats = await fs.stat(srcPath);
        files.push({
          name: entry.name,
          relPath: '/' + relPath,
          size: stats.size
        });
      }
    }
    return files;
  }

  /**
   * Recursively scan the repo for relevant source files (.tsx, .jsx, .json)
   */
  async scan() {
    const files = [];
    
    async function traverse(dir) {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (['node_modules', '.git', 'dist', 'build'].includes(entry.name)) continue;
          await traverse(fullPath);
        } else if (entry.isFile()) {
          if (entry.name.match(/\.(tsx|jsx|js|json|css|html)$/i)) {
            files.push(fullPath);
          }
        }
      }
    }

    await traverse(this.workDir);
    return files;
  }

  /**
   * Read a file from the repository
   */
  async readFile(relativePath) {
    const fullPath = path.join(this.workDir, relativePath);
    return await fs.readFile(fullPath, 'utf8');
  }

  /**
   * Find and read global CSS files (index.css, App.css, globals.css)
   */
  async getGlobalStyles() {
    const candidates = [
      'src/index.css',
      'src/App.css',
      'src/globals.css',
      'src/style.css',
      'index.css',
      'App.css'
    ];
    
    let styles = '';
    for (const relPath of candidates) {
      try {
        const content = await this.readFile(relPath);
        styles += `\n/* From ${relPath} */\n${content}`;
      } catch (e) {
        // Skip missing candidates
      }
    }
    return styles;
  }

  /**
   * Clean up the temporary directory
   */
  async cleanup() {
    try {
      await fs.rm(this.workDir, { recursive: true, force: true });
    } catch (err) {
      // Non-fatal
    }
  }

  /**
   * Get relative path from absolute path
   */
  getRelativePath(absolutePath) {
    return path.relative(this.workDir, absolutePath).replace(/\\/g, '/');
  }
}
