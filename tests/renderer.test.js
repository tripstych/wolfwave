import { describe, it, expect, vi } from 'vitest';
import { processShortcodes } from '../server/lib/renderer.js';

describe('Renderer (Shortcodes)', () => {
  
  // Mock Nunjucks env
  const mockEnv = {
    render: vi.fn((template, context, cb) => {
      // Simulate Nunjucks async callback style
      const rendered = `RENDERED:${template}:${(context.widget || context.block).slug}`;
      if (cb) cb(null, rendered);
      return rendered;
    }),
    opts: { 
      site: { site_name: 'Test Site' },
      site_locals: {}
    }
  };

  const mockBlocks = [
    { slug: 'test-widget', template_filename: 'widgets/test.njk', content_type: 'widgets', content: '{"title":"Test"}' },
    { 
      slug: 'test-block', 
      template_filename: 'blocks/test.njk', 
      content_type: 'blocks', 
      content: '{"title":"Block"}' 
    },
    { 
      slug: 'premium-widget', 
      template_filename: 'widgets/premium.njk', 
      content_type: 'widgets', 
      content: '{"title":"Premium"}',
      access_rules: '{"subscription":"required"}'
    }
  ];

  it('should replace valid widget shortcodes with rendered content', async () => {
    const html = '<p>Hello [[widget:test-widget]]</p>';
    const result = await processShortcodes(html, mockEnv, mockBlocks);
    
    expect(result).toBe('<p>Hello RENDERED:widgets/test.njk:test-widget</p>');
    expect(mockEnv.render).toHaveBeenCalled();
  });

  it('should replace valid block shortcodes with rendered content', async () => {
    const html = '<p>Block: [[block:test-block]]</p>';
    const result = await processShortcodes(html, mockEnv, mockBlocks);
    
    expect(result).toBe('<p>Block: RENDERED:blocks/test.njk:test-block</p>');
  });

  it('should hide gated shortcodes when permissions are not met', async () => {
    const html = '<p>[[widget:premium-widget]]</p>';
    const result = await processShortcodes(html, mockEnv, mockBlocks, { hasActiveSubscription: false });
    expect(result).toContain('Access denied: premium-widget');
    expect(result).not.toContain('RENDERED');
  });

  it('should show gated shortcodes when permissions ARE met', async () => {
    const html = '<p>[[widget:premium-widget]]</p>';
    const result = await processShortcodes(html, mockEnv, mockBlocks, { hasActiveSubscription: true });
    expect(result).toBe('<p>RENDERED:widgets/premium.njk:premium-widget</p>');
  });

  it('should ignore non-matching shortcodes', async () => {
    const html = '<p>Hello [[other:something]]</p>';
    const result = await processShortcodes(html, mockEnv, mockBlocks);
    expect(result).toBe(html);
  });

  it('should return graceful error for missing widgets', async () => {
    const html = '<p>[[widget:missing]]</p>';
    const result = await processShortcodes(html, mockEnv, mockBlocks);
    expect(result).toContain('widget not found: missing');
  });

  it('should handle multiple shortcodes in one string', async () => {
    const html = '[[widget:test-widget]] and [[widget:test-widget]]';
    const result = await processShortcodes(html, mockEnv, mockBlocks);
    const matches = result.match(/RENDERED/g);
    expect(matches.length).toBe(2);
  });

});
