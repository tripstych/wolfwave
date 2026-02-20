import { describe, it, expect } from 'vitest';
import { generateSearchIndex, stripHtml, extractJsonValues } from '../server/lib/searchIndexer.js';

describe('Search Indexer', () => {
  
  it('should strip HTML tags correctly', () => {
    const html = '<div class="test">Hello <strong>World</strong></div>';
    expect(stripHtml(html)).toBe('Hello World');
  });

  it('should extract values from complex JSON objects', () => {
    const data = {
      title: 'Testing',
      blocks: [
        { text: '<p>Some content</p>' },
        { nested: { value: 'Secret' } }
      ]
    };
    const values = extractJsonValues(data);
    expect(values).toContain('Testing');
    expect(values).toContain('Some content');
    expect(values).toContain('Secret');
  });

  it('should generate a clean, unique search index string', () => {
    const title = 'Leather Jacket';
    const data = {
      description: 'Cool black leather jacket',
      specs: 'Black, Leather, Warm'
    };
    
    const index = generateSearchIndex(title, data);
    
    // Should be space separated unique words
    expect(index).toContain('Leather');
    expect(index).toContain('Jacket');
    expect(index).toContain('Cool');
    expect(index).toContain('black');
    
    // Should not contain small words if filter is active
    const words = index.split(' ');
    words.forEach(word => {
      expect(word.length).toBeGreaterThan(2);
    });
  });

});
