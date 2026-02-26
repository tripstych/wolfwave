import { query } from '../db/connection.js';
import { error as logError } from '../lib/logger.js';

/**
 * Serves CSS content from the database stylesheets table.
 * Supports:
 * - /styles/custom.css -> global_custom_css setting
 * - /styles/:filename.css -> stylesheet from stylesheets table
 */
export async function serveStyle(req, res) {
  try {
    const { site } = res.locals;
    const filename = req.params.filename;
    let css = '';

    if (filename === 'custom.css') {
      // Global custom CSS from settings
      const rows = await query(
        'SELECT setting_value FROM settings WHERE setting_key = "global_custom_css"'
      );
      css = rows[0]?.setting_value || '';
    } else {
      // Look in stylesheets table
      // Try site-specific first, then fall back to global (site_id = NULL)
      const rows = await query(
        `SELECT content FROM stylesheets 
         WHERE filename = ? 
         AND (site_id = ? OR site_id IS NULL)
         AND is_active = true
         ORDER BY site_id DESC, load_order ASC
         LIMIT 1`,
        [filename, site?.id || null]
      );
      
      if (rows.length > 0) {
        css = rows[0].content;
      } else {
        return res.status(404).send('/* Stylesheet not found: ' + filename + ' */');
      }
    }

    // Set proper cache headers for CSS
    res.setHeader('Content-Type', 'text/css; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
    res.send(css);
  } catch (err) {
    logError(req, err, 'STYLE_SERVE');
    res.status(500).send('/* Error serving CSS */');
  }
}
