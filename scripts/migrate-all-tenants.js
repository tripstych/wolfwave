import 'dotenv/config';
import { query } from '../server/db/connection.js';
import { runWithTenant } from '../server/lib/tenantContext.js';
import mysql from 'mysql2/promise';

/**
 * This script migrates ALL tenant databases to include the new importer tables.
 * Prisma Migrate only handles the primary DB in the connection string.
 */

const IMPORT_TABLES_SQL = [
  `CREATE TABLE IF NOT EXISTS imported_sites (
    id INT AUTO_INCREMENT PRIMARY KEY,
    root_url VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    page_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS imported_pages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    site_id INT NOT NULL,
    url VARCHAR(255) NOT NULL,
    title VARCHAR(255),
    raw_html LONGTEXT,
    structural_hash VARCHAR(64),
    metadata JSON,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (site_id) REFERENCES imported_sites(id) ON DELETE CASCADE,
    INDEX idx_site_id (site_id),
    INDEX idx_structural_hash (structural_hash)
  )`
];

async function migrateAll() {
  // 1. Get all tenants from the primary DB
  // We use a direct connection to the primary DB to avoid tenant resolution logic
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'wolfwave_cms'
  });

  try {
    const [tenants] = await connection.execute('SELECT database_name FROM tenants');
    const tenantDbs = tenants.map(t => t.database_name);
    
    // Also include the primary/default DB
    if (!tenantDbs.includes(process.env.DB_NAME)) {
      tenantDbs.push(process.env.DB_NAME);
    }

    console.log(`Found ${tenantDbs.length} databases to migrate.`);

    for (const dbName of tenantDbs) {
      console.log(`Migrating database: ${dbName}...`);
      
      const dbConn = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: dbName
      });

      try {
        for (const sql of IMPORT_TABLES_SQL) {
          await dbConn.execute(sql);
          console.log(`  ✓ SQL executed`);
        }
        console.log(`  ✅ ${dbName} is up to date.`);
      } catch (err) {
        console.error(`  ❌ Failed to migrate ${dbName}:`, err.message);
      } finally {
        await dbConn.end();
      }
    }

    console.log('All tenant migrations finished.');

  } catch (err) {
    console.error('Critical migration error:', err);
  } finally {
    await connection.end();
    process.exit(0);
  }
}

migrateAll();
