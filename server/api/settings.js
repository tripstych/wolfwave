import { Router } from 'express';
import { query } from '../db/connection.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { logInfo, logError } from '../lib/logger.js';
import axios from 'axios';

const router = Router();

/**
 * Auto-register Stripe webhook endpoint when stripe_secret_key is saved.
 * Creates or updates the webhook so Stripe sends subscription events to us.
 */
async function ensureStripeWebhook(req, stripeSecretKey) {
  const log = (msg) => logInfo(req, 'stripe-setup', msg);
  const logErr = (msg) => logError(req, new Error(msg), 'stripe-setup');

  // Get site URL to build webhook endpoint
  const rows = await query(
    "SELECT setting_value FROM settings WHERE setting_key = 'site_url'"
  );
  const siteUrl = rows[0]?.setting_value;
  if (!siteUrl || siteUrl.includes('localhost')) {
    logErr(`ABORTED — site_url is "${siteUrl || 'NOT SET'}". Must be a real domain, not localhost.`);
    return null;
  }
  const webhookUrl = `${siteUrl}/api/webhooks/stripe`;
  log(`Webhook URL: ${webhookUrl}`);
  const enabledEvents = [
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted',
    'invoice.payment_failed',
    'payment_intent.succeeded',
    'payment_intent.payment_failed',
    'charge.refunded'
  ];

  const headers = {
    'Authorization': `Bearer ${stripeSecretKey}`,
    'Content-Type': 'application/x-www-form-urlencoded'
  };

  try {
    // Check if we already have a webhook endpoint stored
    const existingRows = await query(
      "SELECT setting_value FROM settings WHERE setting_key = 'stripe_webhook_id'"
    );
    const existingWebhookId = existingRows[0]?.setting_value;
    log(`Existing webhook ID: ${existingWebhookId || 'NONE'}`);

    // Build form data for events
    const eventParams = enabledEvents.map((e, i) => `enabled_events[${i}]=${encodeURIComponent(e)}`).join('&');

    if (existingWebhookId) {
      // Update existing webhook
      try {
        await axios.post(
          `https://api.stripe.com/v1/webhook_endpoints/${existingWebhookId}`,
          `url=${encodeURIComponent(webhookUrl)}&${eventParams}`,
          { headers }
        );
        return existingWebhookId;
      } catch (err) {
        // Webhook was deleted on Stripe's side, create a new one
        if (err.response?.status === 404) {
          await query("DELETE FROM settings WHERE setting_key = 'stripe_webhook_id'");
          await query("DELETE FROM settings WHERE setting_key = 'stripe_webhook_secret'");
        } else {
          throw err;
        }
      }
    }

    // Create new webhook endpoint
    const response = await axios.post(
      'https://api.stripe.com/v1/webhook_endpoints',
      `url=${encodeURIComponent(webhookUrl)}&${eventParams}`,
      { headers }
    );

    const webhook = response.data;

    // Save webhook ID and secret
    await query(
      `INSERT INTO settings (setting_key, setting_value) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      ['stripe_webhook_id', webhook.id]
    );
    await query(
      `INSERT INTO settings (setting_key, setting_value) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      ['stripe_webhook_secret', webhook.secret]
    );

    log(`Webhook CREATED: url=${webhookUrl}, id=${webhook.id}, secret=${webhook.secret ? 'received' : 'MISSING'}`);
    return webhook.id;
  } catch (err) {
    logErr(`Stripe API error: ${err.response?.status} ${JSON.stringify(err.response?.data) || err.message}`);
    return null;
  }
}

// Get public settings (no auth required)
// These are settings that are safe to expose to the frontend
router.get('/public', async (req, res) => {
  try {
    const settings = await query('SELECT setting_key, setting_value FROM settings');

    // Only expose safe settings
    const publicSettings = {};
    const safeKeys = ['stripe_public_key', 'site_name', 'site_tagline', 'site_url', 'google_analytics_id', 'google_maps_api_key', 'site_address'];

    settings.forEach(s => {
      if (safeKeys.includes(s.setting_key)) {
        publicSettings[s.setting_key] = s.setting_value;
      }
    });

    res.json(publicSettings);
  } catch (err) {
    console.error('Get public settings error:', err);
    res.status(500).json({ error: 'Failed to get settings' });
  }
});

// Get all settings (admin only)
router.get('/', requireAuth, async (req, res) => {
  try {
    const settings = await query('SELECT setting_key, setting_value FROM settings');
    
    // Convert to object
    const settingsObj = {};
    settings.forEach(s => {
      settingsObj[s.setting_key] = s.setting_value;
    });
    
    res.json(settingsObj);
  } catch (err) {
    console.error('Get settings error:', err);
    res.status(500).json({ error: 'Failed to get settings' });
  }
});

// Get single setting
router.get('/:key', requireAuth, async (req, res) => {
  try {
    const settings = await query(
      'SELECT setting_value FROM settings WHERE setting_key = ?',
      [req.params.key]
    );
    
    if (!settings[0]) {
      return res.status(404).json({ error: 'Setting not found' });
    }
    
    res.json({ key: req.params.key, value: settings[0].setting_value });
  } catch (err) {
    console.error('Get setting error:', err);
    res.status(500).json({ error: 'Failed to get setting' });
  }
});

// Update settings (batch)
router.put('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const settings = req.body;

    for (const [key, value] of Object.entries(settings)) {
      await query(
        `INSERT INTO settings (setting_key, setting_value)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
        [key, value]
      );
    }

    // Auto-register Stripe webhook when stripe_secret_key is saved
    if (settings.stripe_secret_key) {
      logInfo(req, 'stripe-setup', 'stripe_secret_key detected in settings save, attempting webhook registration...');
      const webhookId = await ensureStripeWebhook(req, settings.stripe_secret_key);
      if (webhookId) {
        logInfo(req, 'stripe-setup', `Webhook registration SUCCESS: ${webhookId}`);
      } else {
        logError(req, new Error('Webhook registration FAILED — check site_url setting and Stripe key'), 'stripe-setup');
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Update settings error:', err);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// Update single setting
router.put('/:key', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { value } = req.body;
    
    await query(
      `INSERT INTO settings (setting_key, setting_value) 
       VALUES (?, ?) 
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      [req.params.key, value]
    );
    
    res.json({ success: true });
  } catch (err) {
    console.error('Update setting error:', err);
    res.status(500).json({ error: 'Failed to update setting' });
  }
});

// Delete setting
router.delete('/:key', requireAuth, requireAdmin, async (req, res) => {
  try {
    await query('DELETE FROM settings WHERE setting_key = ?', [req.params.key]);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete setting error:', err);
    res.status(500).json({ error: 'Failed to delete setting' });
  }
});

export default router;
