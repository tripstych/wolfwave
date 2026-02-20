import 'dotenv/config';
import { query } from '../db/connection.js';

const migrations = [
  // Add subscription_only to products table
  `ALTER TABLE products ADD COLUMN subscription_only BOOLEAN DEFAULT FALSE`,

  // Add digital product fields to products table
  `ALTER TABLE products
   ADD COLUMN is_digital BOOLEAN DEFAULT FALSE AFTER requires_shipping,
   ADD COLUMN download_url VARCHAR(500) AFTER is_digital,
   ADD COLUMN download_limit INT DEFAULT 5 AFTER download_url,
   ADD COLUMN download_expiry_days INT DEFAULT 30 AFTER download_limit`,

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

  // Add subscription_only to pages
  `ALTER TABLE pages ADD COLUMN subscription_only BOOLEAN DEFAULT FALSE`,

  // Add stripe_customer_id to customers
  `ALTER TABLE customers ADD COLUMN stripe_customer_id VARCHAR(255)`
];

async function migrate() {
  try {
    console.log('Running database migrations...');
    
    for (const migration of migrations) {
      try {
        await query(migration);
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
