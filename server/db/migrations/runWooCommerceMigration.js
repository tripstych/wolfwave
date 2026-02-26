#!/usr/bin/env node

/**
 * Run WooCommerce Tables Migration
 * 
 * Creates all WooCommerce-compatible database tables
 */

import 'dotenv/config';
import { query } from '../connection.js';
import { woocommerceTables } from './woocommerce-tables.js';

async function runMigration() {
  try {
    console.log('🔄 Running WooCommerce tables migration...\n');
    
    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    for (const [index, migration] of woocommerceTables.entries()) {
      try {
        // Extract table name from CREATE TABLE statement
        const tableMatch = migration.match(/CREATE TABLE IF NOT EXISTS (\w+)/);
        const tableName = tableMatch ? tableMatch[1] : `Migration ${index + 1}`;

        process.stdout.write(`Creating ${tableName}... `);
        
        await query(migration);
        
        console.log('✅');
        successCount++;
      } catch (err) {
        if (err.code === 'ER_TABLE_EXISTS_ERROR') {
          console.log('⚠️  (already exists)');
          skipCount++;
        } else {
          console.log('❌');
          console.error(`   Error: ${err.message}`);
          errorCount++;
        }
      }
    }

    console.log('\n📊 Migration Summary:');
    console.log(`   ✅ Created: ${successCount}`);
    console.log(`   ⚠️  Skipped: ${skipCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    console.log(`   📝 Total: ${woocommerceTables.length}`);

    if (errorCount === 0) {
      console.log('\n✅ WooCommerce tables migration completed successfully!');
      console.log('\n📌 Next Steps:');
      console.log('   1. Create WooCommerce API keys in admin');
      console.log('   2. Sync existing products/orders: POST /api/woocommerce-sync/all');
      console.log('   3. Test with third-party integration (Zapier, ShipStation, etc.)');
    } else {
      console.log('\n⚠️  Migration completed with errors. Please review above.');
    }

    process.exit(errorCount > 0 ? 1 : 0);
  } catch (err) {
    console.error('\n❌ Migration failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

runMigration();
