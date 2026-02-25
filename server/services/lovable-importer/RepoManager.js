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
    return path.relative(this.workDir, absolutePath).replace(/\/g, '/');
  }
}
