/**
 * WooCommerce API Keys Management
 * Admin endpoints for creating and managing WooCommerce API keys
 */

import express from 'express';
import { 
  createWooCommerceApiKey, 
  listWooCommerceApiKeys, 
  revokeWooCommerceApiKey 
} from '../middleware/woocommerceAuth.js';

const router = express.Router();

/**
 * GET /api/woocommerce-keys
 * List all WooCommerce API keys
 */
router.get('/', async (req, res) => {
  try {
    const keys = await listWooCommerceApiKeys();
    // Convert BigInt to Number for JSON serialization
    const serializable = JSON.parse(JSON.stringify(keys, (key, value) =>
      typeof value === 'bigint' ? Number(value) : value
    ));
    // Ensure we always return an array
    res.json(Array.isArray(serializable) ? serializable : []);
  } catch (error) {
    console.error('Error listing WooCommerce keys:', error);
    console.error(error.stack);
    
    // If table doesn't exist, return empty array
    if (error.code === 'ER_NO_SUCH_TABLE' || error.message.includes("doesn't exist")) {
      return res.json([]);
    }
    
    res.status(500).json({ error: 'Failed to list API keys', details: error.message });
  }
});

/**
 * POST /api/woocommerce-keys
 * Create a new WooCommerce API key
 */
router.post('/', async (req, res) => {
  try {
    console.log('POST /api/woocommerce-keys - req.body:', req.body);
    const { description, permissions } = req.body;

    if (!description) {
      return res.status(400).json({ error: 'Description is required', receivedBody: req.body });
    }

    const validPermissions = ['read', 'write', 'read_write'];
    if (permissions && !validPermissions.includes(permissions)) {
      return res.status(400).json({ error: 'Invalid permissions value' });
    }

    const userId = req.user?.id || 1; // Default to admin user
    const apiKey = await createWooCommerceApiKey(userId, description, permissions || 'read_write');

    console.log(`Created API key: ${apiKey.description} (key_id=${apiKey.keyId})`);
    res.status(201).json(apiKey);
  } catch (error) {
    console.error('Error creating WooCommerce key:', error);
    res.status(500).json({ error: 'Failed to create API key' });
  }
});

/**
 * DELETE /api/woocommerce-keys/:keyId
 * Revoke a WooCommerce API key
 */
router.delete('/:keyId', async (req, res) => {
  try {
    const keyId = parseInt(req.params.keyId);

    if (!keyId) {
      return res.status(400).json({ error: 'Invalid key ID' });
    }

    await revokeWooCommerceApiKey(keyId);
    res.json({ success: true, message: 'API key revoked' });
  } catch (error) {
    console.error('Error revoking WooCommerce key:', error);
    res.status(500).json({ error: 'Failed to revoke API key' });
  }
});

export default router;
