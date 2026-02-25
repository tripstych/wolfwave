import prisma from './server/lib/prisma.js';

async function check() {
  const templates = await prisma.templates.findMany({
    where: {
      OR: [
        { content: null },
        { content: '' }
      ]
    },
    select: { filename: true }
  });
  console.log(JSON.stringify(templates, null, 2));
  process.exit(0);
}

check();
