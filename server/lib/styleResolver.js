/**
 * Merges system defaults, global site styles, and template-specific overrides.
 * Ensures custom global settings are not clobbered by default template values.
 */
export function resolveStyles(globalStyles = {}, templateOverrides = {}) {
  const mergedOptions = { 
    primary_color: '#2563eb',
    secondary_color: '#64748b',
    google_font_body: 'Inter',
    google_font_heading: 'Inter',
    body_size: '16px',
    container_width: '1200px'
  };

  // 1. Apply Global Styles (Authority over defaults)
  Object.keys(globalStyles).forEach(key => {
    if (globalStyles[key] && globalStyles[key] !== '') {
      mergedOptions[key] = globalStyles[key];
    }
  });

  // 2. Apply Template Overrides (Only if they have custom values)
  Object.keys(templateOverrides).forEach(key => {
    const val = templateOverrides[key];
    // We explicitly ignore "Inter" and empty strings from templates
    // to prevent them from overriding a custom Global font like "Roboto"
    if (val && val !== '' && val !== 'Inter') {
      mergedOptions[key] = val;
    }
  });

  // 3. Final Fallbacks
  // If heading font is still the default "Inter" but body font was customized,
  // we want the headings to match the body.
  if (mergedOptions.google_font_heading === 'Inter' && mergedOptions.google_font_body !== 'Inter') {
    mergedOptions.google_font_heading = mergedOptions.google_font_body;
  }

  return mergedOptions;
}
