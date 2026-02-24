import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import slugify from 'slugify';

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
        customer: {
          select: { first_name: true, last_name: true }
        }
      },
      orderBy: { created_at: 'desc' },
      take: parseInt(limit),
      skip: parseInt(offset)
    });

    const total = await prisma.classified_ads.count({ where });

    res.json({ data: ads, total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Subscriber: List MY ads
 */
router.get('/my-ads', requireAuth, async (req, res) => {
  try {
    // Assuming customers are linked to users via user_id
    const customer = await prisma.customers.findFirst({
      where: { user_id: req.user.id }
    });

    if (!customer) return res.status(403).json({ error: 'Customer profile not found' });

    const ads = await prisma.classified_ads.findMany({
      where: { customer_id: customer.id },
      include: { category: true },
      orderBy: { created_at: 'desc' }
    });

    res.json(ads);
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
        customer: {
          select: { first_name: true, last_name: true, email: true }
        }
      }
    });

    if (!ad) return res.status(404).json({ error: 'Ad not found' });
    res.json(ad);
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

    const { title, description, price, category_id, condition, location, contact_info, images } = req.body;

    const baseSlug = slugify(title, { lower: true, strict: true });
    const slug = `${baseSlug}-${Date.now()}`;

    const ad = await prisma.classified_ads.create({
      data: {
        customer_id: customer.id,
        title,
        description,
        price: price ? parseFloat(price) : null,
        category_id: category_id ? parseInt(category_id) : null,
        condition,
        location,
        contact_info,
        images: images || [],
        slug,
        status: 'pending_review'
      }
    });

    res.status(201).json(ad);
  } catch (err) {
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
    const existing = await prisma.classified_ads.findUnique({ where: { id: adId } });

    if (!existing || existing.customer_id !== customer.id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const { title, description, price, category_id, condition, location, contact_info, images, status } = req.body;

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
        images,
        status: status === 'sold' ? 'sold' : existing.status // Only allow marking as sold
      }
    });

    res.json(ad);
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

    await prisma.classified_ads.delete({ where: { id: adId } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
