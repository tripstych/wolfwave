import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';

import apiRoutes, { registerContentTypeApis } from './api/index.js';
import publicRoutes from './render/public.js';
import { initDb, query } from './db/connection.js';
import { tenantMiddleware } from './middleware/tenant.js';
import { closeAllPools } from './lib/poolManager.js';
import { closePrisma } from './lib/prisma.js';
import { getNunjucksEnv, getThemesDir } from './services/themeResolver.js';
import { accessLog, errorLog, closeLogs, info, error as logError } from './lib/logger.js';
import { maybePatchConsole } from './lib/consolePatch.js';

// Patch console FIRST so all console.log/error/warn calls go to log files
maybePatchConsole();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// Create a default Nunjucks env at startup (for express error pages, etc.)
const defaultEnv = getNunjucksEnv('default');
app.locals.nunjucksEnv = defaultEnv;
// Let express know how to render .njk files via the default env
defaultEnv.express(app);

// Middleware
// app.use(cors({
//   origin: (origin, callback) => {
//     // Allow localhost:5173 and *.localhost:5173
//     if (!origin || 
//         origin === 'http://localhost:5173' || 
//         /^http:\/\/.*\.localhost:5173$/.test(origin)) {
//       callback(null, true);
//     } else {
//       callback(new Error('Not allowed by CORS'));
//     }
//   },
//   credentials: true
// }));

// Capture raw body for webhook signature verification (must be before JSON parsing)
app.use((req, res, next) => {
  if (req.path.startsWith('/api/webhooks/')) {
    let rawBody = '';
    req.on('data', chunk => {
      rawBody += chunk.toString('utf8');
    });
    req.on('end', () => {
      req.rawBody = rawBody;
      next();
    });
  } else {
    next();
  }
});

const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('SESSION_SECRET is required in production');
}

app.use((req, res, next) => {
  if (req.path.startsWith('/api/webhooks/')) return next();
  express.json({ limit: '50mb' })(req, res, next);
});
app.use((req, res, next) => {
  if (req.path.startsWith('/api/webhooks/')) return next();
  express.urlencoded({ limit: '50mb', extended: true })(req, res, next);
});
app.use(cookieParser());
app.use(session({
  secret: SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Static files — public JS/CSS (Must be before tenant middleware to be served without DB checks)
app.use('/', express.static(path.join(__dirname, '../public')));

// Tenant resolution (subdomain -> database, must be first to catch non-existent tenants)
app.use(tenantMiddleware);

// Per-tenant access logging
app.use(accessLog);

// Static files — theme assets
app.use('/themes', express.static(getThemesDir()));

// Serve React admin in production
if (process.env.NODE_ENV === 'production') {
  app.use('/admin', express.static(path.join(__dirname, '../admin/dist')));
  app.get('/admin/*', (req, res) => {
    res.sendFile(path.join(__dirname, '../admin/dist/index.html'));
  });
}

// Per-tenant upload serving
const uploadsRoot = path.join(__dirname, '../uploads');
app.use('/uploads', (req, res, next) => {
  const dbName = req.tenantDb || '';
  const subdomain = dbName.replace(/^wolfwave_/, '') || '_default';
  const tenantDir = path.join(uploadsRoot, subdomain);

  // Try tenant-specific directory first, then fall back to root uploads
  express.static(tenantDir)(req, res, () => {
    express.static(uploadsRoot)(req, res, next);
  });
});

// API routes
app.use('/api', apiRoutes);

// Auto-load content type APIs based on template folders
registerContentTypeApis(app).catch(err => {
  console.error('Failed to auto-load content type APIs:', err);
});

// Public site routes (must be last)
app.use('/', publicRoutes);

// Error handler (logs to per-tenant error.log)
app.use(errorLog);

// Initialize database and start server
initDb().then(() => {
  app.listen(PORT, () => {
    info('system', 'STARTUP', `WolfWave CMS running on http://localhost:${PORT}`);
    info('system', 'STARTUP', `Admin UI: http://localhost:5173 (dev) or http://localhost:${PORT}/admin (prod)`);
  });
}).catch(err => {
  logError('system', err, 'DB_INIT');
  process.exit(1);
});

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
