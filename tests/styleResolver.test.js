import { describe, it, expect } from 'vitest';
import { resolveStyles } from '../server/lib/styleResolver.js';

describe('Style Resolver', () => {
  it('should use system defaults when no styles are provided', () => {
    const styles = resolveStyles({}, {});
    expect(styles.google_font_body).toBe('Inter');
    expect(styles.primary_color).toBe('#2563eb');
  });

  it('should prioritize global styles over system defaults', () => {
    const global = { google_font_body: 'Roboto', primary_color: '#ff0000' };
    const styles = resolveStyles(global, {});
    expect(styles.google_font_body).toBe('Roboto');
    expect(styles.primary_color).toBe('#ff0000');
  });

  it('should NOT allow template defaults (Inter) to clobber global styles', () => {
    const global = { google_font_body: 'Roboto' };
    const template = { google_font_body: 'Inter' };
    const styles = resolveStyles(global, template);
    expect(styles.google_font_body).toBe('Roboto');
  });

  it('should allow template to explicitly override global styles with custom values', () => {
    const global = { google_font_body: 'Roboto' };
    const template = { google_font_body: 'Oswald' };
    const styles = resolveStyles(global, template);
    expect(styles.google_font_body).toBe('Oswald');
  });

  it('should fallback heading font to body font if not specified', () => {
    const global = { google_font_body: 'Roboto' };
    const styles = resolveStyles(global, {});
    expect(styles.google_font_heading).toBe('Roboto');
  });
});
