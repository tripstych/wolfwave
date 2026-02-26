// Quick fix: Remove database template overrides for classifieds
import prisma from './server/lib/prisma.js';

async function fix() {
  const templates = await prisma.templates.findMany({
    where: {
      filename: { in: ['classifieds/index.njk', '/classifieds/index.njk'] }
    }
  });

  if (templates.length > 0) {
    console.log(`Found ${templates.length} database template(s) overriding filesystem:`);
    for (const t of templates) {
      console.log(`  - ID ${t.id}: ${t.filename}`);
      await prisma.templates.delete({ where: { id: t.id } });
      console.log(`    ✓ Deleted`);
    }
    console.log('\n✓ Done! Restart your server and the filesystem template will be used.');
  } else {
    console.log('No database templates found. Check if server needs restart or browser cache clear.');
  }
  
  await prisma.$disconnect();
}

fix().catch(console.error);
