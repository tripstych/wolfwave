import { Router } from 'express';
import { query } from '../db/connection.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { scanTemplates, scanBlockTemplates, syncTemplatesToDb, saveCurrentAsTheme, parseTemplate } from '../services/templateParser.js';
import prisma from '../lib/prisma.js';
import { error as logError } from '../lib/logger.js';

const router = Router();

/**
 * List all templates with pagination
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const { content_type, limit = 50, offset = 0 } = req.query;

    const pageLimit = Math.max(1, Math.min(500, parseInt(limit) || 50));
    const pageOffset = Math.max(0, parseInt(offset) || 0);

    const where = {};
    if (content_type) where.content_type = content_type;

    const templates = await prisma.templates.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take: pageLimit,
      skip: pageOffset
    });

    const total = await prisma.templates.count({ where });

    res.json({
      data: templates,
      pagination: { total, limit: pageLimit, offset: pageOffset }
    });
  } catch (err) {
    console.error('List templates error:', err);
    res.status(500).json({ error: 'Failed to list templates' });
  }
});

/**
 * Get template by ID
 */
router.get('/id/:id', requireAuth, async (req, res) => {
  try {
    const template = await prisma.templates.findUnique({
      where: { id: parseInt(req.params.id) }
    });

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json(template);
  } catch (err) {
    console.error('Get template error:', err);
    res.status(500).json({ error: 'Failed to get template' });
  }
});

/**
 * Get templates by content type
 */
router.get('/content_type/:contentType', requireAuth, async (req, res) => {
  try {
    const { contentType } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const pageLimit = Math.max(1, Math.min(500, parseInt(limit) || 50));
    const pageOffset = Math.max(0, parseInt(offset) || 0);

    const where = { content_type: contentType };

    const templates = await prisma.templates.findMany({
      where,
      take: pageLimit,
      skip: pageOffset
    });

    const total = await prisma.templates.count({ where });

    res.json({
      data: templates,
      pagination: { total, limit: pageLimit, offset: pageOffset }
    });
  } catch (err) {
    console.error('Get templates by type error:', err);
    res.status(500).json({ error: 'Failed to get templates' });
  }
});

/**
 * Get block templates
 */
router.get('/content_type/blocks/list', requireAuth, async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;

    const pageLimit = Math.max(1, Math.min(500, parseInt(limit) || 50));
    const pageOffset = Math.max(0, parseInt(offset) || 0);

    const templates = await prisma.templates.findMany({
      where: { content_type: 'blocks' },
      take: pageLimit,
      skip: pageOffset
    });

    const total = await prisma.templates.count({
      where: { content_type: 'blocks' }
    });

    res.json({
      data: templates,
      pagination: { total, limit: pageLimit, offset: pageOffset }
    });
  } catch (err) {
    console.error('List block templates error:', err);
    res.status(500).json({ error: 'Failed to list block templates' });
  }
});

/**
 * Sync templates from filesystem
 * Query param ?mode=overwrite (default) or ?mode=merge
 *   overwrite: replaces all DB templates with filesystem versions, deletes stale
 *   merge: only inserts templates that don't already exist in DB
 */
router.post('/sync', requireAuth, requireAdmin, async (req, res) => {
  try {
    const mode = req.query.mode || req.body.mode || 'overwrite';
    if (!['overwrite', 'merge'].includes(mode)) {
      return res.status(400).json({ error: 'mode must be "overwrite" or "merge"' });
    }
    const result = await syncTemplatesToDb(prisma, { mode });
    res.json({
      success: true,
      message: `Synced ${result.templates.length} templates (mode: ${mode})`,
      created: result.created,
      updated: result.updated,
      skipped: result.skipped,
      mode: result.mode
    });
  } catch (err) {
    console.error('Sync templates error:', err);
    res.status(500).json({ error: 'Failed to sync templates' });
  }
});

/**
 * Save current templates as a named theme
 */
router.post('/save-as-theme', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Theme name is required' });
    }
    const result = await saveCurrentAsTheme(prisma, { name, description });
    res.json({
      success: true,
      message: `Saved ${result.copied} templates as theme "${result.name}"`,
      theme: { slug: result.slug, name: result.name },
      copied: result.copied
    });
  } catch (err) {
    console.error('Save as theme error:', err);
    res.status(500).json({ error: 'Failed to save as theme' });
  }
});

/**
 * Reload templates cache
 */
router.post('/reload', requireAuth, requireAdmin, (req, res) => {
  try {
    const nunjucksEnv = req.app.locals.nunjucksEnv;
    if (!nunjucksEnv) {
      return res.status(500).json({ error: 'Nunjucks environment not found' });
    }

    // Clear the Nunjucks cache by resetting the loader cache
    if (nunjucksEnv.loaders && nunjucksEnv.loaders[0]) {
      const loader = nunjucksEnv.loaders[0];
      if (loader.cache) {
        loader.cache = {};
      }
    }

    if (typeof nunjucksEnv.reset === 'function') {
      nunjucksEnv.reset();
    }

    console.log('Templates cache cleared');

    res.json({
      success: true,
      message: 'Templates reloaded successfully'
    });
  } catch (err) {
    console.error('Reload templates error:', err);
    res.status(500).json({ error: `Failed to reload templates: ${err.message}` });
  }
});

/**
 * Scan filesystem for templates
 */
router.get('/scan/filesystem', requireAuth, async (req, res) => {
  try {
    const templates = await scanTemplates();
    res.json(templates);
  } catch (err) {
    console.error('Scan templates error:', err);
    res.status(500).json({ error: 'Failed to scan templates' });
  }
});

/**
 * Parse a specific template file
 */
router.get('/parse/:filename(*)', requireAuth, async (req, res) => {
  try {
    const regions = await parseTemplate(req.params.filename);
    res.json({ filename: req.params.filename, regions });
  } catch (err) {
    console.error('Parse template error:', err);
    res.status(500).json({ error: 'Failed to parse template' });
  }
});

/**
 * Update template metadata
 */
router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, description, regions, default_content, options } = req.body;
    const templateId = parseInt(req.params.id);

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (regions !== undefined) updateData.regions = regions;
    if (default_content !== undefined) updateData.default_content = default_content;
    if (options !== undefined) updateData.options = options;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const template = await prisma.templates.update({
      where: { id: templateId },
      data: updateData
    });

    res.json({ success: true, template });
  } catch (err) {
    logError(req, err, 'TEMPLATE_UPDATE');
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Template not found' });
    }
    console.error('Update template error:', err);
    res.status(500).json({ error: 'Failed to update template' });
  }
});

/**
 * Delete template (with usage checks)
 */
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const templateId = parseInt(req.params.id);

    // Check if template is in use
    const pageCount = await prisma.pages.count({
      where: { template_id: templateId }
    });

    const blockCount = await prisma.blocks.count({
      where: { template_id: templateId }
    });

    if (pageCount > 0 || blockCount > 0) {
      return res.status(400).json({
        error: 'Cannot delete template that is in use',
        pageCount,
        blockCount
      });
    }

    // Delete template
    await prisma.templates.delete({
      where: { id: templateId }
    });

    res.json({ success: true });
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Template not found' });
    }
    console.error('Delete template error:', err);
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

export default router;
