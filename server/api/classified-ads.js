import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import slugify from 'slugify';
import { generateSearchIndex } from '../lib/searchIndexer.js';
import { updateContent } from '../services/contentService.js';

const router = Router();

/**
 * Public: List all approved ads
 */
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { category, search, limit = 20, offset = 0 } = req.query;
    
    const where = { status: 'approved' };
    if (category) where.category = { slug: category };
    if (search) {
      where.OR = [
        { title: { contains: search } },
        { description: { contains: search } }
      ];
    }

    const ads = await prisma.classified_ads.findMany({
      where,
      include: {
        category: true,
        content: true,
        customer: {
          select: { first_name: true, last_name: true }
        }
      },
      orderBy: { created_at: 'desc' },
      take: parseInt(limit),
      skip: parseInt(offset)
    });

    const total = await prisma.classified_ads.count({ where });

    // Transform content data
    const transformed = ads.map(ad => ({
      ...ad,
      content: ad.content?.data || {}
    }));

    res.json({ data: transformed, total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Subscriber: List MY ads
 */
router.get('/my-ads', requireAuth, async (req, res) => {
  try {
    const customer = await prisma.customers.findFirst({
      where: { user_id: req.user.id }
    });

    if (!customer) return res.status(403).json({ error: 'Customer profile not found' });

    const ads = await prisma.classified_ads.findMany({
      where: { customer_id: customer.id },
      include: { category: true, content: true },
      orderBy: { created_at: 'desc' }
    });

    const transformed = ads.map(ad => ({
      ...ad,
      content: ad.content?.data || {}
    }));

    res.json(transformed);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Public: Get single ad
 */
router.get('/:slug', async (req, res) => {
  try {
    const ad = await prisma.classified_ads.findUnique({
      where: { slug: req.params.slug },
      include: {
        category: true,
        content: true,
        customer: {
          select: { first_name: true, last_name: true, email: true }
        }
      }
    });

    if (!ad) return res.status(404).json({ error: 'Ad not found' });
    
    res.json({
      ...ad,
      content: ad.content?.data || {}
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Subscriber: Create Ad
 */
router.post('/', requireAuth, async (req, res) => {
  try {
    const customer = await prisma.customers.findFirst({
      where: { user_id: req.user.id }
    });

    if (!customer) return res.status(403).json({ error: 'Customer profile not found' });

    const { 
      template_id, 
      title, 
      description, 
      price, 
      category_id, 
      condition, 
      location, 
      contact_info, 
      image,
      images,
      content
    } = req.body;

    const baseSlug = slugify(title, { lower: true, strict: true });
    let slug = `/classifieds/${baseSlug}`;
    
    // Simple collision avoidance
    const existingSlug = await prisma.content.findUnique({ where: { slug } });
    if (existingSlug) slug += `-${Date.now()}`;

    // 1. Create content record
    const contentRecord = await prisma.content.create({
      data: {
        module: 'classifieds',
        title,
        slug,
        data: content || {},
        search_index: generateSearchIndex(title, content || {})
      }
    });

    // 2. Create ad record
    const ad = await prisma.classified_ads.create({
      data: {
        customer_id: customer.id,
        content_id: contentRecord.id,
        template_id: template_id ? parseInt(template_id) : null,
        category_id: category_id ? parseInt(category_id) : null,
        title,
        slug,
        description,
        price: price ? parseFloat(price) : null,
        condition,
        location,
        contact_info,
        image,
        images: images || [],
        status: 'pending_review'
      },
      include: { content: true }
    });

    res.status(201).json({
      ...ad,
      content: ad.content?.data || {}
    });
  } catch (err) {
    console.error('Create ad error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Subscriber: Update Ad
 */
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const customer = await prisma.customers.findFirst({
      where: { user_id: req.user.id }
    });

    const adId = parseInt(req.params.id);
    const existing = await prisma.classified_ads.findUnique({ 
      where: { id: adId },
      include: { content: true }
    });

    if (!existing || existing.customer_id !== customer.id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const { 
      title, 
      description, 
      price, 
      category_id, 
      condition, 
      location, 
      contact_info, 
      image,
      images, 
      status,
      content
    } = req.body;

    // 1. Update content record if needed
    if (existing.content_id) {
      await updateContent(existing.content_id, {
        title: title || existing.title,
        data: content || existing.content?.data || {}
      });
    }

    // 2. Update ad record
    const ad = await prisma.classified_ads.update({
      where: { id: adId },
      data: {
        title,
        description,
        price: price ? parseFloat(price) : null,
        category_id: category_id ? parseInt(category_id) : null,
        condition,
        location,
        contact_info,
        image,
        images,
        status: status === 'sold' ? 'sold' : existing.status
      },
      include: { content: true }
    });

    res.json({
      ...ad,
      content: ad.content?.data || {}
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Subscriber: Delete Ad
 */
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const customer = await prisma.customers.findFirst({
      where: { user_id: req.user.id }
    });

    const adId = parseInt(req.params.id);
    const existing = await prisma.classified_ads.findUnique({ where: { id: adId } });

    if (!existing || existing.customer_id !== customer.id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Use transaction to ensure both are deleted
    await prisma.$transaction([
      prisma.classified_ads.delete({ where: { id: adId } }),
      ...(existing.content_id ? [prisma.content.delete({ where: { id: existing.content_id } })] : [])
    ]);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
