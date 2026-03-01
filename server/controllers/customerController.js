import { query } from '../db/connection.js';
import { themeRender, renderError } from '../lib/renderer.js';

const renderSimplePage = (req, res, template, pageTitle, slug, seoDescription) => {
    const { site } = res.locals;
    const context = {
      page: { title: pageTitle, slug },
      seo: {
        title: `${pageTitle} - ${site.site_name}`,
        description: seoDescription,
        robots: 'noindex, follow'
      }
    };
    if (req.params.token) {
        context.token = req.params.token;
    }
    themeRender(req, res, template, context);
};

export const logout = (req, res) => {
  res.clearCookie('customer_token');
  res.redirect('/customer/login');
};

export const login = (req, res) => renderSimplePage(req, res, 'customer/login.njk', 'Login', '/customer/login', 'Login to your account');
export const register = (req, res) => renderSimplePage(req, res, 'customer/register.njk', 'Register', '/customer/register', 'Create a new account');
export const downloads = (req, res) => renderSimplePage(req, res, 'customer/downloads.njk', 'My Downloads', '/customer/downloads', 'Access your purchased digital products');
export const forgotPassword = (req, res) => renderSimplePage(req, res, 'customer/forgot-password.njk', 'Forgot Password', '/customer/forgot-password', 'Reset your password');
export const resetPassword = (req, res) => renderSimplePage(req, res, 'customer/reset-password.njk', 'Reset Password', '/customer/reset-password', 'Reset your password');

export const account = async (req, res) => {
  try {
    const { site, customer } = res.locals;

    // If no customer logged in, redirect to login
    if (!customer) {
      return res.redirect('/customer/login?redirect=/customer/account');
    }

    // Check customer sites access
    let hasSitesAccess = false;
    try {
      const currentDb = process.env.DB_NAME || 'wolfwave_admin';
      const { runWithTenant, getCurrentDbName } = await import('../lib/tenantContext.js');
      const { prisma } = await import('../lib/prisma.js');
      
      await runWithTenant(getCurrentDbName(), async () => {
        const currentTenants = await prisma.tenants.count({
          where: { customer_id: customer.id }
        });
        
        // Simple logic: if limit > 0, has access
        hasSitesAccess = currentTenants > 0;
      });
    } catch (err) {
      console.error('Error checking sites access:', err);
      hasSitesAccess = false;
    }

    themeRender(req, res, 'customer/account.njk', {
      page: { title: 'My Account', slug: '/customer/account' },
      customer: {
        ...customer,
        has_sites_access: hasSitesAccess
      },
      seo: {
        title: 'My Account - ' + (site?.site_name || ''),
        description: 'Manage your account',
        robots: 'noindex, follow'
      }
    });
  } catch (err) {
    console.error('Account page error:', err);
    renderError(req, res, 500, 'Internal Server Error');
  }
};

export const subscribe = async (req, res) => {
  const { site } = res.locals;
  try {
    const plans = await query(
      'SELECT * FROM subscription_plans WHERE is_active = 1 ORDER BY position ASC, price ASC'
    );
    const parsedPlans = plans.map(plan => {
      let features = [];
      if (plan.features) {
        try { features = JSON.parse(plan.features); } catch (e) {}
      }
      return { ...plan, features };
    });

    themeRender(req, res, 'customer/subscribe.njk', {
      page: { title: 'Subscribe', slug: '/subscribe' },
      plans: parsedPlans,
      seo: {
        title: 'Subscribe - ' + site.site_name,
        description: 'Choose a membership plan',
        robots: 'index, follow'
      }
    });
  } catch (err) {
    console.error('Subscribe page error:', err);
    renderError(req, res, 500);
  }
};

export const subscription = async (req, res) => {
  const { site, customer } = res.locals;

  if (!customer) {
    return res.redirect('/customer/login?redirect=/account/subscription');
  }

  try {
    const plans = await query(
      'SELECT * FROM subscription_plans WHERE is_active = 1 ORDER BY position ASC, price ASC'
    );
    const parsedPlans = plans.map(plan => {
      let features = [];
      if (plan.features) {
        try { features = JSON.parse(plan.features); } catch (e) {}
      }
      return { ...plan, features };
    });

    themeRender(req, res, 'customer/subscription.njk', {
      page: { title: 'My Subscription', slug: '/account/subscription' },
      plans: parsedPlans,
      success: req.query.success === 'true',
      canceled: req.query.canceled === 'true',
      seo: {
        title: 'My Subscription - ' + site.site_name,
        description: 'Manage your subscription',
        robots: 'noindex, follow'
      }
    });
  } catch (err) {
    console.error('Subscription management page error:', err);
    renderError(req, res, 500);
  }
};
