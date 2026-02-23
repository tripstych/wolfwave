import { describe, it, expect } from 'vitest';
import * as cheerio from 'cheerio';
import { extractMetadata } from '../server/services/scraperService.js';

describe('Recursive Scraper Rules', () => {
  const html = `
    <html>
      <body>
        <h1 class="pro-title">Advanced Widget</h1>
        <div class="pro-desc">The best widget ever made.</div>
        <span class="pro-price">$99.99</span>
        <div class="other-title">Wrong Title</div>
      </body>
    </html>
  `;
  const $ = cheerio.load(html);
  const url = 'https://example.com/products/widget-123';

  it('should handle nested rules and scoped selectors', () => {
    const rules = [
      {
        urlPattern: '/products/.*',
        actions: [
          { action: 'setType', value: 'product' }
        ],
        children: [
          {
            selector: '.pro-title',
            action: 'setField',
            value: 'title'
          },
          {
            selector: '.pro-desc',
            action: 'setField',
            value: 'description'
          },
          {
            selector: '.pro-price',
            action: 'setField',
            value: 'price'
          }
        ]
      },
      {
        urlPattern: '/blog/.*',
        actions: [
          { action: 'setType', value: 'post' }
        ]
      }
    ];

    const result = extractMetadata($, rules, url);
    
    expect(result.type).toBe('product');
    expect(result.title).toBe('Advanced Widget');
    expect(result.description).toBe('The best widget ever made.');
    expect(result.price).toBe(99.99);
  });

  it('should NOT apply child rules if parent match fails', () => {
    const rules = [
      {
        urlPattern: '/services/.*',
        actions: [
          { action: 'setType', value: 'service' }
        ],
        children: [
          {
            selector: '.pro-title',
            action: 'setField',
            value: 'title'
          }
        ]
      }
    ];

    const result = extractMetadata($, rules, url);
    
    // Default metadata extraction will likely pick up 'Advanced Widget' if it's in <h1>,
    // so we check if 'service' was set.
    expect(result.type).not.toBe('service');
    expect(result.type).toBe('page'); // Default fallback
  });

  it('should handle multiple actions on a single match', () => {
    const rules = [
      {
        selector: '.pro-title',
        actions: [
          { action: 'setField', value: 'title' },
          { action: 'setConst', value: 'sku:WIDGET-001' }
        ]
      }
    ];

    const result = extractMetadata($, rules, url);
    expect(result.title).toBe('Advanced Widget');
    expect(result.sku).toBe('WIDGET-001');
  });

  it('should maintain backward compatibility with legacy flat rules', () => {
    const rules = [
      {
        urlPattern: '/products/.*',
        action: 'setType',
        value: 'product'
      },
      {
        selector: '.pro-price',
        action: 'setField',
        value: 'price'
      }
    ];

    const result = extractMetadata($, rules, url);
    expect(result.type).toBe('product');
    expect(result.price).toBe(99.99);
  });
});
