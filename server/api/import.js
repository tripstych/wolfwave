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

router.get('/presets', requireAuth, (req, res) => {
  res.json(CRAWLER_PRESETS);
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

router.post('/sites/:id/bulk-migrate', requireAuth, requireEditor, async (req, res) => {
  try { res.json({ success: true, results: await bulkMigrate(parseInt(req.params.id), req.body.structural_hash, req.body.template_id, req.body.selector_map) }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/sites/:id/bulk-migrate-products', requireAuth, requireEditor, async (req, res) => {
  try { res.json({ success: true, results: await bulkMigrateProducts(parseInt(req.params.id), req.body.template_id) }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/sites/:id/bulk-migrate-all', requireAuth, requireEditor, async (req, res) => {
  try { res.json({ success: true, results: await bulkMigrateAll(parseInt(req.params.id), req.body.template_id, req.body.selector_map) }); }
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
