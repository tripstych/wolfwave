import jwt from 'jsonwebtoken';
import { query } from '../db/connection.js';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET is required in production');
  }
  console.warn('Warning: JWT_SECRET not set, using unsafe default for development');
}
const SAFE_JWT_SECRET = JWT_SECRET || 'dev-secret-change-in-production';

/**
 * Generate JWT token for user
 */
export function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    SAFE_JWT_SECRET,
    { expiresIn: '24h' }
  );
}

/**
 * Generate short-lived impersonation token
 */
export function generateImpersonationToken(tenantId) {
  return jwt.sign(
    { tenantId, type: 'impersonation' },
    SAFE_JWT_SECRET,
    { expiresIn: '1m' } // Very short lived
  );
}

/**
 * Verify JWT token
 */
export function verifyToken(token) {
  return jwt.verify(token, SAFE_JWT_SECRET);
}

/**
 * Auth middleware - requires valid token
 */
export function requireAuth(req, res, next) {
  const token = req.cookies.token || req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  try {
    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Admin middleware - requires admin role
 */
export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

/**
 * Editor middleware - requires editor or admin role
 */
export function requireEditor(req, res, next) {
  if (!['admin', 'editor'].includes(req.user?.role)) {
    return res.status(403).json({ error: 'Editor access required' });
  }
  next();
}

/**
 * Optional auth - attaches user if token present, but doesn't require it
 */
export function optionalAuth(req, res, next) {
  const token = req.cookies.token || req.headers.authorization?.replace('Bearer ', '');
  
  if (token) {
    try {
      req.user = verifyToken(token);
    } catch (err) {
      // Token invalid, continue without user
    }
  }
  
  next();
}

export default { generateToken, verifyToken, requireAuth, requireAdmin, requireEditor, optionalAuth };
