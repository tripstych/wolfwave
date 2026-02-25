import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import slugify from 'slugify';
import { generateSearchIndex } from '../lib/searchIndexer.js';
import { updateContent } from '../services/contentService.js';
import { downloadMedia, processHtmlMedia } from '../services/mediaService.js';

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

    // Fetch content manually
    const contentIds = ads.map(a => a.content_id).filter(Boolean);
    const contents = await prisma.content.findMany({
      where: { id: { in: contentIds } }
    });
    const contentMap = Object.fromEntries(contents.map(c => [c.id, c]));

    const total = await prisma.classified_ads.count({ where });

    // Transform content data
    const transformed = ads.map(ad => ({
      ...ad,
      content: contentMap[ad.content_id]?.data || {}
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
      include: { category: true },
      orderBy: { created_at: 'desc' }
    });

    // Fetch content manually
    const contentIds = ads.map(a => a.content_id).filter(Boolean);
    const contents = await prisma.content.findMany({
      where: { id: { in: contentIds } }
    });
    const contentMap = Object.fromEntries(contents.map(c => [c.id, c]));

    const transformed = ads.map(ad => ({
      ...ad,
      content: contentMap[ad.content_id]?.data || {}
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
        customer: {
          select: { first_name: true, last_name: true, email: true }
        }
      }
    });

    if (!ad) return res.status(404).json({ error: 'Ad not found' });
    
    // Fetch content manually
    let adContent = null;
    if (ad.content_id) {
      adContent = await prisma.content.findUnique({ where: { id: ad.content_id } });
    }

    res.json({
      ...ad,
      content: adContent?.data || {}
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

    // Process and localize media
    const userId = req.user?.id;
    const processedImage = image ? await downloadMedia(image, title, userId) : null;
    const processedImages = images ? await Promise.all(images.map(img => downloadMedia(img.url || img, title, userId).then(url => ({ url, alt: img.alt || '', position: img.position })))) : [];
    
    const processContentMedia = async (obj) => {
      if (!obj || typeof obj !== 'object') return obj;
      if (Array.isArray(obj)) return Promise.all(obj.map(item => processContentMedia(item)));
      
      const newObj = { ...obj };
      for (const [key, val] of Object.entries(newObj)) {
        if (typeof val === 'string') {
          if (val.startsWith('http') && (val.match(/\.(jpg|jpeg|png|webp|gif|svg|mp4|webm|ogg|mov)/i))) {
            newObj[key] = await downloadMedia(val, title, userId);
          } else if (val.includes('<img') || val.includes('<video')) {
            newObj[key] = await processHtmlMedia(val, userId);
          }
        } else if (typeof val === 'object') {
          newObj[key] = await processContentMedia(val);
        }
      }
      return newObj;
    };

    const processedContent = await processContentMedia(content || {});

    // 1. Create content record
    const contentRecord = await prisma.content.create({
      data: {
        module: 'classifieds',
        title,
        slug,
        data: processedContent,
        search_index: generateSearchIndex(title, processedContent)
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
        image: processedImage,
        images: processedImages,
        status: 'pending_review'
      }
    });

    res.status(201).json({
      ...ad,
      content: processedContent
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
      where: { id: adId }
    });

    if (!existing || existing.customer_id !== customer.id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Fetch existing content manually
    let existingContent = null;
    if (existing.content_id) {
      existingContent = await prisma.content.findUnique({ where: { id: existing.content_id } });
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

    // Process and localize media
    const userId = req.user?.id;
    const processedImage = image ? await downloadMedia(image, title || existing.title, userId) : existing.image;
    const processedImages = images ? await Promise.all(images.map(img => downloadMedia(img.url || img, title || existing.title, userId).then(url => ({ url, alt: img.alt || '', position: img.position })))) : existing.images;
    
    const processContentMedia = async (obj) => {
      if (!obj || typeof obj !== 'object') return obj;
      if (Array.isArray(obj)) return Promise.all(obj.map(item => processContentMedia(item)));
      
      const newObj = { ...obj };
      for (const [key, val] of Object.entries(newObj)) {
        if (typeof val === 'string') {
          if (val.startsWith('http') && (val.match(/\.(jpg|jpeg|png|webp|gif|svg|mp4|webm|ogg|mov)/i))) {
            newObj[key] = await downloadMedia(val, title || existing.title, userId);
          } else if (val.includes('<img') || val.includes('<video')) {
            newObj[key] = await processHtmlMedia(val, userId);
          }
        } else if (typeof val === 'object') {
          newObj[key] = await processContentMedia(val);
        }
      }
      return newObj;
    };

    const processedContent = await processContentMedia(content || existingContent?.data || {});

    // 1. Update content record if needed
    if (existing.content_id) {
      await updateContent(existing.content_id, {
        title: title || existing.title,
        data: processedContent
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
        image: processedImage,
        images: processedImages,
        status: status === 'sold' ? 'sold' : existing.status
      }
    });

    res.json({
      ...ad,
      content: processedContent
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
