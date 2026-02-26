// Debug: Show all classifieds templates in database
import prisma from './server/lib/prisma.js';

async function debug() {
  const templates = await prisma.templates.findMany({
    where: {
      OR: [
        { filename: { contains: 'classifieds' } },
        { filename: { contains: 'index' } }
      ]
    },
    select: {
      id: true,
      filename: true,
      name: true,
      content_type: true,
      updated_at: true
    },
    orderBy: { filename: 'asc' }
  });

  console.log(`Found ${templates.length} templates:\n`);
  templates.forEach(t => {
    console.log(`ID: ${t.id}`);
    console.log(`Filename: "${t.filename}"`);
    console.log(`Name: ${t.name}`);
    console.log(`Type: ${t.content_type}`);
    console.log(`Updated: ${t.updated_at}`);
    console.log(`Filename bytes: ${Buffer.from(t.filename).toString('hex')}`);
    console.log('---');
  });
  
  await prisma.$disconnect();
}

debug().catch(console.error);
