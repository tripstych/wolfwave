import prisma from '../server/lib/prisma.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function syncTemplate() {
  try {
    console.log('Checking for database template overrides...\n');
    
    // Check both possible filename formats
    const templates = await prisma.templates.findMany({
      where: {
        OR: [
          { filename: { contains: 'classifieds/index' } },
          { filename: { contains: 'classifieds\\index' } }
        ]
      }
    });

    console.log(`Found ${templates.length} matching template(s) in database:\n`);
    
    templates.forEach(t => {
      console.log(`- ID: ${t.id}`);
      console.log(`  Filename: ${t.filename}`);
      console.log(`  Content Type: ${t.content_type || 'N/A'}`);
      console.log(`  Updated: ${t.updated_at}`);
      console.log(`  Content preview: ${t.content.substring(0, 100)}...`);
      console.log('');
    });

    if (templates.length > 0) {
      console.log('⚠️  DATABASE TEMPLATE FOUND - This is overriding your filesystem changes!');
      console.log('\nOptions:');
      console.log('1. Delete the database template (recommended) - run with --delete');
      console.log('2. Update the database template - run with --update\n');

      if (process.argv.includes('--delete')) {
        for (const t of templates) {
          await prisma.templates.delete({ where: { id: t.id } });
          console.log(`✓ Deleted template ID ${t.id}`);
        }
        console.log('\n✓ Database templates deleted. Filesystem version will now be used.');
      } else if (process.argv.includes('--update')) {
        const fsPath = path.join(__dirname, '../templates/classifieds/index.njk');
        const fsContent = fs.readFileSync(fsPath, 'utf-8');
        
        for (const t of templates) {
          await prisma.templates.update({
            where: { id: t.id },
            data: { 
              content: fsContent,
              updated_at: new Date()
            }
          });
          console.log(`✓ Updated template ID ${t.id}`);
        }
        console.log('\n✓ Database templates updated with filesystem content.');
      }
    } else {
      console.log('✓ No database template found. Filesystem version should be used.');
      console.log('\nIf you\'re still seeing the old template, try:');
      console.log('1. Restart the server');
      console.log('2. Clear browser cache');
      console.log('3. Check if there\'s a theme-specific override in themes/default/classifieds/');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

syncTemplate();
