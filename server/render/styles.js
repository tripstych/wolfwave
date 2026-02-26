import { Router } from 'express';
import { serveStyle } from '../controllers/styleController.js';

const router = Router();

router.get('/:filename', serveStyle);

export default router;
