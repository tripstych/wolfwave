import { AsyncLocalStorage } from 'node:async_hooks';

const tenantStorage = new AsyncLocalStorage();

/**
 * Run a callback within a tenant context.
 * All calls to query() and Prisma within the callback will use the specified database.
 */
export function runWithTenant(dbName, callback) {
  return tenantStorage.run({ dbName }, callback);
}

/**
 * Get the current tenant's database name.
 * Falls back to DB_NAME env var when called outside a request context (startup, CLI, etc.)
 */
export function getCurrentDbName() {
  const store = tenantStorage.getStore();
  return store?.dbName || process.env.DB_NAME || 'webwolf_default';
}

export default tenantStorage;
