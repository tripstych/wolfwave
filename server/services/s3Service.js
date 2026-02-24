import { S3Client, PutObjectCommand, DeleteObjectCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import { STSClient, AssumeRoleCommand } from '@aws-sdk/client-sts';
import { getCurrentDbName } from '../lib/tenantContext.js';
import { query } from '../db/connection.js';
import { runWithTenant } from '../lib/tenantContext.js';

// Cache assumed-role credentials per config key to avoid excessive STS calls
const credentialsCache = new Map();

/**
 * Read S3 settings from the current tenant's settings table.
 * If not configured, falls back to the default/admin tenant's settings.
 * Returns null if S3 is not configured anywhere.
 */
export async function getS3Config() {
  let config = await readS3Settings();

  // Fallback to default tenant if current tenant has no S3 config
  if (!config && getCurrentDbName() !== (process.env.DB_NAME || 'wolfwave_default')) {
    config = await readS3SettingsFromDb(process.env.DB_NAME || 'wolfwave_default');
  }

  return config;
}

/**
 * Read S3 settings from the current tenant context.
 */
async function readS3Settings() {
  const rows = await query(
    "SELECT setting_key, setting_value FROM settings WHERE setting_key LIKE 's3_%'"
  );
  return parseS3Rows(rows);
}

/**
 * Read S3 settings from a specific database (used for fallback to default tenant).
 */
async function readS3SettingsFromDb(dbName) {
  return new Promise((resolve) => {
    runWithTenant(dbName, async () => {
      const rows = await query(
        "SELECT setting_key, setting_value FROM settings WHERE setting_key LIKE 's3_%'"
      );
      resolve(parseS3Rows(rows));
    });
  });
}

/**
 * Parse settings rows into a config object. Returns null if bucket is not set.
 * Supports two auth methods: "access_key" (simple) and "role" (IAM role assumption).
 */
function parseS3Rows(rows) {
  if (!rows || rows.length === 0) return null;

  const map = {};
  for (const row of rows) {
    map[row.setting_key] = row.setting_value;
  }

  if (!map.s3_bucket_name) return null;

  const authMethod = map.s3_auth_method || 'access_key';

  if (authMethod === 'role') {
    if (!map.s3_role_arn || !map.s3_external_id) return null;
    return {
      bucket: map.s3_bucket_name,
      region: map.s3_region || 'us-east-1',
      authMethod: 'role',
      roleArn: map.s3_role_arn,
      externalId: map.s3_external_id,
      prefix: map.s3_prefix || '',
    };
  }

  // access_key method
  if (!map.s3_access_key_id || !map.s3_secret_access_key) return null;
  return {
    bucket: map.s3_bucket_name,
    region: map.s3_region || 'us-east-1',
    authMethod: 'access_key',
    accessKeyId: map.s3_access_key_id,
    secretAccessKey: map.s3_secret_access_key,
    prefix: map.s3_prefix || '',
  };
}

/**
 * Get an S3 client using either access keys or IAM role assumption.
 */
export async function getS3Client(config) {
  if (config.authMethod === 'access_key') {
    return new S3Client({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  // Role assumption with external ID
  const cacheKey = `${config.roleArn}:${config.externalId}`;
  const cached = credentialsCache.get(cacheKey);

  let credentials;
  if (cached && cached.expiration > Date.now() + 5 * 60 * 1000) {
    credentials = cached.credentials;
  } else {
    const sts = new STSClient({ region: config.region });
    const response = await sts.send(new AssumeRoleCommand({
      RoleArn: config.roleArn,
      RoleSessionName: `wolfwave-${Date.now()}`,
      ExternalId: config.externalId,
      DurationSeconds: 3600,
    }));

    credentials = {
      accessKeyId: response.Credentials.AccessKeyId,
      secretAccessKey: response.Credentials.SecretAccessKey,
      sessionToken: response.Credentials.SessionToken,
    };

    credentialsCache.set(cacheKey, {
      credentials,
      expiration: response.Credentials.Expiration.getTime(),
    });
  }

  return new S3Client({
    region: config.region,
    credentials,
  });
}

/**
 * Build the full S3 object key, incorporating the tenant prefix.
 */
export function buildS3Key(config, relativePath) {
  const dbName = getCurrentDbName();
  const tenantName = dbName.replace(/^wolfwave_/, '') || '_default';
  const prefix = config.prefix || tenantName;
  return `${prefix}/${relativePath}`.replace(/\/+/g, '/');
}

/**
 * Upload a buffer to S3.
 * Returns the full S3 URL.
 */
export async function uploadToS3(config, buffer, relativePath, contentType) {
  const client = await getS3Client(config);
  const key = buildS3Key(config, relativePath);

  await client.send(new PutObjectCommand({
    Bucket: config.bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }));

  return getS3Url(config, key);
}

/**
 * Delete an object from S3.
 */
export async function deleteFromS3(config, key) {
  const client = await getS3Client(config);
  await client.send(new DeleteObjectCommand({
    Bucket: config.bucket,
    Key: key,
  }));
}

/**
 * Get the public URL for an S3 object.
 */
export function getS3Url(config, key) {
  return `https://${config.bucket}.s3.${config.region}.amazonaws.com/${key}`;
}

/**
 * Extract the S3 key from a full S3 URL.
 */
export function extractS3Key(url, config) {
  const prefix = `https://${config.bucket}.s3.${config.region}.amazonaws.com/`;
  if (url.startsWith(prefix)) {
    return url.slice(prefix.length);
  }
  return null;
}

/**
 * Test S3 connection by creating a client and checking bucket access.
 */
export async function testS3Connection(config) {
  const client = await getS3Client(config);
  await client.send(new HeadBucketCommand({ Bucket: config.bucket }));
  return true;
}
