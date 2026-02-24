import { Router } from 'express';
import { query } from '../db/connection.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { sendTestEmail } from '../services/emailService.js';

const router = Router();

// List all email templates
router.get('/', requireAuth, async (req, res) => {
  try {
    const templates = await query(
      'SELECT id, slug, name, subject, updated_at FROM email_templates ORDER BY name'
    );
    res.json(templates);
  } catch (err) {
    console.error('List email templates error:', err);
    res.status(500).json({ error: 'Failed to list email templates' });
  }
});

// Get single template
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const templates = await query(
      'SELECT * FROM email_templates WHERE id = ?',
      [req.params.id]
    );
    if (!templates[0]) {
      return res.status(404).json({ error: 'Template not found' });
    }
    res.json(templates[0]);
  } catch (err) {
    console.error('Get email template error:', err);
    res.status(500).json({ error: 'Failed to get email template' });
  }
});

// Update template
router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { subject, html_body } = req.body;

    if (!subject || !html_body) {
      return res.status(400).json({ error: 'Subject and body are required' });
    }

    await query(
      'UPDATE email_templates SET subject = ?, html_body = ? WHERE id = ?',
      [subject, html_body, req.params.id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Update email template error:', err);
    res.status(500).json({ error: 'Failed to update email template' });
  }
});

// Send test email
router.post('/test', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { to } = req.body;
    if (!to) {
      return res.status(400).json({ error: 'Recipient email is required' });
    }
    await sendTestEmail(to);
    res.json({ success: true, message: `Test email sent to ${to}` });
  } catch (err) {
    console.error('Send test email error:', err);
    res.status(500).json({ error: err.message || 'Failed to send test email' });
  }
});

export default router;
