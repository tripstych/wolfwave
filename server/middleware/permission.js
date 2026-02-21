/**
 * Centralized Permission & Access Control Middleware
 * Handles visibility and access based on:
 * 1. Login status (isLoggedIn)
 * 2. Subscription status (hasActiveSubscription)
 * 3. Specific plan requirements (TODO)
 */

/**
 * Core permission check logic.
 * Can be used by middleware or internal services (like MenuService).
 */
export function canAccess(rules, context) {
  if (!rules) return true;

  // 1. Auth Rule
  if (rules.auth === 'logged_in' && !context.isLoggedIn) return false;
  if (rules.auth === 'logged_out' && context.isLoggedIn) return false;

  // 2. Subscription Rule
  if (rules.subscription === 'required' && !context.hasActiveSubscription) return false;
  if (rules.subscription === 'none' && context.hasActiveSubscription) return false;

  // 3. Plan-specific Rule (if plan slugs are provided)
  if (rules.plans && Array.isArray(rules.plans) && rules.plans.length > 0) {
    if (!context.hasActiveSubscription) return false;
    const customerPlanSlug = context.customer?.subscription?.plan?.slug;
    if (!rules.plans.includes(customerPlanSlug)) return false;
  }

  return true;
}

/**
 * Middleware for routes that require an active subscription.
 */
export function requireSubscription(req, res, next) {
  const hasActiveSubscription = res.locals.hasActiveSubscription;
  
  if (!hasActiveSubscription) {
    // If it's an API request, return 403
    if (req.path.startsWith('/api/')) {
      return res.status(403).json({ 
        error: 'Subscription required',
        message: 'This resource requires an active subscription.' 
      });
    }
    
    // For public pages, we can either redirect to subscribe page or 
    // let the controller handle it (e.g., showing a "Premium Content" teaser)
    // Here we'll redirect to a generic subscribe page
    return res.redirect('/subscribe?ref=' + encodeURIComponent(req.originalUrl));
  }
  
  next();
}

/**
 * Middleware for routes that require being logged in (customer-side).
 */
export function requireCustomerLogin(req, res, next) {
  if (!res.locals.customer) {
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Login required' });
    }
    return res.redirect('/customer/login?ref=' + encodeURIComponent(req.originalUrl));
  }
  next();
}
