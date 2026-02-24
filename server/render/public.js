import { Router } from 'express';
import { optionalAuth } from '../middleware/auth.js';
import { loadGlobalContext } from '../middleware/globalContext.js';

import * as shopController from '../controllers/shopController.js';
import * as customerController from '../controllers/customerController.js';
import * as contentController from '../controllers/contentController.js';
import * as classifiedController from '../controllers/classifiedController.js';

const router = Router();

// Middleware
router.use(optionalAuth);
router.use(loadGlobalContext);

// SEO & System
router.get('/robots.txt', contentController.robotsTxt);
router.get('/sitemap.xml', contentController.sitemapXml);
router.get('/search', contentController.search);
router.use(contentController.handleRedirects);

// Shop
router.get('/cart', shopController.cart);
router.get('/checkout', shopController.checkout);
router.get('/order-confirmation/:orderNumber', shopController.orderConfirmation);

// Classifieds (Public)
router.get('/classifieds', classifiedController.listAds);

// Customer
router.get('/customer/logout', customerController.logout);
router.get(['/customer/login', '/customers/login'], customerController.login);
router.get(['/customer/register', '/customers/register'], customerController.register);
router.get(['/customer/downloads', '/customers/downloads'], customerController.downloads);
router.get(['/customer/forgot-password', '/customers/forgot-password'], customerController.forgotPassword);
router.get(['/customer/reset-password/:token', '/customers/reset-password/:token'], customerController.resetPassword);

router.get(['/customer/account', '/customers/account'], customerController.account);
router.get('/subscribe', customerController.subscribe);
router.get('/account/subscription', customerController.subscription);

// Classifieds (Customer Management)
router.get('/customer/ads', classifiedController.myAds);
router.get('/customer/ads/create', classifiedController.createAd);
router.get('/customer/ads/edit/:id', classifiedController.editAd);
router.get('/customer/messages', classifiedController.listConversations);
router.get('/customer/messages/:id', classifiedController.viewConversation);

// Content (catch-all)
router.get('*', contentController.renderContent);

export default router;