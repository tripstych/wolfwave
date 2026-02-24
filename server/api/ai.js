import { Router } from 'express';
import axios from 'axios';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { generateThemeFromIndustry, generateImage, generateText, generateContentForFields, suggestSelectors } from '../services/aiService.js';
import { downloadImage } from '../services/mediaService.js';
import fs from 'fs/promises';
import path from 'path';
import { getThemesDir } from '../services/themeResolver.js';
import { syncTemplatesToDb } from '../services/templateParser.js';
import prisma from '../lib/prisma.js';

const router = Router();

/**
 * POST /api/ai/generate-theme
 * Payload: { industry: "Coffee Shop" }
 */
router.post('/generate-theme', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { industry } = req.body;
    if (!industry) return res.status(400).json({ error: 'Industry is required' });

    console.log(`[AI-DEBUG] 🚀 Received request to generate theme for industry: "${industry}"`);

    // 1. SMART CACHE CHECK
    // Convert "Modern Coffee Shop" -> "modern-coffee-shop"
    const targetSlug = industry.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    
    // Check if this theme already exists on disk
    const existingThemeDir = path.join(getThemesDir(), targetSlug);
    try {
      await fs.access(existingThemeDir);
      console.log(`[AI-DEBUG] 💎 CACHE HIT! Theme "${targetSlug}" already exists.`);
      console.log(`[AI-DEBUG] 💰 Cost saved: ~$0.08 (GPT-4o + DALL-E 3)`);
      
      // Ensure it's synced to DB just in case
      await syncTemplatesToDb(prisma, targetSlug);
      
      return res.json({ 
        success: true, 
        slug: targetSlug, 
        message: 'Theme found in library (Instant Load)',
        cached: true
      });
    } catch (e) {
      console.log(`[AI-DEBUG] 💨 Cache miss. Proceeding to generation...`);
    }

    console.log(`[AI-DEBUG] ⏳ Calling AI Service...`);
    
    const { slug, files } = await generateThemeFromIndustry(industry);
    console.log(`[AI-DEBUG] ✅ AI Service returned data for slug: "${slug}"`);
    console.log(`[AI-DEBUG] 📦 Generated ${Object.keys(files).length} files.`);

    // Write files to disk
    const themeDir = path.join(getThemesDir(), slug);
    console.log(`[AI-DEBUG] 📂 Target directory: ${themeDir}`);
    
    // Create directories
    await fs.mkdir(path.join(themeDir, 'pages'), { recursive: true });
    await fs.mkdir(path.join(themeDir, 'assets/css'), { recursive: true });
    console.log(`[AI-DEBUG] 📁 Directories created.`);

    // Write files
    for (const [relativePath, content] of Object.entries(files)) {
      const filePath = path.join(themeDir, relativePath);
      await fs.writeFile(filePath, content);
      console.log(`[AI-DEBUG] 📝 Wrote file: ${relativePath} (${content.length} bytes)`);
    }

    console.log(`[AI-DEBUG] 🔄 Syncing templates to database...`);
    // Sync templates to DB so it's immediately usable
    const syncResult = await syncTemplatesToDb(prisma, slug);
    console.log(`[AI-DEBUG] ✅ Database sync complete. ${syncResult.length} templates registered.`);

    res.json({ success: true, slug, message: 'Theme generated successfully' });

  } catch (error) {
    console.error('[AI-DEBUG] ❌ Generation Failed:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/ai/generate-image
 * Payload: { prompt: "A futuristic city", preview: true }
 */
router.post('/generate-image', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { prompt, preview } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

    const imagePath = await generateImage(prompt, "1024x1024", req.user?.id, !!preview);
    res.json({ success: true, path: imagePath });

  } catch (error) {
    console.error('Image Generation Failed:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/ai/save-generated-image
 * Payload: { url: "...", prompt: "..." }
 */
router.post('/save-generated-image', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { url, prompt } = req.body;
    if (!url) return res.status(400).json({ error: 'URL/Data is required' });

    const localUrl = await downloadImage(url, prompt || 'AI Generated', req.user?.id, true);
    res.json({ success: true, path: localUrl });

  } catch (error) {
    console.error('Image Save Failed:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/ai/generate-content
 * Payload: { templateId: 1, prompt: "Luxury Bakery", currentData: {} }
 */
router.post('/generate-content', requireAuth, async (req, res) => {
  try {
    const { templateId, prompt } = req.body;
    console.log(`[AI-DEBUG] 📥 generate-content request:`, { templateId, prompt });
    
    if (!templateId) return res.status(400).json({ error: 'Template ID is required' });
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

    // 1. Get Template Fields
    console.log(`[AI-DEBUG] 🔍 Looking up template ID: ${templateId}`);
    const template = await prisma.templates.findUnique({
      where: { id: parseInt(templateId) }
    });

    if (!template) {
      console.error(`[AI-DEBUG] ❌ Template not found: ${templateId}`);
      return res.status(404).json({ error: 'Template not found' });
    }

    console.log(`[AI-DEBUG] ✨ Found template: "${template.name}"`);

    let fields = [];
    try {
      fields = typeof template.regions === 'string' 
        ? JSON.parse(template.regions) 
        : template.regions;
      console.log(`[AI-DEBUG] 📋 Parsed ${fields?.length || 0} fields from template.`);
    } catch (e) {
      console.error(`[AI-DEBUG] ❌ Failed to parse template regions:`, e.message);
      return res.status(500).json({ error: 'Invalid template schema' });
    }

    console.log(`[AI-DEBUG] ⏳ Calling AI Service for fields:`, fields.map(f => f.name));

    // 2. Call AI Service - PASS REQ FOR LOGGING
    const content = await generateContentForFields(fields, prompt, null, req);
    console.log(`[AI-DEBUG] ✅ AI Service returned content:`, Object.keys(content || {}));

    res.json({ success: true, data: content });

  } catch (error) {
    console.error('[AI-DEBUG] ❌ Content Generation Failed:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/ai/suggest-selectors
 * Payload: { url: "...", fields: [...] }
 */
router.post('/suggest-selectors', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { url, fields } = req.body;
    if (!url || !fields) return res.status(400).json({ error: 'URL and fields required' });

    console.log(`[AI-DEBUG] 🔍 Suggesting selectors for URL: ${url}`);

    // 1. Try to find the HTML in our database first
    const staged = await prisma.staged_items.findFirst({
      where: { url },
      select: { raw_html: true }
    });

    let html = staged?.raw_html;

    if (!html) {
      console.log(`[AI-DEBUG] 🌐 HTML not found in DB, fetching fresh: ${url}`);
      // 2. Fetch HTML if not in DB
      const response = await axios.get(url, {
        timeout: 10000,
        headers: { 'User-Agent': 'WebWolf-AI-Discovery/1.0' }
      });
      html = response.data;
    } else {
      console.log(`[AI-DEBUG] 📦 Using HTML from database cache.`);
    }

    if (!html) throw new Error('Could not retrieve HTML for analysis.');

    // 3. Call AI Service
    const suggestions = await suggestSelectors(fields, html, null, req);
    
    res.json({ success: true, suggestions });

  } catch (error) {
    console.error('[AI-DEBUG] ❌ Selector Suggestion Failed:', error.message);
    res.status(500).json({ error: error.message });
  }
});

export default router;
