import { query } from '../db/connection.js';
import { error as logError } from '../lib/logger.js';

export async function debugPageRoutes(req, res) {
  try {
    const { slug } = req.query;
    
    // Check content table
    const content = await query(
      'SELECT id, module, title, slug FROM content WHERE slug = ?',
      [slug || '/home']
    );
    
    // Check pages table
    const pages = await query(`
      SELECT p.*, c.slug as content_slug 
      FROM pages p 
      LEFT JOIN content c ON p.content_id = c.id 
      WHERE c.slug = ? OR p.content_id = ?
    `, [slug || '/home', slug ? content[0]?.id : null]);
    
    // Check all published pages
    const allPublished = await query(`
      SELECT p.id, p.status, p.content_id, c.slug, c.title, c.module
      FROM pages p
      LEFT JOIN content c ON p.content_id = c.id
      WHERE p.status = 'published'
      ORDER BY c.slug
    `);
    
    // Check content without pages
    const orphanedContent = await query(`
      SELECT c.id, c.module, c.title, c.slug
      FROM content c
      LEFT JOIN pages p ON c.id = p.content_id
      WHERE p.id IS NULL AND c.module = 'pages'
      ORDER BY c.slug
    `);

    res.json({
      query_slug: slug || '/home',
      content_found: content,
      pages_found: pages,
      all_published_pages: allPublished,
      orphaned_content: orphanedContent,
      total_published: allPublished.length
    });
  } catch (err) {
    logError(req, err, 'DEBUG_PAGE_ROUTES');
    res.status(500).json({ error: err.message });
  }
}