import { query } from '../db/connection.js';
import { error as logError, info } from '../lib/logger.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMPLATES_DIR = path.join(__dirname, '../../templates');

/**
 * Fix duplicate stylesheets by consolidating them
 */
export async function fixDuplicateStylesheets(req) {
  try {
    // Find all duplicates
    const duplicates = await query(`
      SELECT filename, site_id, COUNT(*) as count, GROUP_CONCAT(id ORDER BY id) as ids
      FROM stylesheets 
      GROUP BY filename, site_id 
      HAVING count > 1
    `);

    if (duplicates.length === 0) {
      info(req, 'No duplicate stylesheets found');
      return { fixed: 0, duplicates: [] };
    }

    let fixed = 0;
    const fixLog = [];

    for (const duplicate of duplicates) {
      const ids = duplicate.ids.split(',').map(id => parseInt(id));
      const keepId = ids[0]; // Keep the first one
      const deleteIds = ids.slice(1); // Delete the rest

      // Get the content from the stylesheet we're keeping
      const keeper = await query(
        'SELECT * FROM stylesheets WHERE id = ?',
        [keepId]
      );

      if (keeper.length > 0) {
        // Update the keeper with the most recent content if needed
        const latest = await query(
          `SELECT * FROM stylesheets 
           WHERE filename = ? AND site_id = ? 
           ORDER BY updated_at DESC LIMIT 1`,
          [duplicate.filename, duplicate.site_id]
        );

        if (latest.length > 0 && latest[0].id !== keepId) {
          await query(
            `UPDATE stylesheets 
             SET content = ?, updated_by = ?, updated_at = NOW()
             WHERE id = ?`,
            [latest[0].content, latest[0].updated_by, keepId]
          );
        }

        // Delete the duplicates
        for (const deleteId of deleteIds) {
          await query('DELETE FROM stylesheets WHERE id = ?', [deleteId]);
        }

        fixed += deleteIds.length;
        fixLog.push({
          filename: duplicate.filename,
          site_id: duplicate.site_id,
          kept_id: keepId,
          deleted_ids: deleteIds
        });

        info(req, `Fixed duplicates for ${duplicate.filename}: kept ${keepId}, deleted ${deleteIds.join(', ')}`);
      }
    }

    return { fixed, duplicates: fixLog };
  } catch (err) {
    logError(req, err, 'Failed to fix duplicate stylesheets');
    throw err;
  }
}

/**
 * Improved sync from filesystem that handles duplicates properly
 */
export async function syncStylesheetsFromFilesystem(req, site, user) {
  try {
    const cssDir = path.join(TEMPLATES_DIR, 'css');

    // Check if directory exists
    try {
      await fs.access(cssDir);
    } catch {
      throw new Error('CSS directory not found: templates/css');
    }

    const files = await fs.readdir(cssDir);
    const cssFiles = files.filter(f => f.endsWith('.css'));

    let synced = 0;
    let updated = 0;
    let errors = [];

    for (const filename of cssFiles) {
      try {
        const filePath = path.join(cssDir, filename);
        const content = await fs.readFile(filePath, 'utf8');
        const sourceFile = `templates/css/${filename}`;

        // First, try to find existing stylesheet
        const existing = await query(
          `SELECT id FROM stylesheets 
           WHERE filename = ? AND (site_id = ? OR site_id IS NULL)
           ORDER BY site_id DESC, id ASC
           LIMIT 1`,
          [filename, site?.id || null]
        );

        if (existing.length > 0) {
          // Update existing
          await query(
            `UPDATE stylesheets 
             SET content = ?, source_file = ?, updated_by = ?, last_synced_at = NOW()
             WHERE id = ?`,
            [content, sourceFile, user?.id || null, existing[0].id]
          );
          updated++;
        } else {
          // Insert new
          await query(
            `INSERT INTO stylesheets 
             (site_id, filename, content, description, type, source_file, created_by, updated_by, last_synced_at)
             VALUES (?, ?, ?, ?, 'template', ?, ?, ?, NOW())`,
            [
              site?.id || null,
              filename,
              content,
              `Synced from ${sourceFile}`,
              sourceFile,
              user?.id || null,
              user?.id || null
            ]
          );
          synced++;
        }
      } catch (err) {
        errors.push({ filename, error: err.message });
        logError(req, err, `Failed to sync ${filename}`);
      }
    }

    info(req, `Sync completed: ${synced} new, ${updated} updated, ${cssFiles.length} total`);

    return {
      success: true,
      synced,
      updated,
      total: cssFiles.length,
      errors: errors.length > 0 ? errors : undefined
    };
  } catch (err) {
    logError(req, err, 'Failed to sync stylesheets');
    throw err;
  }
}
