import { getSiteSettings } from '../services/siteService.js';
import { getAllMenus } from '../services/menuService.js';
import { getAllBlocks } from '../services/blockService.js';
import { getCustomerContext } from '../services/customerService.js';

export async function loadGlobalContext(req, res, next) {
  try {
    const customer = await getCustomerContext(req);
    
    const [site, menus, blocks] = await Promise.all([
      getSiteSettings(),
      getAllMenus({
        isLoggedIn: !!customer,
        currentPath: req.path
      }),
      getAllBlocks()
    ]);

    res.locals.site = site;
    res.locals.menus = menus;
    res.locals.blocks = blocks;
    res.locals.customer = customer;

    // Helper for templates to check subscription
    res.locals.hasActiveSubscription = !!customer?.subscription;

    next();
  } catch (err) {
    console.error('Error loading global context:', err);
    next(err);
  }
}
