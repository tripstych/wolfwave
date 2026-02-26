import prisma from '../server/lib/prisma.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function checkAndUpdateTemplate() {
  try {
    // Check if there's a database template for classifieds/index.njk
    const dbTemplate = await prisma.templates.findFirst({
      where: {
        OR: [
          { filename: 'classifieds/index.njk' },
          { filename: '/classifieds/index.njk' }
        ]
      }
    });

    if (dbTemplate) {
      console.log('✓ Found database template:');
      console.log(`  ID: ${dbTemplate.id}`);
      console.log(`  Filename: ${dbTemplate.filename}`);
      console.log(`  Content Type: ${dbTemplate.content_type}`);
      console.log(`  Updated: ${dbTemplate.updated_at}`);
      console.log('\n--- Current DB Content (first 500 chars) ---');
      console.log(dbTemplate.content.substring(0, 500));
      console.log('\n');

      // Read the filesystem version
      const fsPath = path.join(__dirname, '../templates/classifieds/index.njk');
      const fsContent = fs.readFileSync(fsPath, 'utf-8');

      console.log('--- Filesystem Content (first 500 chars) ---');
      console.log(fsContent.substring(0, 500));
      console.log('\n');

      // Check if they match
      if (dbTemplate.content === fsContent) {
        console.log('✓ Database and filesystem templates match!');
      } else {
        console.log('✗ Templates DO NOT match!');
        console.log('\nWould you like to update the database with the filesystem version?');
        console.log('Run with --update flag to update the database.');
        
        if (process.argv.includes('--update')) {
          await prisma.templates.update({
            where: { id: dbTemplate.id },
            data: { 
              content: fsContent,
              updated_at: new Date()
            }
          });
          console.log('\n✓ Database template updated successfully!');
        }
      }
    } else {
      console.log('✗ No database template found for classifieds/index.njk');
      console.log('The filesystem version should be used automatically.');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkAndUpdateTemplate();
