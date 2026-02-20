import { Router } from 'express';
import { query } from '../db/connection.js';
import { requireCustomer } from '../api/customer-auth.js';
import crypto from 'crypto';

const router = Router();

// Generate secure download link
function generateDownloadToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Get customer's digital downloads
router.get('/my-downloads', requireCustomer, async (req, res) => {
  try {
    const downloads = await query(`
      SELECT dd.*, p.title as product_title, p.sku, o.created_at as order_date
      FROM digital_downloads dd
      JOIN products p ON dd.product_id = p.id
      JOIN orders o ON dd.order_id = o.id
      WHERE dd.customer_id = ? AND dd.expires_at > NOW() AND dd.download_count < dd.download_limit
      ORDER BY dd.created_at DESC
    `, [req.user.id]);

    res.json(downloads);
  } catch (err) {
    console.error('Get downloads error:', err);
    res.status(500).json({ error: 'Failed to get downloads' });
  }
});

// Create digital download record (called when order is completed)
router.post('/create-download', async (req, res) => {
  try {
    const { order_id, product_id, customer_id, download_url, download_limit, expiry_days } = req.body;

    // Check if product is digital
    const product = await query('SELECT is_digital FROM products WHERE id = ?', [product_id]);
    if (!product[0] || !product[0].is_digital) {
      return res.status(400).json({ error: 'Product is not digital' });
    }

    // Create download record
    const expires_at = new Date();
    expires_at.setDate(expires_at.getDate() + expiry_days);

    await query(`
      INSERT INTO digital_downloads (order_id, product_id, customer_id, download_url, download_limit, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [order_id, product_id, customer_id, download_url, download_limit, expires_at]);

    res.json({ success: true });
  } catch (err) {
    console.error('Create download error:', err);
    res.status(500).json({ error: 'Failed to create download' });
  }
});

// Download file
router.get('/download/:download_id/:token', async (req, res) => {
  try {
    const { download_id, token } = req.params;

    // Verify download exists and is valid
    const download = await query(`
      SELECT dd.*, p.title as product_title
      FROM digital_downloads dd
      JOIN products p ON dd.product_id = p.id
      WHERE dd.id = ? AND dd.expires_at > NOW() AND dd.download_count < dd.download_limit
    `, [download_id]);

    if (!download[0]) {
      return res.status(404).json({ error: 'Download not found or expired' });
    }

    // Increment download count
    await query('UPDATE digital_downloads SET download_count = download_count + 1 WHERE id = ?', [download_id]);

    // Redirect to download URL
    res.redirect(download[0].download_url);
  } catch (err) {
    console.error('Download error:', err);
    res.status(500).json({ error: 'Failed to download' });
  }
});

export default router;
