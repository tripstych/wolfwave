import { Router } from 'express';
import { query } from '../db/connection.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

const router = Router();

// All available permission scopes
const VALID_SCOPES = [
  'pages:read', 'pages:write',
  'products:read', 'products:write',
  'orders:read', 'orders:write',
  'customers:read', 'customers:write',
  'content:read', 'content:write',
  'media:read', 'media:write',
  'settings:read', 'settings:write',
  'menus:read', 'menus:write'
];

function generatePublicKey() {
  return 'pk_live_' + crypto.randomBytes(24).toString('hex');
}

function generateSecretKey() {
  return 'sk_live_' + crypto.randomBytes(32).toString('hex');
}

// Get all API keys (admins see all, users see only their own)
router.get('/', requireAuth, async (req, res) => {
  try {
    let keys;
    if (req.user.role === 'admin') {
      keys = await query(
        `SELECT ak.id, ak.name, ak.public_key, ak.type, ak.user_id, ak.permissions,
                ak.last_used_at, ak.expires_at, ak.is_active, ak.created_at,
                u.name as user_name, u.email as user_email
         FROM api_keys ak
         LEFT JOIN users u ON ak.user_id = u.id
         ORDER BY ak.created_at DESC`
      );
    } else {
      keys = await query(
        `SELECT id, name, public_key, type, user_id, permissions,
                last_used_at, expires_at, is_active, created_at
         FROM api_keys
         WHERE user_id = ?
         ORDER BY created_at DESC`,
        [req.user.id]
      );
    }

    // Parse permissions JSON
    keys = keys.map(k => ({
      ...k,
      permissions: typeof k.permissions === 'string' ? JSON.parse(k.permissions) : (k.permissions || [])
    }));

    res.json(keys);
  } catch (err) {
    console.error('Get API keys error:', err);
    res.status(500).json({ error: 'Failed to get API keys' });
  }
});

// Get available scopes
router.get('/scopes', requireAuth, (req, res) => {
  res.json(VALID_SCOPES);
});

// Create a new API key
router.post('/', requireAuth, async (req, res) => {
  try {
    const { name, type = 'site', user_id, permissions = [], expires_at } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }

    // Only admins can create site-level keys
    if (type === 'site' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can create site-level keys' });
    }

    // Non-admins can only create keys for themselves
    const keyUserId = type === 'user'
      ? (req.user.role === 'admin' ? (user_id || req.user.id) : req.user.id)
      : null;

    // Validate permissions
    const validPerms = permissions.filter(p => VALID_SCOPES.includes(p));

    const publicKey = generatePublicKey();
    const secretKey = generateSecretKey();
    const secretHash = await bcrypt.hash(secretKey, 10);

    await query(
      `INSERT INTO api_keys (name, public_key, secret_key_hash, type, user_id, permissions, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        name.trim(),
        publicKey,
        secretHash,
        type,
        keyUserId,
        JSON.stringify(validPerms),
        expires_at || null
      ]
    );

    // Return the secret key ONCE - it cannot be retrieved again
    res.status(201).json({
      public_key: publicKey,
      secret_key: secretKey,
      name: name.trim(),
      type,
      permissions: validPerms,
      message: 'Store your secret key now. It will not be shown again.'
    });
  } catch (err) {
    console.error('Create API key error:', err);
    res.status(500).json({ error: 'Failed to create API key' });
  }
});

// Update an API key (name, permissions, active status, expiry)
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, permissions, is_active, expires_at } = req.body;

    // Check ownership
    const [existing] = await query('SELECT * FROM api_keys WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ error: 'API key not found' });
    }

    // Non-admins can only update their own keys
    if (req.user.role !== 'admin' && existing.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const updates = [];
    const params = [];

    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name.trim());
    }
    if (permissions !== undefined) {
      const validPerms = permissions.filter(p => VALID_SCOPES.includes(p));
      updates.push('permissions = ?');
      params.push(JSON.stringify(validPerms));
    }
    if (is_active !== undefined) {
      updates.push('is_active = ?');
      params.push(is_active ? 1 : 0);
    }
    if (expires_at !== undefined) {
      updates.push('expires_at = ?');
      params.push(expires_at || null);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    params.push(id);
    await query(`UPDATE api_keys SET ${updates.join(', ')} WHERE id = ?`, params);

    res.json({ success: true });
  } catch (err) {
    console.error('Update API key error:', err);
    res.status(500).json({ error: 'Failed to update API key' });
  }
});

// Delete an API key
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    // Check ownership
    const [existing] = await query('SELECT * FROM api_keys WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ error: 'API key not found' });
    }

    // Non-admins can only delete their own keys
    if (req.user.role !== 'admin' && existing.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await query('DELETE FROM api_keys WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete API key error:', err);
    res.status(500).json({ error: 'Failed to delete API key' });
  }
});

export default router;
