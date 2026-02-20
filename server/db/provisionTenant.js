import mysql from 'mysql2/promise';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Provision a new tenant database.
 * Creates the database and runs all migration scripts against it.
 *
 * @param {string} subdomain - The tenant subdomain (e.g., "shop1" -> database "webwolf_shop1")
 * @param {string} adminEmail - Initial admin email
 * @param {string} adminPassword - Initial admin password
 * @returns {string} The created database name
 */
export async function provisionTenant(subdomain, adminEmail, adminPassword) {
  // Validate tenant name (alphanumeric + hyphens only)
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(subdomain)) {
    throw new Error('Tenant name must be lowercase alphanumeric with optional hyphens, cannot start/end with a hyphen');
  }

  const dbName = `webwolf_${subdomain}`;

  // Create the database
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || ''
  });

  try {
    // Check if database already exists
    const [rows] = await conn.query(
      'SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?',
      [dbName]
    );
    if (rows.length > 0) {
      throw new Error(`Database "${dbName}" already exists`);
    }

    await conn.query(`CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    console.log(`Created database: ${dbName}`);
  } finally {
    await conn.end();
  }

  // Run migration via Prisma for the new database
  const env = { 
    ...process.env, 
    DATABASE_URL: `mysql://${process.env.DB_USER || 'root'}:${process.env.DB_PASSWORD || ''}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 3306}/${dbName}`
  };
  const projectRoot = path.resolve(__dirname, '../..');

  try {
    console.log(`Pushing Prisma schema to ${dbName}...`);
    execSync(`node_modules/.bin/prisma db push --skip-generate`, {
      env,
      cwd: projectRoot,
      stdio: 'inherit'
    });

    // Run custom migrations if any (like the importer tables)
    // We can also just run our migrate-all-tenants logic for this specific DB
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

    const tenantConn = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: dbName
    });

    try {
      console.log(`Running importer table migrations for ${dbName}...`);
      for (const sql of IMPORT_TABLES_SQL) {
        await tenantConn.execute(sql);
      }

      await tenantConn.query(
        `INSERT INTO settings (setting_key, setting_value) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
        ['active_theme', 'default']
      );

      // Seed the initial admin user (defaults to admin@example.com / admin123)
      const finalEmail = adminEmail || 'admin@example.com';
      const finalPassword = adminPassword || 'admin123';
      
      console.log(`Seeding initial admin user ${finalEmail}...`);
      const hashedPassword = await bcrypt.hash(finalPassword, 10);
      await tenantConn.query(
        `INSERT INTO users (email, password, name, role) VALUES (?, ?, ?, ?)`,
        [finalEmail, hashedPassword, 'Admin', 'admin']
      );
    } finally {
      await tenantConn.end();
    }

    // Create per-tenant uploads directory
    const uploadsDir = path.join(projectRoot, 'uploads', subdomain);
    fs.mkdirSync(uploadsDir, { recursive: true });

    console.log(`Tenant "${subdomain}" provisioned successfully (database: ${dbName})`);
  } catch (err) {
    // If migrations fail, drop the database to avoid a broken state
    const cleanupConn = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || ''
    });
    try {
      await cleanupConn.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
      console.error(`Rolled back: dropped database ${dbName}`);
    } finally {
      await cleanupConn.end();
    }
    throw new Error(`Failed to run migrations for ${dbName}: ${err.message}`);
  }

  return dbName;
}
