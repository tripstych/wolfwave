import { query } from '../db/connection.js';

export async function getAllBlocks() {
  try {
    const blocks = await query(`
      SELECT b.*, t.filename as template_filename, c.data as content, b.access_rules
      FROM blocks b
      LEFT JOIN templates t ON b.template_id = t.id
      LEFT JOIN content c ON b.content_id = c.id
    `);
    return blocks;
  } catch (err) {
    console.error('Error fetching blocks:', err);
    return [];
  }
}
