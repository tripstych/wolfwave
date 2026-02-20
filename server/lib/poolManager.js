import mysql from 'mysql2/promise';

const pools = new Map();

/**
 * Get or create a connection pool for the given database name.
 * Pools are cached and reused across requests.
 */
export function getPoolForDb(dbName) {
  if (pools.has(dbName)) {
    return pools.get(dbName);
  }

  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: dbName,
    waitForConnections: true,
    connectionLimit: parseInt(process.env.DB_POOL_LIMIT || '10', 10),
    queueLimit: 0
  });

  pools.set(dbName, pool);
  return pool;
}

/**
 * Close all cached connection pools (for graceful shutdown).
 */
export async function closeAllPools() {
  for (const [name, pool] of pools) {
    await pool.end();
  }
  pools.clear();
}

/**
 * Get the number of active pools (for monitoring).
 */
export function getActivePoolCount() {
  return pools.size;
}
