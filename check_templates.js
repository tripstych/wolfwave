import prisma from './server/lib/prisma.js';

async function check() {
  const filename = 'imported/30/listing-6df2fce7.njk';
  const template = await prisma.templates.findUnique({
    where: { filename }
  });
  console.log(JSON.stringify(template, null, 2));
  process.exit(0);
}

check();
