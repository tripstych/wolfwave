import { query } from '../db/connection.js';

export async function getAllBlocks() {
  try {
    const blocks = await query(`
      SELECT b.*, c.data as content, b.access_rules
      FROM blocks b
      LEFT JOIN content c ON b.content_id = c.id
    `);

    // Extract source from content data for each block
    return blocks.map(block => {
      const data = block.content;
      const contentData = typeof data === 'string' ? JSON.parse(data) : (data || {});
      return {
        ...block,
        source: contentData.source || ''
      };
    });
  } catch (err) {
    console.error('Error fetching blocks:', err);
    return [];
  }
}
