import { Router } from 'express';
import { query } from '../db/connection.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { getAvailableThemes, clearThemeCache, getThemesDir } from '../services/themeResolver.js';
import { syncTemplatesToDb } from '../services/templateParser.js';
import prisma from '../lib/prisma.js';
import fs from 'fs';
import path from 'path';

import { log, error as logError } from '../lib/logger.js';
const router = Router();

// Helper to safely resolve theme file path
function resolveThemePath(theme, filePath) {
  const themesDir = getThemesDir();
  const themeDir = path.join(themesDir, theme);
  const fullPath = filePath ? path.join(themeDir, filePath) : themeDir;
  
  // Normalize both for comparison (especially on Windows)
  const normFullPath = path.normalize(fullPath);
  const normThemesDir = path.normalize(themesDir);

  // Prevent directory traversal
  if (!normFullPath.startsWith(normThemesDir)) {
    throw new Error(`Invalid path: ${normFullPath} is outside ${normThemesDir}`);
  }

  return normFullPath;
}

// List all available themes (from filesystem)
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const themes = getAvailableThemes();

    // Get active theme from settings
    const settings = await query(
      'SELECT setting_value FROM settings WHERE setting_key = ?',
      ['active_theme']
    );
    const activeTheme = settings[0]?.setting_value || 'default';

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

// Get theme file structure
router.get('/:theme/files', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { theme } = req.params;
    const themeDir = resolveThemePath(theme);

    if (!fs.existsSync(themeDir)) {
      return res.status(404).json({ error: 'Theme not found' });
    }

    const files = [];
    
    async function scanDir(dir, relativeDir = '') {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const relativePath = path.join(relativeDir, entry.name).replace(/\\/g, '/');
        if (entry.isDirectory()) {
          await scanDir(path.join(dir, entry.name), relativePath);
        } else {
          files.push({
            path: relativePath,
            name: entry.name,
            size: (await fs.promises.stat(path.join(dir, entry.name))).size,
            updated: (await fs.promises.stat(path.join(dir, entry.name))).mtime
          });
        }
      }
    }

    await scanDir(themeDir);
    res.json(files);
  } catch (err) {
    console.error('Failed to list theme files:', err);
    res.status(500).json({ error: 'Failed to list theme files' });
  }
});

// Read theme file
router.get('/:theme/files/*', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { theme } = req.params;
    const filePath = req.params[0];

    // If default theme, try to get from DB first
    if (theme === 'default') {
      const template = await prisma.templates.findUnique({
        where: { filename: filePath }
      });
      if (template && template.content) {
        return res.json({ content: template.content, source: 'db' });
      }
    }

    const fullPath = resolveThemePath(theme, filePath);
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    const content = await fs.promises.readFile(fullPath, 'utf8');
    res.json({ content, source: 'fs' });
  } catch (err) {
    console.error('Failed to read file:', err);
    res.status(500).json({ error: 'Failed to read file' });
  }
});

// Write theme file
router.post('/:theme/files/*', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { theme } = req.params;
    const filePath = req.params[0];
    const { content } = req.body;
    const fullPath = resolveThemePath(theme, filePath);

    // If default theme, save to DB templates table as well
    if (theme === 'default') {
      try {
        await prisma.templates.upsert({
          where: { filename: filePath },
          update: { content, updated_at: new Date() },
          create: { 
            filename: filePath, 
            name: path.basename(filePath, path.extname(filePath)), 
            content,
            created_at: new Date(),
            updated_at: new Date()
          }
        });
      } catch (dbErr) {
        console.error('Failed to sync write to DB:', dbErr);
        // Continue to FS write
      }
    }

    // Ensure directory exists
    await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
    
    await fs.promises.writeFile(fullPath, content, 'utf8');
    
    // Clear cache to apply changes immediately
    clearThemeCache();
    
    res.json({ success: true });
  } catch (err) {
    logError(req, err, 'THEME_SAVE');
    res.status(500).json({ error: 'Failed to save file', message: err.message });
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
    const { theme } = req.body;

    if (!theme) {
      return res.status(400).json({ error: 'Theme slug is required' });
    }

    // Validate theme exists on disk
    const available = getAvailableThemes();
    const exists = available.find(t => t.slug === theme);
    if (!exists) {
      return res.status(404).json({ error: `Theme "${theme}" not found` });
    }

    // Upsert the setting
    await query(
      `INSERT INTO settings (setting_key, setting_value) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      ['active_theme', theme]
    );

    // Clear cached environments so the new theme takes effect
    clearThemeCache();

    // Sync templates for the new theme
    await syncTemplatesToDb(prisma, theme);

    res.json({ success: true, active: theme });
  } catch (err) {
    console.error('Failed to set active theme:', err);
    res.status(500).json({ error: 'Failed to set active theme' });
  }
});

export default router;
