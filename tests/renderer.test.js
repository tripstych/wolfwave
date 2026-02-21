import { describe, it, expect, vi } from 'vitest';
import { processShortcodes } from '../server/lib/renderer.js';

describe('Renderer (Shortcodes)', () => {
  
  // Mock Nunjucks env
  const mockEnv = {
    render: vi.fn((template, context) => `RENDERED:${template}:${context.widget.slug}`),
    opts: { site: { site_name: 'Test Site' } }
  };

  const mockBlocks = [
    { slug: 'test-widget', template_filename: 'widgets/test.njk', content_type: 'widgets', content: '{"title":"Test"}' },
    { 
      slug: 'premium-widget', 
      template_filename: 'widgets/premium.njk', 
      content_type: 'widgets', 
      content: '{"title":"Premium"}',
      access_rules: '{"subscription":"required"}'
    }
  ];

  it('should replace valid shortcodes with rendered content', () => {
    const html = '<p>Hello [[widget:test-widget]]</p>';
    const result = processShortcodes(html, mockEnv, mockBlocks);
    
    expect(result).toBe('<p>Hello RENDERED:widgets/test.njk:test-widget</p>');
    expect(mockEnv.render).toHaveBeenCalled();
  });

  it('should hide gated shortcodes when permissions are not met', () => {
    const html = '<p>[[widget:premium-widget]]</p>';
    const result = processShortcodes(html, mockEnv, mockBlocks, { hasActiveSubscription: false });
    expect(result).toContain('Access denied: premium-widget');
    expect(result).not.toContain('RENDERED');
  });

  it('should show gated shortcodes when permissions ARE met', () => {
    const html = '<p>[[widget:premium-widget]]</p>';
    const result = processShortcodes(html, mockEnv, mockBlocks, { hasActiveSubscription: true });
    expect(result).toBe('<p>RENDERED:widgets/premium.njk:premium-widget</p>');
  });

  it('should ignore non-matching shortcodes', () => {
    const html = '<p>Hello [[other:something]]</p>';
    const result = processShortcodes(html, mockEnv, mockBlocks);
    expect(result).toBe(html);
  });

  it('should return graceful error for missing widgets', () => {
    const html = '<p>[[widget:missing]]</p>';
    const result = processShortcodes(html, mockEnv, mockBlocks);
    expect(result).toContain('Widget not found: missing');
  });

  it('should handle multiple shortcodes in one string', () => {
    const html = '[[widget:test-widget]] and [[widget:test-widget]]';
    const result = processShortcodes(html, mockEnv, mockBlocks);
    const matches = result.match(/RENDERED/g);
    expect(matches.length).toBe(2);
  });

});
