#!/usr/bin/env node

/**
 * Sync CSS files from templates/css directory to the database
 * Usage: node scripts/sync-stylesheets.js
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { query, initDb, closeDb } from '../server/db/connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMPLATES_DIR = path.join(__dirname, '../templates');
const CSS_DIR = path.join(TEMPLATES_DIR, 'css');

async function syncStylesheets() {
  try {
    console.log('🎨 Syncing stylesheets from filesystem to database...\n');

    await initDb();

    // Check if directory exists
    try {
      await fs.access(CSS_DIR);
    } catch {
      console.error('❌ CSS directory not found:', CSS_DIR);
      process.exit(1);
    }

    const files = await fs.readdir(CSS_DIR);
    const cssFiles = files.filter(f => f.endsWith('.css'));

    console.log(`Found ${cssFiles.length} CSS files in templates/css/\n`);

    let synced = 0;
    let created = 0;
    let updated = 0;
    let errors = [];

    for (const filename of cssFiles) {
      try {
        const filePath = path.join(CSS_DIR, filename);
        const content = await fs.readFile(filePath, 'utf8');
        const sourceFile = `templates/css/${filename}`;

        // Check if stylesheet exists
        const existing = await query(
          'SELECT id FROM stylesheets WHERE filename = ? AND site_id IS NULL',
          [filename]
        );

        if (existing.length > 0) {
          // Update existing
          await query(
            `UPDATE stylesheets 
             SET content = ?, source_file = ?, last_synced_at = NOW()
             WHERE filename = ? AND site_id IS NULL`,
            [content, sourceFile, filename]
          );
          updated++;
          console.log(`✓ Updated: ${filename}`);
        } else {
          // Create new
          await query(
            `INSERT INTO stylesheets 
             (site_id, filename, content, description, type, source_file, last_synced_at)
             VALUES (NULL, ?, ?, ?, 'template', ?, NOW())`,
            [filename, content, `Synced from ${sourceFile}`, sourceFile]
          );
          created++;
          console.log(`✓ Created: ${filename}`);
        }

        synced++;
      } catch (err) {
        errors.push({ filename, error: err.message });
        console.error(`✗ Failed: ${filename} - ${err.message}`);
      }
    }

    console.log('\n📊 Summary:');
    console.log(`   Total files: ${cssFiles.length}`);
    console.log(`   Synced: ${synced}`);
    console.log(`   Created: ${created}`);
    console.log(`   Updated: ${updated}`);
    if (errors.length > 0) {
      console.log(`   Errors: ${errors.length}`);
    }

    console.log('\n✅ Stylesheet sync complete!');

    await closeDb();
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Sync failed:', err.message);
    console.error(err.stack);
    await closeDb();
    process.exit(1);
  }
}

syncStylesheets();
