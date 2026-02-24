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

    const templates = await prisma.templates.findMany({
      where: { content_type: 'classifieds' }
    });

    themeRender(req, res, 'customer/ads/edit.njk', {
      page: { title: 'Post an Ad', slug: '/customer/ads/create' },
      adId: 'new',
      categories,
      templates,
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
      where: { id: adId },
      include: { content: true }
    });

    if (!ad || ad.customer_id !== customer.id) {
      return renderError(req, res, 404, { message: 'Ad not found' });
    }

    const categories = await prisma.classified_categories.findMany({
      orderBy: { name: 'asc' }
    });

    const templates = await prisma.templates.findMany({
      where: { content_type: 'classifieds' }
    });

    themeRender(req, res, 'customer/ads/edit.njk', {
      page: { title: 'Edit Ad', slug: `/customer/ads/edit/${adId}` },
      adId,
      ad,
      categories,
      templates,
      seo: {
        title: `Edit Ad - ${site.site_name}`,
        robots: 'noindex, follow'
      }
    });
  } catch (err) {
    renderError(req, res, 500);
  }
};
