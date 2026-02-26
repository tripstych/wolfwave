import { query } from '../db/connection.js';
import { error as logError } from '../lib/logger.js';

/**
 * Serves CSS content from the database.
 * Supports:
 * - /styles/custom.css -> global_custom_css setting
 * - /styles/:filename.css -> template with filename or 'styles/:filename.css'
 */
export async function serveStyle(req, res) {
  try {
    const filename = req.params.filename;
    let css = '';

    if (filename === 'custom.css') {
      const rows = await query(
        'SELECT setting_value FROM settings WHERE setting_key = "global_custom_css"'
      );
      css = rows[0]?.setting_value || '';
    } else {
      // Look in templates table
      const searchNames = [filename, `styles/${filename}`];
      if (!filename.endsWith('.css')) {
        searchNames.push(`${filename}.css`);
        searchNames.push(`styles/${filename}.css`);
      }

      const rows = await query(
        'SELECT content FROM templates WHERE filename IN (?)',
        [searchNames]
      );
      
      if (rows.length > 0) {
        css = rows[0].content;
      } else {
        return res.status(404).send('/* CSS not found */');
      }
    }

    res.setHeader('Content-Type', 'text/css');
    res.send(css);
  } catch (err) {
    logError(req, err, 'STYLE_SERVE');
    res.status(500).send('/* Error serving CSS */');
  }
}
