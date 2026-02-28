import { query } from '../db/connection.js';
import { themeRender, renderError } from '../lib/renderer.js';
import prisma from '../lib/prisma.js';

/**
 * Public: List all ads
 */
export const listAds = async (req, res) => {
  const { site } = res.locals;
  try {
    const { category, q, sort = 'newest' } = req.query;
    
    let where = { status: 'approved' };
    if (category) where.category = { slug: category };
    if (q) {
      where.OR = [
        { title: { contains: q } },
        { description: { contains: q } }
      ];
    }

    let orderBy = { created_at: 'desc' };
    if (sort === 'price_asc') orderBy = { price: 'asc' };
    if (sort === 'price_desc') orderBy = { price: 'desc' };

    const ads = await prisma.classified_ads.findMany({
      where,
      include: {
        category: true,
        customer: { select: { first_name: true, last_name: true } }
      },
      orderBy,
      take: 50
    });

    const categories = await prisma.classified_categories.findMany({
      where: { parent_id: null },
      include: { children: true },
      orderBy: { position: 'asc' }
    });

    themeRender(req, res, 'classifieds/index.njk', {
      page: { title: 'Classified Ads', slug: '/classifieds' },
      ads,
      categories,
      filters: { category, q, sort },
      seo: {
        title: `Classified Ads - ${site.site_name}`,
        description: 'Browse local classified ads',
        robots: 'index, follow'
      }
    });
  } catch (err) {
    console.error('List ads error:', err);
    renderError(req, res, 500);
  }
};

/**
 * Subscriber: My Ads
 */
export const myAds = async (req, res) => {
  const { customer, site } = res.locals;
  if (!customer) return res.redirect('/customer/login?redirect=/customer/ads');

  try {
    const ads = await prisma.classified_ads.findMany({
      where: { customer_id: customer.id },
      include: { category: true },
      orderBy: { created_at: 'desc' }
    });

    themeRender(req, res, 'customer/ads/list.njk', {
      page: { title: 'My Ads', slug: '/customer/ads' },
      ads,
      seo: {
        title: `My Ads - ${site.site_name}`,
        robots: 'noindex, follow'
      }
    });
  } catch (err) {
    renderError(req, res, 500);
  }
};

/**
 * Subscriber: Create Ad Form
 */
export const createAd = async (req, res) => {
  const { customer, site } = res.locals;
  if (!customer) return res.redirect('/customer/login?redirect=/customer/ads/create');

  try {
    const categories = await prisma.classified_categories.findMany({
      orderBy: { name: 'asc' }
    });

    themeRender(req, res, 'customer/ads/edit.njk', {
      page: { title: 'Post an Ad', slug: '/customer/ads/create' },
      adId: 'new',
      categories,
      seo: {
        title: `Post an Ad - ${site.site_name}`,
        robots: 'noindex, follow'
      }
    });
  } catch (err) {
    renderError(req, res, 500);
  }
};

/**
 * Subscriber: Edit Ad Form
 */
export const editAd = async (req, res) => {
  const { customer, site } = res.locals;
  if (!customer) return res.redirect('/customer/login');

  try {
    const adId = parseInt(req.params.id);
    const ad = await prisma.classified_ads.findUnique({
      where: { id: adId }
    });

    if (!ad || ad.customer_id !== customer.id) {
      return renderError(req, res, 404, { message: 'Ad not found' });
    }

    // Fetch content manually
    let adContent = null;
    if (ad.content_id) {
      adContent = await prisma.content.findUnique({ where: { id: ad.content_id } });
    }

    const categories = await prisma.classified_categories.findMany({
      orderBy: { name: 'asc' }
    });

    themeRender(req, res, 'customer/ads/edit.njk', {
      page: { title: 'Edit Ad', slug: `/customer/ads/edit/${adId}` },
      adId,
      ad: {
        ...ad,
        content: adContent?.data || {}
      },
      categories,
      seo: {
        title: `Edit Ad - ${site.site_name}`,
        robots: 'noindex, follow'
      }
    });
  } catch (err) {
    renderError(req, res, 500);
  }
};

/**
 * Subscriber: List Conversations (Inbox)
 */
export const listConversations = async (req, res) => {
  const { customer, site } = res.locals;
  if (!customer) return res.redirect('/customer/login?redirect=/customer/messages');

  try {
    themeRender(req, res, 'customer/messages/list.njk', {
      page: { title: 'My Messages', slug: '/customer/messages' },
      seo: {
        title: `Messages - ${site.site_name}`,
        robots: 'noindex, follow'
      }
    });
  } catch (err) {
    renderError(req, res, 500);
  }
};

/**
 * Subscriber: View Single Conversation
 */
export const viewConversation = async (req, res) => {
  const { customer, site } = res.locals;
  if (!customer) return res.redirect('/customer/login');

  try {
    const conversationId = parseInt(req.params.id);
    // Fetch basic conv info to verify access
    const conv = await prisma.conversations.findUnique({
      where: { id: conversationId }
    });

    if (!conv || (conv.buyer_id !== customer.id && conv.seller_id !== customer.id)) {
      return renderError(req, res, 404, { message: 'Conversation not found' });
    }

    themeRender(req, res, 'customer/messages/detail.njk', {
      page: { title: 'Conversation', slug: `/customer/messages/${conversationId}` },
      conversationId,
      seo: {
        title: `Message Thread - ${site.site_name}`,
        robots: 'noindex, follow'
      }
    });
  } catch (err) {
    renderError(req, res, 500);
  }
};
