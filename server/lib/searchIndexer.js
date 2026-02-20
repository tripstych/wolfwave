/**
 * Utility to extract searchable text from various content formats (JSON, HTML)
 */

/**
 * Strips HTML tags and extracts plain text
 */
export function stripHtml(html) {
  if (!html || typeof html !== 'string') return '';
  return html
    .replace(/<[^>]*>/g, ' ') // Remove tags
    .replace(/\s+/g, ' ')     // Normalize whitespace
    .trim();
}

/**
 * Recursively extracts values from a JSON object/array
 */
export function extractJsonValues(obj) {
  let values = [];

  if (!obj || typeof obj !== 'object') {
    return [String(obj || '')];
  }

  for (const key in obj) {
    const val = obj[key];
    if (typeof val === 'string') {
      values.push(stripHtml(val));
    } else if (typeof val === 'object') {
      values = values.concat(extractJsonValues(val));
    }
  }

  return values;
}

/**
 * Generates a consolidated search index string from content data and title
 */
export function generateSearchIndex(title, data) {
  let parts = [title || ''];
  
  if (data) {
    let parsedData = data;
    if (typeof data === 'string') {
      try {
        parsedData = JSON.parse(data);
      } catch (e) {
        console.warn(`[SearchIndexer] Failed to parse JSON data: ${e.message}`);
        parsedData = {};
      }
    }
    
    const contentValues = extractJsonValues(parsedData);
    parts = parts.concat(contentValues);
  }

  // Filter out duplicates and small words, then join
  const uniqueText = [...new Set(parts.join(' ').split(/\s+/))]
    .filter(word => word.length > 2)
    .join(' ');

  return uniqueText;
}
