import prisma from './server/lib/prisma.js';
import { runWithTenant } from './server/lib/tenantContext.js';

async function nuke() {
  const dbName = process.env.TENANT_DB || 'wolfwave_default';
  console.log(`Nuking data for ${dbName}...`);

  await runWithTenant(dbName, async () => {
    try {
      // Delete pages and their content
      const deletePages = prisma.pages.deleteMany({});
      const deleteContent = prisma.content.deleteMany({});
      const deleteTemplates = prisma.templates.deleteMany({
        where: { filename: { startsWith: 'imported/' } }
      });
      const deleteStaged = prisma.staged_items.deleteMany({});
      const deleteImported = prisma.imported_sites.deleteMany({});

      await prisma.$transaction([deletePages, deleteContent, deleteTemplates, deleteStaged, deleteImported]);
      console.log('Successfully nuked pages, content, templates (imported/*), staged items, and imported sites.');
    } catch (err) {
      console.error('Nuke failed:', err);
    } finally {
      await prisma.$disconnect();
    }
  });
}

nuke();
