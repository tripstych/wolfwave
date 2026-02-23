import { query } from '../db/connection.js';
import bcrypt from 'bcryptjs';

/**
 * API Key authentication middleware.
 * Checks for X-API-Key header in format: pk_live_xxx:sk_live_xxx
 * Attaches apiKey info to req.apiKey if valid.
 * Falls through to next middleware if no API key header present.
 */
export function apiKeyAuth(req, res, next) {
  const apiKeyHeader = req.headers['x-api-key'];
  if (!apiKeyHeader) {
    return next();
  }

  const parts = apiKeyHeader.split(':');
  if (parts.length !== 2) {
    return res.status(401).json({ error: 'Invalid API key format. Expected pk_live_xxx:sk_live_xxx' });
  }

  const [publicKey, secretKey] = parts;

  // Validate asynchronously
  validateApiKey(publicKey, secretKey)
    .then(keyData => {
      if (!keyData) {
        return res.status(401).json({ error: 'Invalid API key' });
      }
      req.apiKey = keyData;
      // Also set req.user-like fields so existing route guards work
      if (keyData.user_id) {
        req.user = { id: keyData.user_id, role: 'api', apiKey: true };
      } else {
        req.user = { id: 0, role: 'admin', apiKey: true };
      }
      next();
    })
    .catch(err => {
      console.error('API key auth error:', err);
      res.status(500).json({ error: 'Authentication error' });
    });
}

async function validateApiKey(publicKey, secretKey) {
  const rows = await query(
    `SELECT id, name, public_key, secret_key_hash, type, user_id, permissions,
            expires_at, is_active
     FROM api_keys
     WHERE public_key = ?`,
    [publicKey]
  );

  if (rows.length === 0) return null;

  const key = rows[0];

  // Check active
  if (!key.is_active) return null;

  // Check expiry
  if (key.expires_at && new Date(key.expires_at) < new Date()) return null;

  // Verify secret
  const valid = await bcrypt.compare(secretKey, key.secret_key_hash);
  if (!valid) return null;

  // Update last_used_at (fire and forget)
  query('UPDATE api_keys SET last_used_at = NOW() WHERE id = ?', [key.id]).catch(() => {});

  return {
    id: key.id,
    name: key.name,
    type: key.type,
    user_id: key.user_id,
    permissions: typeof key.permissions === 'string' ? JSON.parse(key.permissions) : (key.permissions || [])
  };
}

/**
 * Middleware to check if the current request (via API key) has a specific permission scope.
 * Usage: requireScope('pages:read')
 */
export function requireScope(scope) {
  return (req, res, next) => {
    // If not using API key auth, skip scope check (JWT auth handles its own permissions)
    if (!req.apiKey) return next();

    // Site-level keys with no specific permissions get full access
    if (req.apiKey.type === 'site' && req.apiKey.permissions.length === 0) {
      return next();
    }

    if (!req.apiKey.permissions.includes(scope)) {
      return res.status(403).json({ error: `Missing required scope: ${scope}` });
    }

    next();
  };
}

export default { apiKeyAuth, requireScope };
