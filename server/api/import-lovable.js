import { Router } from 'express';
import { requireAuth, requireEditor } from '../middleware/auth.js';
import prisma from '../lib/prisma.js';
import { LovableImporterService } from '../services/lovable-importer/LovableImporterService.js';
import { LovableRuleGenerator } from '../services/lovable-importer/LovableRuleGenerator.js';
import { LovableTemplateGenerator } from '../services/lovable-importer/LovableTemplateGenerator.js';
import { LovableTransformer } from '../services/lovable-importer/LovableTransformer.js';
import { jobRegistry } from '../services/assisted-import/JobRegistry.js';

const router = Router();

/**
 * Start a new Lovable Git-based import
 */
router.post('/', requireAuth, requireEditor, async (req, res) => {
  try {
    const { url, config = {} } = req.body;
    if (!url) return res.status(400).json({ error: 'Git repository URL required' });

    const site = await prisma.imported_sites.create({
      data: {
        root_url: url,
        status: 'pending',
        config: { ...config, importer_type: 'lovable_git' }
      }
    });

    const result = await LovableImporterService.startImport(site.id, url);
    res.json({ success: true, site_id: site.id, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * List all Lovable imports
 */
router.get('/sites', requireAuth, async (req, res) => {
  try {
    const sites = await prisma.imported_sites.findMany({
      orderBy: { created_at: 'desc' }
    });
    // Filter to lovable imports in JS (Prisma JSON path filtering varies by DB)
    const lovableSites = sites.filter(s => s.config?.importer_type === 'lovable');
    res.json(lovableSites);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Get site details
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
      },
      orderBy: { created_at: 'desc' }
    });
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Trigger finalization (rules + templates + transformation)
 */
router.post('/sites/:id/transform', requireAuth, requireEditor, async (req, res) => {
  try {
    const siteId = parseInt(req.params.id);

    const runFinalize = async () => {
      const ruleEngine = new LovableRuleGenerator(siteId, req.tenantDb);
      await ruleEngine.run();

      const tplEngine = new LovableTemplateGenerator(siteId, req.tenantDb);
      await tplEngine.run();

      const transformer = new LovableTransformer(siteId, req.tenantDb);
      await transformer.run();
    };

    runFinalize().catch(err => {
      console.error('[LOVABLE-IMPORT] Finalize Failed:', err);
    });

    res.json({ success: true, message: 'Finalization started in background' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Cancel an active import
 */
router.post('/sites/:id/stop', requireAuth, requireEditor, async (req, res) => {
  try {
    const siteId = parseInt(req.params.id);
    jobRegistry.cancel(siteId);

    await prisma.imported_sites.update({
      where: { id: siteId },
      data: { status: 'cancelled', last_action: 'Cancelled by user.' }
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Delete a site and its staged items (cascade)
 */
router.delete('/sites/:id', requireAuth, requireEditor, async (req, res) => {
  try {
    const siteId = parseInt(req.params.id);
    jobRegistry.cancel(siteId);

    await prisma.imported_sites.delete({
      where: { id: siteId }
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
