import 'dotenv/config';
import { getPoolForDb } from '../lib/poolManager.js';
import { woocommerceTables } from './migrations/woocommerce-tables.js';

// Get the database name from environment or default
const dbName = process.env.DB_NAME || 'wolfwave_default';

const migrations = [
  // Add access_rules to products table
  `ALTER TABLE products ADD COLUMN IF NOT EXISTS access_rules JSON`,

  // Add digital product fields to products table
  `ALTER TABLE products
   ADD COLUMN IF NOT EXISTS is_digital BOOLEAN DEFAULT FALSE AFTER requires_shipping,
   ADD COLUMN IF NOT EXISTS download_url VARCHAR(500) AFTER is_digital,
   ADD COLUMN IF NOT EXISTS download_limit INT DEFAULT 5 AFTER download_url,
   ADD COLUMN IF NOT EXISTS download_expiry_days INT DEFAULT 30 AFTER download_limit`,

  // Create digital downloads tracking table
  `CREATE TABLE IF NOT EXISTS digital_downloads (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    product_id INT NOT NULL,
    customer_id INT NOT NULL,
    download_url VARCHAR(500) NOT NULL,
    download_count INT DEFAULT 0,
    download_limit INT NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
  )`,

  // Add access_rules to pages
  `ALTER TABLE pages ADD COLUMN IF NOT EXISTS access_rules JSON`,

  // Add access_rules to blocks
  `ALTER TABLE blocks ADD COLUMN IF NOT EXISTS access_rules JSON`,

  // Add stripe_customer_id to customers
  `ALTER TABLE customers ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255)`,

  // Create API keys table for site-level and per-user API access
  `CREATE TABLE IF NOT EXISTS api_keys (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    public_key VARCHAR(64) NOT NULL UNIQUE,
    secret_key_hash VARCHAR(255) NOT NULL,
    type ENUM('site', 'user') NOT NULL DEFAULT 'site',
    user_id INT NULL,
    permissions JSON,
    last_used_at TIMESTAMP NULL,
    expires_at TIMESTAMP NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,

  // WooCommerce compatibility tables
  ...woocommerceTables
];

async function migrate() {
  try {
    console.log(`Running database migrations on ${dbName}...`);
    const pool = getPoolForDb(dbName);
    
    for (const migration of migrations) {
      try {
        await pool.query(migration);
        console.log('✓ Migration executed successfully');
      } catch (err) {
        if (err.code === 'ER_DUP_COLUMNNAME' || err.code === 'ER_TABLE_EXISTS_ERROR') {
          console.log('⚠ Migration already applied, skipping...');
        } else {
          console.error('✗ Migration failed:', err.message);
          throw err;
        }
      }
    }
    
    console.log('All migrations completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

// Run migrations if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  migrate();
}

export { migrate };
