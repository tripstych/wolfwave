import 'dotenv/config';
import { query } from '../server/db/connection.js';
import { generateSearchIndex } from '../server/lib/searchIndexer.js';

// Use the local DB name if set, otherwise fallback
process.env.DB_NAME = process.env.DB_NAME || 'webwolf_default';

async function backfill() {
  console.log('🔍 Starting search index backfill...');
  
  try {
    const allContent = await query('SELECT id, title, data FROM content');
    console.log(`Processing ${allContent.length} items...`);
    
    for (const item of allContent) {
      const searchIndex = generateSearchIndex(item.title, item.data);
      await query(
        'UPDATE content SET search_index = ? WHERE id = ?',
        [searchIndex, item.id]
      );
      console.log(`✅ Indexed: ${item.title || item.id}`);
    }
    
    console.log('🎉 Search index backfill complete!');
  } catch (err) {
    console.error('❌ Backfill failed:', err);
  } finally {
    process.exit();
  }
}

backfill();
