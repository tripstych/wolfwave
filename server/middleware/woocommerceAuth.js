/**
 * WooCommerce OAuth 1.0a Authentication Middleware
 * 
 * Authenticates requests using consumer keys/secrets stored in woocommerce_api_keys table.
 * Compatible with WooCommerce's authentication scheme.
 */

import crypto from 'crypto';
import prisma from '../lib/prisma.js';

/**
 * Helper to execute raw SQL queries safely
 */
async function queryRaw(sql, ...params) {
  try {
    const results = await prisma.$queryRawUnsafe(sql, ...params);
    // Convert BigInt to Number for JSON serialization
    const converted = JSON.parse(JSON.stringify(results, (key, value) =>
      typeof value === 'bigint' ? Number(value) : value
    ));
    return Array.isArray(converted) ? converted : [];
  } catch (error) {
    console.error('Query error:', error);
    throw error;
  }
}

async function executeRaw(sql, ...params) {
  return await prisma.$executeRawUnsafe(sql, ...params);
}

/**
 * OAuth 1.0a signature verification
 */
function verifyOAuthSignature(req, consumerSecret) {
  const params = { ...req.query };
  
  // Extract OAuth parameters
  const oauthParams = {};
  for (const key in params) {
    if (key.startsWith('oauth_')) {
      oauthParams[key] = params[key];
    }
  }

  const signature = oauthParams.oauth_signature;
  delete oauthParams.oauth_signature;

  // Build signature base string
  const method = req.method.toUpperCase();
  const url = `${req.protocol}://${req.get('host')}${req.path}`;
  
  // Combine all parameters
  const allParams = { ...params };
  delete allParams.oauth_signature;

  // Sort parameters
  const sortedParams = Object.keys(allParams)
    .sort()
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(allParams[key])}`)
    .join('&');

  const signatureBaseString = [
    method,
    encodeURIComponent(url),
    encodeURIComponent(sortedParams)
  ].join('&');

  // Create signature
  const signingKey = `${encodeURIComponent(consumerSecret)}&`;
  const computedSignature = crypto
    .createHmac('sha256', signingKey)
    .update(signatureBaseString)
    .digest('base64');

  return signature === computedSignature;
}

/**
 * Basic Auth verification (simpler alternative to OAuth)
 */
async function verifyBasicAuth(authHeader) {
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return null;
  }

  const credentials = Buffer.from(authHeader.substring(6), 'base64').toString();
  const [consumerKey, consumerSecret] = credentials.split(':');

  if (!consumerKey || !consumerSecret) {
    return null;
  }

  // Look up API key
  const results = await queryRaw(
    `SELECT * FROM woocommerce_api_keys WHERE consumer_key = ?`,
    consumerKey
  );
  const apiKey = results[0];

  if (!apiKey) {
    return null;
  }

  // Verify secret
  if (apiKey.consumer_secret !== consumerSecret) {
    return null;
  }

  // Check permissions
  if (apiKey.permissions === 'read' && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return null;
  }

  // Update last access
  await executeRaw(
    `UPDATE woocommerce_api_keys SET last_access = NOW() WHERE key_id = ?`,
    apiKey.key_id
  );

  return apiKey;
}

/**
 * OAuth 1.0a verification
 */
async function verifyOAuth(req) {
  const consumerKey = req.query.oauth_consumer_key;

  if (!consumerKey) {
    return null;
  }

  // Look up API key
  const results = await queryRaw(
    `SELECT * FROM woocommerce_api_keys WHERE consumer_key = ?`,
    consumerKey
  );
  const apiKey = results[0];

  if (!apiKey) {
    return null;
  }

  // Verify signature
  if (!verifyOAuthSignature(req, apiKey.consumer_secret)) {
    return null;
  }

  // Check permissions
  if (apiKey.permissions === 'read' && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return null;
  }

  // Update last access
  await executeRaw(
    `UPDATE woocommerce_api_keys SET last_access = NOW() WHERE key_id = ?`,
    apiKey.key_id
  );

  return apiKey;
}

/**
 * Main authentication middleware
 */
export async function authenticateWooCommerce(req, res, next) {
  try {
    const authHeader = req.get('Authorization');
    let apiKey = null;

    // Try Basic Auth first (most common for REST API)
    if (authHeader && authHeader.startsWith('Basic ')) {
      apiKey = await verifyBasicAuth(authHeader);
    }
    // Try OAuth 1.0a
    else if (req.query.oauth_consumer_key) {
      apiKey = await verifyOAuth(req);
    }

    if (!apiKey) {
      return res.status(401).json({
        code: 'woocommerce_rest_cannot_view',
        message: 'Sorry, you cannot list resources.',
        data: { status: 401 }
      });
    }

    // Attach API key info to request
    req.woocommerceAuth = {
      keyId: apiKey.key_id,
      userId: apiKey.user_id,
      permissions: apiKey.permissions,
      description: apiKey.description
    };

    next();
  } catch (error) {
    console.error('WooCommerce Auth Error:', error);
    res.status(500).json({
      code: 'woocommerce_rest_authentication_error',
      message: 'Authentication error',
      data: { status: 500 }
    });
  }
}

/**
 * Generate consumer key and secret
 */
export function generateConsumerCredentials() {
  const consumerKey = 'ck_' + crypto.randomBytes(32).toString('hex');
  const consumerSecret = 'cs_' + crypto.randomBytes(21).toString('hex');
  const truncatedKey = consumerKey.substring(consumerKey.length - 7);

  return {
    consumerKey,
    consumerSecret,
    truncatedKey
  };
}

/**
 * Create a new WooCommerce API key
 */
export async function createWooCommerceApiKey(userId, description, permissions = 'read_write') {
  const { consumerKey, consumerSecret, truncatedKey } = generateConsumerCredentials();

  await executeRaw(
    `INSERT INTO woocommerce_api_keys (
      user_id, description, permissions, consumer_key, consumer_secret, 
      truncated_key, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, NOW())`,
    userId, description, permissions, consumerKey, consumerSecret, truncatedKey
  );
  
  // Get the inserted ID
  const [inserted] = await queryRaw(
    `SELECT key_id FROM woocommerce_api_keys WHERE consumer_key = ?`,
    consumerKey
  );

  return {
    keyId: inserted?.key_id || 0,
    consumerKey,
    consumerSecret,
    truncatedKey,
    permissions,
    description
  };
}

/**
 * List all API keys for a user
 */
export async function listWooCommerceApiKeys(userId = null) {
  let sql = `SELECT key_id, user_id, description, permissions, truncated_key, last_access, created_at 
             FROM woocommerce_api_keys`;
  const params = [];

  if (userId) {
    sql += ` WHERE user_id = ?`;
    params.push(userId);
  }

  sql += ` ORDER BY created_at DESC`;

  return await queryRaw(sql, ...params);
}

/**
 * Revoke (delete) an API key
 */
export async function revokeWooCommerceApiKey(keyId) {
  await executeRaw(`DELETE FROM woocommerce_api_keys WHERE key_id = ?`, keyId);
}

export default authenticateWooCommerce;
