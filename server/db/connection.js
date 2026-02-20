import { getCurrentDbName } from '../lib/tenantContext.js';
import { getPoolForDb } from '../lib/poolManager.js';
import { info, error as logError } from '../lib/logger.js';

export function getPool() {
  const dbName = getCurrentDbName();
  return getPoolForDb(dbName);
}

export async function query(sql, params = []) {
  const pool = getPool();
  const [rows] = await pool.execute(sql, params);
  return rows;
}

export async function initDb() {
  try {
    const pool = getPool();
    await pool.query('SELECT 1');
    info('system', 'DB', 'Database connection verified');
    return true;
  } catch (err) {
    logError('system', err, 'DB_CONNECT');
    throw err;
  }
}

export default { getPool, query, initDb };
