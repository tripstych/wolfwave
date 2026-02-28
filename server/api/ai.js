import { Router } from 'express';
import axios from 'axios';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { 
  generateThemeFromIndustry, 
  generateImage, 
  generateText, 
  generateContentForFields, 
  suggestSelectors,
  getAvailableScaffolds,
  draftThemePlan
} from '../services/aiService.js';
import { downloadImage } from '../services/mediaService.js';
import fs from 'fs/promises';
import path from 'path';
import { getThemesDir } from '../services/themeResolver.js';
import { syncTemplatesToDb } from '../services/templateParser.js';
import prisma from '../lib/prisma.js';

const router = Router();

/**
 * GET /api/ai/scaffolds
 */
router.get('/scaffolds', requireAuth, requireAdmin, async (req, res) => {
  try {
    const scaffolds = await getAvailableScaffolds();
    res.json(scaffolds);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/ai/draft-theme
 * Payload: { industry: "Coffee Shop" }
 */
router.post('/draft-theme', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { industry } = req.body;
    if (!industry) return res.status(400).json({ error: 'Industry is required' });

    const plan = await draftThemePlan(industry);
    res.json({ success: true, plan });
  } catch (error) {
    console.error('[AI-DEBUG] ❌ Drafting Failed:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/ai/generate-theme
 * Payload: { industry: "Coffee Shop", plan: { ... } }
 */
router.post('/generate-theme', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { industry, plan } = req.body;
    if (!industry && !plan) return res.status(400).json({ error: 'Industry or Plan is required' });

    console.log(`[AI-DEBUG] 🚀 Generating VIRTUAL theme for: "${industry || plan.name}"`);

    // 1. Generate the theme data (content + templates + demoContent)
    const themeData = await generateThemeFromIndustry(industry, plan);
    const { slug, templates, name, demoContent } = themeData;

    // 2. Flush any previous virtual theme templates (old slugs pile up otherwise)
    const previousTheme = await prisma.settings.findUnique({ where: { setting_key: 'active_theme' } });
    const prevSlug = previousTheme?.setting_value;
    if (prevSlug && prevSlug !== 'default' && prevSlug !== slug) {
      const deleted = await prisma.templates.deleteMany({
        where: { filename: { startsWith: `${prevSlug}/` } }
      });
      if (deleted.count) console.log(`[AI-DEBUG] 🗑️ Flushed ${deleted.count} templates from previous theme "${prevSlug}"`);
    }

    // 3. Save templates to the database (VIRTUAL storage)
    let homepageTemplateId = null;
    for (const [relativePath, content] of Object.entries(templates)) {
      const dbFilename = `${slug}/${relativePath}`;
      const contentType = relativePath.startsWith('pages/') ? 'pages' : 'assets';

      const tpl = await prisma.templates.upsert({
        where: { filename: dbFilename },
        update: {
          content,
          name: path.basename(relativePath),
          content_type: contentType,
          updated_at: new Date()
        },
        create: {
          filename: dbFilename,
          name: path.basename(relativePath),
          content,
          content_type: contentType,
          created_at: new Date(),
          updated_at: new Date()
        }
      });

      if (relativePath === 'pages/homepage.njk') {
        homepageTemplateId = tpl.id;
      }
      console.log(`[AI-DEBUG] 💾 Saved virtual template: ${dbFilename}`);
    }

    // 3. Store demo content in a content + page record so the template can render it
    if (homepageTemplateId && demoContent) {
      const homepageSlug = '/pages/homepage';

      // Upsert content record with AI-generated demo data
      const existingContent = await prisma.content.findUnique({ where: { slug: homepageSlug } });

      let contentRecord;
      if (existingContent) {
        contentRecord = await prisma.content.update({
          where: { slug: homepageSlug },
          data: {
            data: demoContent,
            title: name || 'Homepage',
            updated_at: new Date()
          }
        });
      } else {
        contentRecord = await prisma.content.create({
          data: {
            module: 'pages',
            title: name || 'Homepage',
            slug: homepageSlug,
            data: demoContent,
            created_at: new Date(),
            updated_at: new Date()
          }
        });
      }

      // Upsert page record linking template and content
      const existingPage = await prisma.pages.findFirst({
        where: { content_id: contentRecord.id }
      });

      let pageRecord;
      if (existingPage) {
        pageRecord = await prisma.pages.update({
          where: { id: existingPage.id },
          data: {
            template_id: homepageTemplateId,
            title: name || 'Homepage',
            status: 'published',
            updated_by: req.user?.id || null
          }
        });
      } else {
        pageRecord = await prisma.pages.create({
          data: {
            template_id: homepageTemplateId,
            content_id: contentRecord.id,
            title: name || 'Homepage',
            content_type: 'pages',
            status: 'published',
            meta_title: name || 'Homepage',
            meta_description: themeData.description || '',
            robots: 'index, follow',
            created_by: req.user?.id || null,
            updated_by: req.user?.id || null
          }
        });
      }

      // Set this page as the homepage
      await prisma.settings.upsert({
        where: { setting_key: 'home_page_id' },
        update: { setting_value: String(pageRecord.id) },
        create: { setting_key: 'home_page_id', setting_value: String(pageRecord.id) }
      });

      console.log(`[AI-DEBUG] 📄 Homepage content saved (content_id: ${contentRecord.id}, page_id: ${pageRecord.id})`);
    }

    // 4. Update the active theme setting
    await prisma.settings.upsert({
      where: { setting_key: 'active_theme' },
      update: { setting_value: slug },
      create: { setting_key: 'active_theme', setting_value: slug }
    });

    // 5. Clear cache so the new virtual theme is picked up
    const { clearThemeCache } = await import('../services/themeResolver.js');
    clearThemeCache();

    res.json({ success: true, slug, message: 'Virtual theme generated and activated' });

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
