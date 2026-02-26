/**
 * Admin Domain Check Middleware
 * 
 * Ensures admin panel is only accessible via admin.* subdomain
 * for security purposes.
 */

/**
 * Middleware to restrict admin panel access to admin subdomain only
 */
export function requireAdminDomain(req, res, next) {
  const host = req.get('host') || '';
  const hostname = host.split(':')[0];
  
  // Check if accessing via admin subdomain
  const isAdminSubdomain = hostname.startsWith('admin.');
  
  // Allow localhost for development
  const isLocalhost = hostname === 'localhost' || hostname.startsWith('127.0.0.1');
  
  if (!isAdminSubdomain && !isLocalhost) {
    // Not on admin subdomain - deny access
    return res.status(404).send('Not Found');
  }
  
  next();
}

export default requireAdminDomain;
