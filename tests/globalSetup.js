import 'dotenv/config';
import mysql from 'mysql2/promise';
import { execSync } from 'child_process';

const TEST_DB = process.env.TEST_DB_NAME || 'wolfwave_test';

export async function setup() {
  // Create the test database if it doesn't exist
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || ''
  });

  try {
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${TEST_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  } finally {
    await conn.end();
  }

  // Push Prisma schema to test database
  const dbUrl = `mysql://${process.env.DB_USER || 'root'}:${process.env.DB_PASSWORD || ''}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 3306}/${TEST_DB}`;
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    env: { ...process.env, DATABASE_URL: dbUrl },
    stdio: 'ignore'
  });

  // Seed minimum required data
  const seedConn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: TEST_DB
  });

  try {
    await seedConn.query(
      `INSERT INTO content_types (name, label, plural_label, icon, menu_order, has_status, has_seo, is_system)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE label = VALUES(label)`,
      ['widgets', 'Widget', 'Widgets', 'Puzzle', 4, false, false, true]
    );
  } finally {
    await seedConn.end();
  }
}
