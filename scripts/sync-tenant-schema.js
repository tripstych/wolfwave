import 'dotenv/config';
import { execSync } from 'child_process';
import mysql from 'mysql2/promise';

/**
 * Syncs the Prisma schema to ALL tenant databases.
 */
async function syncAll() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'wolfwave_cms'
  });

  try {
    const [tenants] = await connection.execute('SELECT database_name FROM tenants');
    const dbs = tenants.map(t => t.database_name);
    
    if (!dbs.includes(process.env.DB_NAME)) dbs.push(process.env.DB_NAME);

    console.log(`Syncing schema to ${dbs.length} databases...`);

    for (const dbName of dbs) {
      console.log(`
Processing ${dbName}...`);
      const url = `mysql://${process.env.DB_USER || 'root'}:${process.env.DB_PASSWORD || ''}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 3306}/${dbName}`;
      
      try {
        execSync(`node_modules/.bin/prisma db push --skip-generate`, {
          env: { ...process.env, DATABASE_URL: url },
          stdio: 'inherit'
        });
        console.log(`✅ ${dbName} synced.`);
      } catch (err) {
        console.error(`❌ Failed to sync ${dbName}`);
      }
    }
  } finally {
    await connection.end();
    process.exit(0);
  }
}

syncAll();
