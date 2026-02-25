import { Router } from 'express';
import { requireAuth, requireEditor } from '../middleware/auth.js';
import prisma from '../lib/prisma.js';
import { AssistedImportService } from '../services/assisted-import/AssistedImportService.js';
import { RuleGenerator } from '../services/assisted-import/RuleGenerator.js';
import { TemplateGenerator } from '../services/assisted-import/TemplateGenerator.js';
import { TransformationEngine } from '../services/assisted-import/TransformationEngine.js';

const router = Router();

/**
 * Start a new Assisted import process
 */
router.post('/', requireAuth, requireEditor, async (req, res) => {
  try {
    const { url, config = {} } = req.body;
    if (!url) return res.status(400).json({ error: 'Root URL required' });

    const site = await prisma.imported_sites.create({
      data: {
        root_url: url,
        status: 'pending',
        config: config
      }
    });

    const result = await AssistedImportService.startImport(site.id, url);
    res.json({ success: true, site_id: site.id, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Get all Assisted sites
 */
router.get('/sites', requireAuth, async (req, res) => {
  try {
    const sites = await prisma.imported_sites.findMany({
      orderBy: { created_at: 'desc' }
    });
    res.json(sites);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Get site details including LLM ruleset
 */
router.get('/sites/:id', requireAuth, async (req, res) => {
  try {
    const site = await prisma.imported_sites.findUnique({
      where: { id: parseInt(req.params.id) }
    });
    if (!site) return res.status(404).json({ error: 'Site not found' });
    res.json(site);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Get staged items for a site
 */
router.get('/sites/:id/staged', requireAuth, async (req, res) => {
  try {
    const items = await prisma.staged_items.findMany({
      where: { site_id: parseInt(req.params.id) },
      select: {
        id: true,
        url: true,
        title: true,
        item_type: true,
        structural_hash: true,
        status: true,
        metadata: true,
        created_at: true
        // Exclude large HTML blobs by default, can be fetched individually
      },
      orderBy: { created_at: 'desc' }
    });
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Get a specific staged item with HTML
 */
router.get('/staged/:id', requireAuth, async (req, res) => {
  try {
    const item = await prisma.staged_items.findUnique({
      where: { id: parseInt(req.params.id) }
    });
    if (!item) return res.status(404).json({ error: 'Item not found' });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Manually trigger rule generation
 */
router.post('/sites/:id/generate-rules', requireAuth, requireEditor, async (req, res) => {
  try {
    const siteId = parseInt(req.params.id);
    const ruleGen = new RuleGenerator(siteId, req.tenantDb);
    const ruleset = await ruleGen.run();
    res.json({ success: true, ruleset });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Manually trigger template generation
 */
router.post('/sites/:id/generate-templates', requireAuth, requireEditor, async (req, res) => {
  try {
    const siteId = parseInt(req.params.id);
    const engine = new TemplateGenerator(siteId, req.tenantDb);
    const ruleset = await engine.run();
    res.json({ success: true, ruleset });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Manually trigger transformation
 */
router.post('/sites/:id/transform', requireAuth, requireEditor, async (req, res) => {
  try {
    const siteId = parseInt(req.params.id);
    
    // Wrapper to ensure sequence
    const runFullFinalize = async () => {
      // 1. Ensure rules are generated (needed for selector map)
      const ruleEngine = new RuleGenerator(siteId, req.tenantDb);
      await ruleEngine.run();

      // 2. Ensure templates exist (uses rules)
      const tplEngine = new TemplateGenerator(siteId, req.tenantDb);
      await tplEngine.run();
      
      // 3. Run transformation (uses templates and rules)
      const transEngine = new TransformationEngine(siteId, req.tenantDb);
      await transEngine.run();
    };

    runFullFinalize().catch(err => {
      console.error('[ASSISTED_IMPORT] Background Finalize Failed:', err);
    });

    res.json({ success: true, message: 'Finalization and Migration started in background' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
