import { Router } from 'express';
import authRoutes from './auth.js';
import customerAuthRoutes from './customer-auth.js';
import customerTenantsRoutes from './customer-tenants.js';
import pagesRoutes from './pages-prisma.js';
import postsRoutes from './posts-prisma.js';
import templatesRoutes from './templates-prisma.js';
import mediaRoutes from './media.js';
import settingsRoutes from './settings.js';
import seoRoutes from './seo.js';
import menusRoutes from './menus.js';
import contentRoutes from './content.js';
import blocksRoutes from './blocks-prisma.js';
import contentTypesRoutes from './contentTypes.js';
import debugRoutes from './debug.js';
import extensionsRoutes from './extensions.js';
import productsRoutes from './products-prisma.js';
import ordersRoutes from './orders-prisma.js';
import cartRoutes from './cart.js';
import paymentsRoutes from './payments.js';
import groupsRoutes from './groups.js';
import customersRoutes from './customers-prisma.js';
import subscriptionPlansRoutes from './subscription-plans.js';
import customerSubscriptionsRoutes from './customer-subscriptions.js';
import couponsRoutes from './coupons.js';
import stripeWebhookRoutes from './webhooks/stripe.js';
import paypalWebhookRoutes from './webhooks/paypal.js';
import { autoLoadApiModules } from '../services/extensionLoader.js';
import tenantsRoutes from './tenants.js';
import themesRoutes from './themes.js';
import emailTemplatesRoutes from './email-templates.js';
import digitalDownloadsRoutes from './digital-downloads.js';
import aiRoutes from './ai.js';
import importRoutes from './import.js';
import assistedImportRoutes from './assisted-import.js';
import importLovableRoutes from './import-lovable.js';
import dashboardRoutes from './dashboard.js';
import apiKeysRoutes from './api-keys.js';
import amazonRoutes from './amazon.js';
import classifiedAdsRoutes from './classifieds.js';
import messagesRoutes from './messages.js';
import shopifyRoutes from './shopify.js';
import stylesheetsRoutes from './stylesheets.js';

const router = Router();

// System routes (always available)
router.use('/auth', authRoutes);
router.use('/customer-auth', customerAuthRoutes);
router.use('/customer-tenants', customerTenantsRoutes);
router.use('/pages', pagesRoutes);
router.use('/posts', postsRoutes);
router.use('/templates', templatesRoutes);
router.use('/media', mediaRoutes);
router.use('/settings', settingsRoutes);
router.use('/seo', seoRoutes);
router.use('/menus', menusRoutes);
router.use('/content', contentRoutes);
router.use('/blocks', blocksRoutes);
router.use('/content-types', contentTypesRoutes);
router.use('/extensions', extensionsRoutes);
router.use('/products', productsRoutes);
router.use('/orders', ordersRoutes);
router.use('/cart', cartRoutes);
router.use('/payments', paymentsRoutes);
router.use('/groups', groupsRoutes);
router.use('/customers', customersRoutes);
router.use('/subscription-plans', subscriptionPlansRoutes);
router.use('/customer-subscriptions', customerSubscriptionsRoutes);
router.use('/coupons', couponsRoutes);
router.use('/webhooks/stripe', stripeWebhookRoutes);
router.use('/webhooks/paypal', paypalWebhookRoutes);
router.use('/debug', debugRoutes);
router.use('/tenants', tenantsRoutes);
router.use('/themes', themesRoutes);
router.use('/email-templates', emailTemplatesRoutes);
router.use('/digital-downloads', digitalDownloadsRoutes);
router.use('/ai', aiRoutes);
router.use('/import', importRoutes);
router.use('/assisted-import', assistedImportRoutes);
router.use('/import-lovable', importLovableRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/api-keys', apiKeysRoutes);
router.use('/amazon', amazonRoutes);
router.use('/classifieds', classifiedAdsRoutes);
router.use('/messages', messagesRoutes);
router.use('/shopify', shopifyRoutes);
router.use('/stylesheets', stylesheetsRoutes);

// Health check
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Function to auto-load content type APIs
export async function registerContentTypeApis(app) {
  await autoLoadApiModules(app);
}

export default router;
