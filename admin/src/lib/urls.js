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
  
  // Get current origin (e.g. http://localhost:5173 or http://tenant1.localhost:5173)
  const origin = window.location.origin;
  const port = window.location.port;
  
  // If we're on the Vite dev server port, replace it with the backend port
  if (port === '5173') {
    return origin.replace(':5173', ':3000') + path;
  }
  
  // Otherwise (e.g. behind nginx proxy or in production), use relative path or current origin
  return path;
}
