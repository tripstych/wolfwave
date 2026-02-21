/**
 * Simple priority-based style merging.
 * Precedence: Template Overrides > Global Site Styles > System Defaults
 */
export function resolveStyles(globalStyles = {}, templateOverrides = {}) {
  const defaults = { 
    primary_color: '#2563eb',
    secondary_color: '#64748b',
    body_font: "system-ui, -apple-system, sans-serif",
    google_font_body: '',
    google_font_heading: '',
    body_size: '16px',
    body_color: '#1e293b',
    h1_color: '#0f172a',
    h1_size: '2.5rem',
    h1_weight: '700',
    container_width: '1200px',
    link_color: '#2563eb'
  };

  // Create a flat merge. We don't "filter" values anymore. 
  // If a template explicitly sets a value (even an empty string), it is an intentional choice.
  const merged = {
    ...defaults,
    ...globalStyles,
    ...templateOverrides
  };

  return merged;
}
