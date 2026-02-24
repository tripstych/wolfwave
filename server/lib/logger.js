import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logsRoot = path.join(__dirname, '../../logs');

// Store original console methods BEFORE any patching happens
// so the logger never triggers the consolePatch (infinite recursion)
const _console = {
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

// Log Levels
export const Levels = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  NONE: 4
};

// Current system log level
const CURRENT_LEVEL = process.env.LOG_LEVEL !== undefined 
  ? (Levels[process.env.LOG_LEVEL.toUpperCase()] ?? Levels.INFO)
  : Levels.INFO;

// Ensure base logs dir exists
if (!fs.existsSync(logsRoot)) {
  fs.mkdirSync(logsRoot, { recursive: true });
}

// Cache open write streams per tenant + type
const streams = {};

function getStream(tenant, type) {
  const key = `${tenant}:${type}`;
  if (!streams[key]) {
    const tenantDir = path.join(logsRoot, tenant);
    if (!fs.existsSync(tenantDir)) {
      fs.mkdirSync(tenantDir, { recursive: true });
    }
    streams[key] = fs.createWriteStream(path.join(tenantDir, `${type}.log`), { flags: 'a' });
  }
  return streams[key];
}

function timestamp() {
  return new Date().toISOString();
}

function tenantName(req) {
  if (!req) return 'system';
  // Strip "wolfwave_" prefix for cleaner directory names
  const db = req.tenantDb || 'system';
  return db.replace(/^wolfwave_/, '') || 'system';
}

function formatMsg(level, context, msg, req = null) {
  const t = timestamp();
  const ctx = context ? `[${context}] ` : '';
  const reqInfo = req ? `${req.method} ${req.originalUrl} - ` : '';
  return `${t} ${level.padEnd(5)} ${ctx}${reqInfo}${msg}\n`;
}

/**
 * Core logging function
 */
export function log(level, reqOrTenant, context, msg) {
  const numericLevel = Levels[level];
  if (numericLevel < CURRENT_LEVEL) return;

  const tenant = (typeof reqOrTenant === 'string') ? reqOrTenant : tenantName(reqOrTenant);
  const req = (typeof reqOrTenant === 'object') ? reqOrTenant : null;
  
  const line = formatMsg(level, context, msg, req);
  
  // Write to console in dev or for high levels (use original console to avoid recursion with consolePatch)
  if (process.env.NODE_ENV !== 'production' || numericLevel >= Levels.INFO) {
    if (numericLevel >= Levels.ERROR) _console.error(line.trim());
    else if (numericLevel >= Levels.WARN) _console.warn(line.trim());
    else _console.log(line.trim());
  }

  // Error and higher go to error.log, others to access.log or combined
  const logType = numericLevel >= Levels.WARN ? 'error' : 'access';
  getStream(tenant, logType).write(line);
}

export const debug = (req, ctx, msg) => log('DEBUG', req, ctx, msg);
export const info = (req, ctx, msg) => log('INFO', req, ctx, msg);
export const warn = (req, ctx, msg) => log('WARN', req, ctx, msg);
export const error = (req, err, ctx) => {
  const msg = err.stack || err.message || err;
  log('ERROR', req, ctx, msg);
};

// Legacy compatibility aliases
export const logInfo = info;
export const logError = error;

/**
 * Access log middleware
 */
export function accessLog(req, res, next) {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const msg = `${res.statusCode} ${duration}ms ${req.ip}`;
    // We use a specific context for access logs
    log('INFO', req, 'ACCESS', msg);
  });

  next();
}

/**
 * Express error-handling middleware
 */
export function errorLog(err, req, res, next) {
  error(req, err, 'UNHANDLED');
  
  // If headers already sent, delegate to default express error handler
  if (res.headersSent) {
    return next(err);
  }

  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
}

/**
 * Close all open log streams
 */
export function closeLogs() {
  for (const key of Object.keys(streams)) {
    streams[key].end();
    delete streams[key];
  }
}
