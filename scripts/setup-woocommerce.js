#!/usr/bin/env node

/**
 * WooCommerce Compatibility Setup Script
 * 
 * Runs migration and initial sync in one command
 */

import 'dotenv/config';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('🚀 WooCommerce Compatibility Setup\n');

try {
  // Step 1: Run migration
  console.log('📦 Step 1: Creating WooCommerce tables...');
  execSync('node server/db/migrations/runWooCommerceMigration.js', {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..')
  });

  console.log('\n✅ WooCommerce tables created successfully!\n');

  // Step 2: Instructions for next steps
  console.log('📋 Next Steps:\n');
  console.log('1. Start your server:');
  console.log('   npm start\n');
  console.log('2. Create an API key:');
  console.log('   POST http://localhost:3000/api/woocommerce-keys');
  console.log('   Body: { "description": "My Integration", "permissions": "read_write" }\n');
  console.log('3. Sync existing data:');
  console.log('   POST http://localhost:3000/api/woocommerce-sync/all\n');
  console.log('4. Test the WooCommerce API:');
  console.log('   GET http://localhost:3000/wp-json/wc/v3/products');
  console.log('   (Use Basic Auth with your consumer key/secret)\n');
  console.log('📖 Full documentation: WOOCOMMERCE_COMPATIBILITY.md\n');

} catch (error) {
  console.error('\n❌ Setup failed:', error.message);
  process.exit(1);
}
