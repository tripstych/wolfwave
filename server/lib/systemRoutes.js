/**
 * Central registry of all well-known system routes.
 * Used for menu management, sitemap generation, and collision avoidance.
 */
export const SYSTEM_ROUTES = [
  { title: 'Home', url: '/', priority: 1.0, changefreq: 'daily' },
  { title: 'Search', url: '/search', priority: 0.3, changefreq: 'monthly' },
  { title: 'Blog', url: '/posts', priority: 0.8, changefreq: 'daily' },
  { title: 'Shop', url: '/products', priority: 0.9, changefreq: 'daily' },
  { title: 'Classifieds', url: '/classifieds', priority: 0.8, changefreq: 'daily' },
  { title: 'Shopping Cart', url: '/cart', priority: 0.1, changefreq: 'monthly' },
  { title: 'Checkout', url: '/checkout', priority: 0.1, changefreq: 'monthly' },
  { title: 'Subscription Plans', url: '/subscribe', priority: 0.5, changefreq: 'monthly' },
  { title: 'My Account', url: '/customer/account', priority: 0.5, changefreq: 'monthly' },
  { title: 'My Classified Ads', url: '/customer/ads', priority: 0.1, changefreq: 'monthly' },
  { title: 'My Messages', url: '/customer/messages', priority: 0.1, changefreq: 'monthly' },
  { title: 'Manage Subscription', url: '/account/subscription', priority: 0.1, changefreq: 'monthly' },
  { title: 'Digital Downloads', url: '/customer/downloads', priority: 0.1, changefreq: 'monthly' },
  { title: 'Login', url: '/customer/login', priority: 0.2, changefreq: 'monthly' },
  { title: 'Register', url: '/customer/register', priority: 0.2, changefreq: 'monthly' },
  { title: 'Logout', url: '/customer/logout', priority: 0.0, changefreq: 'never' }
];

/**
 * Check if a given slug matches a protected system route.
 */
export function isSystemRoute(slug) {
  if (!slug) return false;
  const normalized = slug.startsWith('/') ? slug : '/' + slug;
  return SYSTEM_ROUTES.some(r => r.url === normalized);
}

export default SYSTEM_ROUTES;
