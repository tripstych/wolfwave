/**
 * WooCommerce OAuth 1.0a Authentication Middleware
 * 
 * Authenticates requests using consumer keys/secrets stored in woocommerce_api_keys table.
 * Compatible with WooCommerce's authentication scheme.
 */

import crypto from 'crypto';
import { queryRaw, executeRaw } from '../lib/queryRaw.js';

/**
 * Hash a consumer secret for secure storage.
 * Uses SHA256 which matches WooCommerce's approach.
 */
function hashSecret(secret) {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

/**
 * OAuth 1.0a signature verification
 * 
 * @param {object} req - Express request
 * @param {string} storedHashedSecret - The SHA256-hashed consumer secret from the DB
 */
function verifyOAuthSignature(req, storedHashedSecret) {
  const params = { ...req.query };
  
  // Extract OAuth parameters
  const oauthParams = {};
  for (const key in params) {
    if (key.startsWith('oauth_')) {
      oauthParams[key] = params[key];
    }
  }

  const signature = oauthParams.oauth_signature;
  if (!signature) return false;
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

  // Use the hashed secret as the signing key (clients must also use the hashed secret)
  const signingKey = `${encodeURIComponent(storedHashedSecret)}&`;
  const computedSignature = crypto
    .createHmac('sha256', signingKey)
    .update(signatureBaseString)
    .digest('base64');

  // Timing-safe comparison for the signature
  const sigBuf = Buffer.from(signature);
  const computedBuf = Buffer.from(computedSignature);
  return sigBuf.length === computedBuf.length
    && crypto.timingSafeEqual(sigBuf, computedBuf);
}

/**
 * Basic Auth verification (simpler alternative to OAuth)
 */
async function verifyBasicAuth(authHeader, req) {
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    console.log('[WC Auth] No Basic Auth header found');
    return null;
  }

  const credentials = Buffer.from(authHeader.substring(6), 'base64').toString();
  const [consumerKey, consumerSecret] = credentials.split(':');

  if (!consumerKey || !consumerSecret) {
    console.log('[WC Auth] Invalid credentials format');
    return null;
  }

  console.log(`[WC Auth] Looking up key: ...${consumerKey.slice(-7)}`);

  // Look up API key
  const results = await queryRaw(
    `SELECT * FROM woocommerce_api_keys WHERE consumer_key = ?`,
    consumerKey
  );
  const apiKey = results[0];

  if (!apiKey) {
    console.log('[WC Auth] API key not found in database');
    return null;
  }

  console.log(`[WC Auth] Found API key: ${apiKey.description}, permissions: ${apiKey.permissions}`);

  // Verify secret (compare hashed values using timing-safe comparison)
  const providedHash = hashSecret(consumerSecret);
  const storedHash = apiKey.consumer_secret;
  const hashesMatch = providedHash.length === storedHash.length
    && crypto.timingSafeEqual(Buffer.from(providedHash), Buffer.from(storedHash));
  if (!hashesMatch) {
    console.log('[WC Auth] Secret mismatch');
    return null;
  }

  console.log('[WC Auth] Secret verified');

  // Check permissions
  if (apiKey.permissions === 'read' && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    console.log(`[WC Auth] Permission denied: read-only key used for ${req.method}`);
    return null;
  }

  console.log('[WC Auth] Permissions OK');

  // Update last access
  await executeRaw(
    `UPDATE woocommerce_api_keys SET last_access = NOW() WHERE key_id = ?`,
    apiKey.key_id
  );

  console.log('[WC Auth] Authentication successful');
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
      apiKey = await verifyBasicAuth(authHeader, req);
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
    hashedSecret: hashSecret(consumerSecret),
    truncatedKey
  };
}

/**
 * Create a new WooCommerce API key
 */
export async function createWooCommerceApiKey(userId, description, permissions = 'read_write') {
  const { consumerKey, consumerSecret, hashedSecret, truncatedKey } = generateConsumerCredentials();

  // Store the hashed secret, not the plaintext
  await executeRaw(
    `INSERT INTO woocommerce_api_keys (
      user_id, description, permissions, consumer_key, consumer_secret, 
      truncated_key, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, NOW())`,
    userId, description, permissions, consumerKey, hashedSecret, truncatedKey
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
