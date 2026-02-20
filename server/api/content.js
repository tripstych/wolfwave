import { Router } from 'express';
import { query } from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

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
