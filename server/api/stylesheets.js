import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { query } from '../db/connection.js';
import { error as logError, info } from '../lib/logger.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMPLATES_DIR = path.join(__dirname, '../../templates');

const router = Router();

/**
 * Get all stylesheets
 */
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { site } = res.locals;
    const { type, active_only } = req.query;

    let sql = 'SELECT * FROM stylesheets WHERE (site_id = ? OR site_id IS NULL)';
    const params = [site?.id || null];

    if (type) {
      sql += ' AND type = ?';
      params.push(type);
    }

    if (active_only === 'true') {
      sql += ' AND is_active = true';
    }

    sql += ' ORDER BY load_order ASC, filename ASC';

    const stylesheets = await query(sql, params);

    res.json({ stylesheets });
  } catch (err) {
    logError(req, err, 'Failed to get stylesheets');
    res.status(500).json({ error: err.message });
  }
});

/**
 * Get a single stylesheet
 */
router.get('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { site } = res.locals;

    const rows = await query(
      'SELECT * FROM stylesheets WHERE id = ? AND (site_id = ? OR site_id IS NULL)',
      [id, site?.id || null]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Stylesheet not found' });
    }

    res.json({ stylesheet: rows[0] });
  } catch (err) {
    logError(req, err, 'Failed to get stylesheet');
    res.status(500).json({ error: err.message });
  }
});

/**
 * Create a new stylesheet
 */
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { site, user } = res.locals;
    const { filename, content, description, type, is_active, load_order, source_file } = req.body;

    if (!filename || !content) {
      return res.status(400).json({ error: 'filename and content are required' });
    }

    // Ensure .css extension
    const cssFilename = filename.endsWith('.css') ? filename : `${filename}.css`;

    const result = await query(
      `INSERT INTO stylesheets 
       (site_id, filename, content, description, type, is_active, load_order, source_file, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        site?.id || null,
        cssFilename,
        content,
        description || null,
        type || 'template',
        is_active !== false,
        load_order || 100,
        source_file || null,
        user?.id || null,
        user?.id || null
      ]
    );

    info(req, `Stylesheet created: ${cssFilename}`);

    res.json({
      success: true,
      stylesheet: {
        id: result.insertId,
        filename: cssFilename
      }
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Stylesheet with this filename already exists' });
    }
    logError(req, err, 'Failed to create stylesheet');
    res.status(500).json({ error: err.message });
  }
});

/**
 * Update a stylesheet
 */
router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { site, user } = res.locals;
    const { content, description, type, is_active, load_order, minified } = req.body;

    const updates = [];
    const params = [];

    if (content !== undefined) {
      updates.push('content = ?');
      params.push(content);
    }
    if (description !== undefined) {
      updates.push('description = ?');
      params.push(description);
    }
    if (type !== undefined) {
      updates.push('type = ?');
      params.push(type);
    }
    if (is_active !== undefined) {
      updates.push('is_active = ?');
      params.push(is_active);
    }
    if (load_order !== undefined) {
      updates.push('load_order = ?');
      params.push(load_order);
    }
    if (minified !== undefined) {
      updates.push('minified = ?');
      params.push(minified);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push('updated_by = ?');
    params.push(user?.id || null);

    params.push(id);
    params.push(site?.id || null);

    const result = await query(
      `UPDATE stylesheets SET ${updates.join(', ')} 
       WHERE id = ? AND (site_id = ? OR site_id IS NULL)`,
      params
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Stylesheet not found' });
    }

    info(req, `Stylesheet updated: ${id}`);

    res.json({ success: true });
  } catch (err) {
    logError(req, err, 'Failed to update stylesheet');
    res.status(500).json({ error: err.message });
  }
});

/**
 * Delete a stylesheet
 */
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { site } = res.locals;

    const result = await query(
      'DELETE FROM stylesheets WHERE id = ? AND (site_id = ? OR site_id IS NULL)',
      [id, site?.id || null]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Stylesheet not found' });
    }

    info(req, `Stylesheet deleted: ${id}`);

    res.json({ success: true });
  } catch (err) {
    logError(req, err, 'Failed to delete stylesheet');
    res.status(500).json({ error: err.message });
  }
});

/**
 * Sync stylesheets from filesystem to database
 */
router.post('/sync-from-filesystem', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { site, user } = res.locals;
    const cssDir = path.join(TEMPLATES_DIR, 'css');

    // Check if directory exists
    try {
      await fs.access(cssDir);
    } catch {
      return res.status(404).json({ error: 'CSS directory not found: templates/css' });
    }

    const files = await fs.readdir(cssDir);
    const cssFiles = files.filter(f => f.endsWith('.css'));

    let synced = 0;
    let errors = [];

    for (const filename of cssFiles) {
      try {
        const filePath = path.join(cssDir, filename);
        const content = await fs.readFile(filePath, 'utf8');
        const sourceFile = `templates/css/${filename}`;

        // Upsert stylesheet
        await query(
          `INSERT INTO stylesheets 
           (site_id, filename, content, description, type, source_file, created_by, updated_by, last_synced_at)
           VALUES (?, ?, ?, ?, 'template', ?, ?, ?, NOW())
           ON DUPLICATE KEY UPDATE 
           content = VALUES(content),
           source_file = VALUES(source_file),
           updated_by = VALUES(updated_by),
           last_synced_at = NOW()`,
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
      } catch (err) {
        errors.push({ filename, error: err.message });
        logError(req, err, `Failed to sync ${filename}`);
      }
    }

    info(req, `Synced ${synced} stylesheets from filesystem`);

    res.json({
      success: true,
      synced,
      total: cssFiles.length,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (err) {
    logError(req, err, 'Failed to sync stylesheets');
    res.status(500).json({ error: err.message });
  }
});

/**
 * Sync a stylesheet back to filesystem
 */
router.post('/:id/sync-to-filesystem', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { site } = res.locals;

    const rows = await query(
      'SELECT * FROM stylesheets WHERE id = ? AND (site_id = ? OR site_id IS NULL)',
      [id, site?.id || null]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Stylesheet not found' });
    }

    const stylesheet = rows[0];

    if (!stylesheet.source_file) {
      return res.status(400).json({ error: 'Stylesheet has no source_file configured' });
    }

    const filePath = path.join(TEMPLATES_DIR, '..', stylesheet.source_file);
    await fs.writeFile(filePath, stylesheet.content, 'utf8');

    info(req, `Synced stylesheet ${stylesheet.filename} to ${stylesheet.source_file}`);

    res.json({ success: true, path: stylesheet.source_file });
  } catch (err) {
    logError(req, err, 'Failed to sync stylesheet to filesystem');
    res.status(500).json({ error: err.message });
  }
});

export default router;
