import { Router } from 'express';
import { query } from '../db/connection.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { getAvailableThemes, clearThemeCache } from '../services/themeResolver.js';
import { syncTemplatesToDb } from '../services/templateParser.js';
import prisma from '../lib/prisma.js';

import { log, error as logError } from '../lib/logger.js';
const router = Router();

// Clear theme cache manually
router.post('/clear-cache', requireAuth, requireAdmin, async (req, res) => {
  try {
    clearThemeCache();
    res.json({ success: true, message: 'Theme cache cleared' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to clear cache' });
  }
});

// List all available themes (from database)
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const themes = await getAvailableThemes();
    const activeTheme = themes.find(t => t.is_active)?.slug || 'default';

    res.json({
      themes: themes.map(t => ({
        ...t,
        active: t.slug === activeTheme
      })),
      active: activeTheme
    });
  } catch (err) {
    console.error('Failed to list themes:', err);
    res.status(500).json({ error: 'Failed to list themes' });
  }
});

// Get current tenant's active theme
router.get('/active', requireAuth, async (req, res) => {
  try {
    const settings = await query(
      'SELECT setting_value FROM settings WHERE setting_key = ?',
      ['active_theme']
    );
    const activeTheme = settings[0]?.setting_value || 'default';
    res.json({ active: activeTheme });
  } catch (err) {
    console.error('Failed to get active theme:', err);
    res.status(500).json({ error: 'Failed to get active theme' });
  }
});

// Set active theme
router.put('/active', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { theme, flushContent } = req.body;

    if (!theme) {
      return res.status(400).json({ error: 'Theme slug is required' });
    }

    // Validate theme exists in DB
    const themeRecord = await prisma.themes.findUnique({ where: { slug: theme } });
    if (!themeRecord) {
      return res.status(404).json({ error: `Theme "${theme}" not found` });
    }

    // ── OPTIONAL CONTENT FLUSH ──
    if (flushContent === true) {
      log('INFO', req, 'THEME_FLUSH', `Flushing all content for new theme: ${theme}`);

      // 1. Delete specialized content records
      await prisma.pages.deleteMany({});
      await prisma.blocks.deleteMany({});
      await prisma.products.deleteMany({});

      // 2. Clear history and the main content table
      await prisma.content_history.deleteMany({});
      await prisma.content.deleteMany({});

      // 3. Reset related settings
      await query(
        'UPDATE settings SET setting_value = "" WHERE setting_key = ?',
        ['home_page_id']
      );
    }

    // Upsert the setting
    await query(
      `INSERT INTO settings (setting_key, setting_value) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      ['active_theme', theme]
    );

    // Update is_active flag in themes table
    await prisma.themes.updateMany({ data: { is_active: false } });
    await prisma.themes.update({ where: { slug: theme }, data: { is_active: true } });

    // Clear cached environments so the new theme takes effect
    clearThemeCache();

    // Sync templates for the new theme
    await syncTemplatesToDb(prisma);

    res.json({ success: true, active: theme, contentFlushed: !!flushContent });
  } catch (err) {
    logError(req, err, 'THEME_ACTIVATE');
    res.status(500).json({ error: 'Failed to set active theme', message: err.message });
  }
});

export default router;
