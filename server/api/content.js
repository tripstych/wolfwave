import { Router } from 'express';
import { query } from '../db/connection.js';
import { requireAuth, requireEditor } from '../middleware/auth.js';
import prisma from '../lib/prisma.js';
import { updateContent } from '../services/contentService.js';

const router = Router();

/**
 * Get history for a content record
 */
router.get('/:id/history', requireAuth, async (req, res) => {
  try {
    const contentId = parseInt(req.params.id);
    const history = await prisma.content_history.findMany({
      where: { content_id: contentId },
      orderBy: { created_at: 'desc' }
    });
    res.json(history);
  } catch (err) {
    console.error('Fetch history error:', err);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

/**
 * Restore a version from history
 */
router.post('/history/:historyId/restore', requireAuth, requireEditor, async (req, res) => {
  try {
    const historyId = parseInt(req.params.historyId);
    
    // 1. Get history record
    const version = await prisma.content_history.findUnique({
      where: { id: historyId }
    });

    if (!version) return res.status(404).json({ error: 'Version not found' });

    // 2. Perform restoration using our versioning-aware service
    // This will save the CURRENT state to history before restoring this one.
    const restored = await updateContent(version.content_id, {
      data: version.data,
      title: version.title,
      slug: version.slug
    });

    res.json({ success: true, restored });
  } catch (err) {
    console.error('Restore version error:', err);
    res.status(500).json({ error: 'Failed to restore version' });
  }
});

/**
 * Autocomplete for slugs
 * GET /api/content/slugs?q=searchterm
 */
router.get('/slugs', requireAuth, async (req, res) => {
  try {
    const q = req.query.q || '';
    
    // Search in content table for slugs matching the query
    // We primarily want products and pages for discounts
    const rows = await query(
      `SELECT slug, title, module 
       FROM content 
       WHERE (slug LIKE ? OR title LIKE ?)
       AND module IN ('products', 'pages')
       LIMIT 10`,
      [`%${q}%`, `%${q}%`]
    );
    
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch slugs' });
  }
});

export default router;
