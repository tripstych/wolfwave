const { syncTemplatesToDb } = require('./server/services/templateParser.js');
const prisma = require('./server/lib/prisma.js');

console.log('Starting template sync...');

async function syncTemplates() {
  try {
    console.log('Syncing templates to database...');
    const templates = await syncTemplatesToDb(prisma);
    console.log(`✅ Synced ${templates.length} templates to database`);
    console.log('Templates:', templates.map(t => t.filename));
    console.log('Sync completed successfully!');
  } catch (err) {
    console.error('❌ Failed to sync templates:', err.message);
    console.error('Full error:', err);
    console.error('Stack trace:', err.stack);
    process.exit(1);
  }
}

syncTemplates();
