import axios from 'axios';
import * as cheerio from 'cheerio';
import { Router } from 'express';
import { requireAuth, requireEditor } from '../middleware/auth.js';
import { scrapeUrl } from '../services/scraperService.js';
import { crawlSite } from '../services/crawlerService.js';
import { analyzeSiteGroups, generateTemplateFromGroup } from '../services/templateGeneratorService.js';
import { migratePage, bulkMigrate, bulkMigrateAll } from '../services/migrationService.js';
import { migrateProduct, bulkMigrateProducts } from '../services/productMigrationService.js';
import prisma from '../lib/prisma.js';
import { CRAWLER_PRESETS } from '../lib/crawlerPresets.js';

const router = Router();

// Visual Selector Proxy
router.get('/proxy', requireAuth, requireEditor, async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).send('URL required');

    const { data: html } = await axios.get(url, {
      headers: { 'User-Agent': 'WebWolf-Proxy/1.0' },
      timeout: 10000
    });

    const $ = cheerio.load(html);
    const origin = new URL(url).origin;

    // 1. Inject <base> to fix relative assets
    $('head').prepend(`<base href="${origin}/">`);

    // 2. Inject Picker Assets (Absolute paths to our own server)
    // Using protocol-relative URLs ensures it matches the parent frame's protocol
    const host = req.get('host');
    
    $('head').append(`<link rel="stylesheet" href="//${host}/css/selector-picker.css">`);
    $('body').append(`<script src="//${host}/js/selector-picker.js"></script>`);

    // 3. NUCLEAR STRIP: Original scripts, noscripts, and frames to prevent redirects/loops
    $('script').remove();
    $('noscript').remove();
    $('iframe').remove();
    $('meta[http-equiv="refresh"]').remove();
    $('meta[http-equiv="Content-Security-Policy"]').remove();
    $('meta[http-equiv="content-security-policy"]').remove();

    // 4. Force inject our picker script back since we just nuked all scripts
    $('body').append(`<script src="//${host}/js/selector-picker.js"></script>`);

    res.send($.html());
  } catch (err) {
    res.status(500).send(`Proxy Error: ${err.message}`);
  }
});

router.get('/presets', requireAuth, (req, res) => {
  res.json(CRAWLER_PRESETS);
});

router.post('/extract', requireAuth, requireEditor, async (req, res) => {
  try {
    const { url, selector_map, field_types = {} } = req.body;
    if (!url || !selector_map) return res.status(400).json({ error: 'URL and selector map required' });

    const { data: html } = await axios.get(url, {
      headers: { 'User-Agent': 'WebWolf-Extractor/1.0' },
      timeout: 10000
    });

    const $ = cheerio.load(html);
    const results = {};

    for (const [field, selector] of Object.entries(selector_map)) {
      const $el = $(selector);
      if ($el.length > 0) {
        const tagName = $el.get(0).tagName.toLowerCase();
        const type = field_types[field] || 'text';
        
        if (tagName === 'img') {
          results[field] = $el.attr('src') || $el.attr('data-src') || $el.attr('srcset');
        } else if (type === 'richtext') {
          results[field] = $el.html().trim();
        } else {
          // Default to stripping tags for all other types (text, textarea, title, etc)
          results[field] = $el.first().text().trim();
        }
      }
    }

    res.json({ success: true, data: results });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/url', requireAuth, requireEditor, async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL required' });
    const data = await scrapeUrl(url);
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/crawl', requireAuth, requireEditor, async (req, res) => {
  try {
    const { url, config } = req.body;
    if (!url) return res.status(400).json({ error: 'Root URL required' });
    const site = await prisma.imported_sites.create({ 
      data: { 
        root_url: url, 
        status: 'pending',
        config: config || {} // Save crawl options
      } 
    });
    crawlSite(site.id, url);
    res.json({ success: true, site_id: site.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/sites', requireAuth, async (req, res) => {
  try {
    const sites = await prisma.imported_sites.findMany({ orderBy: { created_at: 'desc' } });
    res.json(sites);
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

router.get('/sites/:id', requireAuth, async (req, res) => {
  try {
    const site = await prisma.imported_sites.findUnique({
      where: { id: parseInt(req.params.id) },
      include: { imported_pages: { select: { id: true, url: true, title: true, structural_hash: true, metadata: true, status: true, created_at: true }, orderBy: { url: 'asc' } } }
    });
    if (!site) return res.status(404).json({ error: 'Not found' });
    res.json(site);
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

router.get('/sites/:id/groups', requireAuth, async (req, res) => {
  try { res.json(await analyzeSiteGroups(parseInt(req.params.id))); }
  catch (err) { res.status(500).json({ error: 'Failed' }); }
});

router.post('/sites/:id/generate-template', requireAuth, requireEditor, async (req, res) => {
  try {
    const tpl = await generateTemplateFromGroup(parseInt(req.params.id), req.body.structural_hash, req.body.name);
    res.json({ success: true, template: tpl });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/sites/:id/stop', requireAuth, requireEditor, async (req, res) => {
  try {
    await prisma.imported_sites.update({
      where: { id: parseInt(req.params.id) },
      data: { status: 'cancelled' }
    });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/sites/:id/restart', requireAuth, requireEditor, async (req, res) => {
  try {
    const siteId = parseInt(req.params.id);
    const site = await prisma.imported_sites.findUnique({ where: { id: siteId } });
    if (!site) return res.status(404).json({ error: 'Not found' });

    // Clear old pages
    await prisma.imported_pages.deleteMany({ where: { site_id: siteId } });
    
    // Reset site status
    await prisma.imported_sites.update({
      where: { id: siteId },
      data: { status: 'pending', page_count: 0 }
    });

    // Start crawl
    crawlSite(siteId, site.root_url);
    
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/sites/:id/rules', requireAuth, requireEditor, async (req, res) => {
  try {
    const siteId = parseInt(req.params.id);
    const { name, template_id, selector_map, id } = req.body;
    
    const site = await prisma.imported_sites.findUnique({ where: { id: siteId } });
    if (!site) return res.status(404).json({ error: 'Site not found' });

    let config = typeof site.config === 'string' ? JSON.parse(site.config || '{}') : (site.config || {});
    if (!config.migration_rules) config.migration_rules = [];

    const newRule = {
      id: id || Date.now().toString(),
      name: name || 'New Rule',
      template_id: parseInt(template_id),
      selector_map: selector_map || { main: 'main' },
      updated_at: new Date()
    };

    const existingIdx = config.migration_rules.findIndex(r => r.id === newRule.id);
    if (existingIdx > -1) config.migration_rules[existingIdx] = newRule;
    else config.migration_rules.push(newRule);

    const updated = await prisma.imported_sites.update({
      where: { id: siteId },
      data: { config }
    });

    res.json({ success: true, rule: newRule, site: updated });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/sites/:id/migrate-with-rule', requireAuth, requireEditor, async (req, res) => {
  try {
    const siteId = parseInt(req.params.id);
    const { rule_id, page_ids } = req.body;
    
    const site = await prisma.imported_sites.findUnique({ where: { id: siteId } });
    if (!site) return res.status(404).json({ error: 'Site not found' });

    const config = typeof site.config === 'string' ? JSON.parse(site.config || '{}') : (site.config || {});
    const rule = (config.migration_rules || []).find(r => r.id === rule_id);
    if (!rule) return res.status(404).json({ error: 'Rule not found' });

    const results = await bulkMigrateAll(siteId, rule.template_id, rule.selector_map, page_ids);
    res.json({ success: true, results });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/sites/:id/rules/:ruleId', requireAuth, requireEditor, async (req, res) => {
  try {
    const siteId = parseInt(req.params.id);
    const { ruleId } = req.params;

    const site = await prisma.imported_sites.findUnique({ where: { id: siteId } });
    if (!site) return res.status(404).json({ error: 'Site not found' });

    let config = typeof site.config === 'string' ? JSON.parse(site.config || '{}') : (site.config || {});
    if (config.migration_rules) {
      config.migration_rules = config.migration_rules.filter(r => r.id !== ruleId);
      await prisma.imported_sites.update({
        where: { id: siteId },
        data: { config }
      });
    }

    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/sites/:id/bulk-migrate', requireAuth, requireEditor, async (req, res) => {
  try { res.json({ success: true, results: await bulkMigrate(parseInt(req.params.id), req.body.structural_hash, req.body.template_id, req.body.selector_map) }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/sites/:id/bulk-migrate-products', requireAuth, requireEditor, async (req, res) => {
  try { res.json({ success: true, results: await bulkMigrateProducts(parseInt(req.params.id), req.body.template_id, req.body.product_ids) }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/sites/:id/bulk-migrate-all', requireAuth, requireEditor, async (req, res) => {
  try { res.json({ success: true, results: await bulkMigrateAll(parseInt(req.params.id), req.body.template_id, req.body.selector_map, req.body.page_ids) }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/sites/:id', requireAuth, requireEditor, async (req, res) => {
  try {
    await prisma.imported_sites.delete({
      where: { id: parseInt(req.params.id) }
    });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/pages/:id', requireAuth, async (req, res) => {
  try {
    const page = await prisma.imported_pages.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!page) return res.status(404).json({ error: 'Not found' });
    res.json(page);
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

export default router;
