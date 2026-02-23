/**
 * Simple priority-based style merging.
 * Precedence: Template Overrides (non-default) > Global Site Styles > System Defaults
 *
 * Template values that match the system default are treated as "not explicitly set"
 * and will not clobber global styles. This prevents a template shipping with default
 * font "Inter" from overriding a site-wide choice of "Roboto".
 */
export function resolveStyles(globalStyles = {}, templateOverrides = {}) {
  const defaults = {
    primary_color: '#2563eb',
    secondary_color: '#64748b',
    body_font: "system-ui, -apple-system, sans-serif",
    google_font_body: 'Inter',
    google_font_heading: '',
    body_size: '16px',
    body_color: '#1e293b',
    h1_color: '#0f172a',
    h1_size: '2.5rem',
    h1_weight: '700',
    container_width: '1200px',
    link_color: '#2563eb'
  };

  // Filter out template overrides that match system defaults — these are not
  // intentional overrides and should not clobber global site styles.
  const effectiveOverrides = {};
  for (const [key, value] of Object.entries(templateOverrides)) {
    if (value !== defaults[key]) {
      effectiveOverrides[key] = value;
    }
  }

  const merged = {
    ...defaults,
    ...globalStyles,
    ...effectiveOverrides
  };

  // Fallback: if heading font is not set, inherit from body font
  if (!merged.google_font_heading && merged.google_font_body) {
    merged.google_font_heading = merged.google_font_body;
  }

  return merged;
}
