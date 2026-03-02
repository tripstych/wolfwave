import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { debugPageRoutes } from '../controllers/debugPagesController.js';

const router = Router();

router.get('/routes', requireAuth, requireAdmin, debugPageRoutes);

export default router;