/**
 * Formats a slug into a full URL, handling port replacement for local development.
 * If running on port 5173 (Vite), it points to port 3000 (Express).
 * 
 * @param {string} slug The page or product slug
 * @returns {string} The full URL to view the content
 */
export function getSiteUrl(slug) {
  if (!slug) return '/';
  
  // Ensure slug starts with /
  const path = slug.startsWith('/') ? slug : `/${slug}`;
  
  // Get current origin
  const origin = window.location.origin;
  const port = window.location.port;
  
  // Local development fallback (Vite -> Express)
  if (port === '5173') {
    return origin.replace(':5173', ':3000') + path;
  }
  
  // In proxy/production environments, use the current origin
  return origin + path;
}
