import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';

import apiRoutes, { registerContentTypeApis } from './api/index.js';
import publicRoutes from './render/public.js';
import styleRoutes from './render/styles.js';
import { initDb, query } from './db/connection.js';
import { tenantMiddleware } from './middleware/tenant.js';
import { closeAllPools } from './lib/poolManager.js';
import { closePrisma } from './lib/prisma.js';
import { getNunjucksEnv, getThemesDir } from './services/themeResolver.js';
import { accessLog, errorLog, closeLogs, info, error as logError } from './lib/logger.js';
import { maybePatchConsole } from './lib/consolePatch.js';
import woocommerceApiRoutes from './api/woocommerce.js';
import woocommerceLegacyRoutes from './api/woocommerceLegacy.js';
// ShipStation v1 disabled - will be replaced with v2 API integration
// import shipstationRoutes from './api/shipstation.js';
// import shipstationRestRoutes from './api/shipstation-rest.js';
import { authenticateWooCommerce } from './middleware/woocommerceAuth.js';
import devtoolsRoutes from './api/devtools.js';

// Patch console FIRST so all console.log/error/warn calls go to log files
maybePatchConsole();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// Error handler (logs to per-tenant error.log)
app.use(errorLog);

// Initialize database and start server
if (process.env.NODE_ENV !== 'test') {
  initDb().then(async () => {
    // Create a default Nunjucks env at startup (for express error pages, etc.)
    const defaultEnv = await getNunjucksEnv('default');
    app.locals.nunjucksEnv = defaultEnv;
    // Let express know how to render .njk files via the default env
    defaultEnv.express(app);

    app.listen(PORT, () => {
      info('system', 'STARTUP', `WolfWave CMS running on http://localhost:${PORT}`);
      info('system', 'STARTUP', `Admin UI: http://localhost:5173 (dev) or http://localhost:${PORT}/admin (prod)`);
    });
  }).catch(err => {
    logError('system', err, 'DB_INIT');
    process.exit(1);
  });
}

// Catch unhandled errors so they go to log files instead of disappearing in pm2
process.on('uncaughtException', (err) => {
  logError('system', err, 'UNCAUGHT_EXCEPTION');
  // Give the log stream time to flush before exiting
  setTimeout(() => process.exit(1), 500);
});

process.on('unhandledRejection', (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  logError('system', err, 'UNHANDLED_REJECTION');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  info('system', 'SHUTDOWN', 'SIGTERM received, shutting down...');
  await closeAllPools();
  await closePrisma();
  closeLogs();
  process.exit(0);
});

export default app;
