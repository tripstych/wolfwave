import { Router } from 'express';
import slugify from 'slugify';
import prisma from '../lib/prisma.js';
import { query } from '../db/connection.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { moderateAd } from '../services/classifiedModerationService.js';
import jwt from 'jsonwebtoken';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

// ---- Middleware ----

function requireCustomer(req, res, next) {
  const token = req.cookies?.customer_token ||
    req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role === 'admin') return res.status(403).json({ error: 'Customer access required' });
    req.customer = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

async function requireActiveSubscription(req, res, next) {
  const customerId = req.customer?.id || req.customer?.customerId;
  if (!customerId) return res.status(401).json({ error: 'Customer not found' });

  const sub = await prisma.customer_subscriptions.findFirst({
    where: { customer_id: customerId, status: 'active' },
  });
  if (!sub) return res.status(403).json({ error: 'Active subscription required to post classified ads' });
  next();
}

async function getClassifiedSettings() {
  const rows = await query(
    "SELECT setting_key, setting_value FROM settings WHERE setting_key LIKE 'classifieds_%'"
  );
  const s = {};
  rows.forEach(r => { s[r.setting_key] = r.setting_value; });
  return s;
}

function makeSlug(title) {
  return slugify(title, { lower: true, strict: true }).slice(0, 200) + '-' + Date.now();
}

// ==============================
// PUBLIC — Browse ads
// ==============================

router.get('/categories', async (req, res) => {
  try {
    const cats = await prisma.classified_categories.findMany({
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
      include: { children: { orderBy: { position: 'asc' } } },
    });
    // Return top-level with nested children
    res.json(cats.filter(c => !c.parent_id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/listings', async (req, res) => {
  try {
    const { category, search, min_price, max_price, condition, sort = 'newest', limit = 24, offset = 0 } = req.query;

    const where = { status: 'approved', OR: undefined };

    // Don't show expired
    where.OR = [
      { expires_at: null },
      { expires_at: { gt: new Date() } },
    ];

    if (category) {
      const cat = await prisma.classified_categories.findUnique({ where: { slug: category } });
      if (cat) where.category_id = cat.id;
    }
    if (condition && condition !== 'all') where.condition = condition;
    if (min_price || max_price) {
      where.price = {};
      if (min_price) where.price.gte = parseFloat(min_price);
      if (max_price) where.price.lte = parseFloat(max_price);
    }
    if (search) {
      where.AND = [
        { OR: [{ title: { contains: search } }, { description: { contains: search } }] },
      ];
    }

    const orderBy = sort === 'price_asc' ? { price: 'asc' }
      : sort === 'price_desc' ? { price: 'desc' }
      : { created_at: 'desc' };

    const [ads, total] = await Promise.all([
      prisma.classified_ads.findMany({
        where,
        include: { category: true, customer: { select: { first_name: true, last_name: true } } },
        orderBy,
        take: Math.min(parseInt(limit) || 24, 100),
        skip: parseInt(offset) || 0,
      }),
      prisma.classified_ads.count({ where }),
    ]);

    res.json({ ads, total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/listings/:slug', async (req, res) => {
  try {
    const ad = await prisma.classified_ads.findUnique({
      where: { slug: req.params.slug },
      include: {
        category: true,
        customer: { select: { first_name: true, last_name: true } },
      },
    });
    if (!ad || (ad.status !== 'approved' && ad.status !== 'sold')) {
      return res.status(404).json({ error: 'Ad not found' });
    }
    res.json(ad);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==============================
// CUSTOMER — Manage own ads
// ==============================

router.get('/my-ads', requireCustomer, async (req, res) => {
  try {
    const customerId = req.customer.id || req.customer.customerId;
    const ads = await prisma.classified_ads.findMany({
      where: { customer_id: customerId },
      include: { category: true },
      orderBy: { created_at: 'desc' },
    });
    res.json(ads);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', requireCustomer, requireActiveSubscription, async (req, res) => {
  try {
    const settings = await getClassifiedSettings();
    const customerId = req.customer.id || req.customer.customerId;
    const { title, description, price, currency, condition, category_id, location, contact_info, images } = req.body;

    if (!title) return res.status(400).json({ error: 'Title is required' });

    const maxImages = parseInt(settings.classifieds_max_images) || 8;
    if (images?.length > maxImages) {
      return res.status(400).json({ error: `Maximum ${maxImages} images allowed` });
    }

    // Resolve category name for moderation
    let categoryName = null;
    if (category_id) {
      const cat = await prisma.classified_categories.findUnique({ where: { id: parseInt(category_id) } });
      categoryName = cat?.name;
    }

    // AI moderation
    const moderation = await moderateAd({
      title, description, price, condition,
      category: categoryName,
      images, location,
    });

    const expiryDays = parseInt(settings.classifieds_expiry_days) || 30;
    const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);

    const ad = await prisma.classified_ads.create({
      data: {
        customer_id: customerId,
        title,
        slug: makeSlug(title),
        description,
        price: price != null ? parseFloat(price) : null,
        currency: currency || 'USD',
        condition: condition || 'na',
        category_id: category_id ? parseInt(category_id) : null,
        location,
        contact_info,
        images: images || [],
        status: moderation.approved ? 'approved' : 'pending_review',
        rejection_reason: moderation.approved ? null : moderation.reason,
        moderation_flags: moderation.flags.length ? moderation.flags : null,
        expires_at: expiresAt,
      },
      include: { category: true },
    });

    res.json({
      success: true,
      ad,
      moderation: { approved: moderation.approved, reason: moderation.reason, flags: moderation.flags },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', requireCustomer, requireActiveSubscription, async (req, res) => {
  try {
    const adId = parseInt(req.params.id);
    const customerId = req.customer.id || req.customer.customerId;

    const existing = await prisma.classified_ads.findUnique({ where: { id: adId } });
    if (!existing || existing.customer_id !== customerId) {
      return res.status(404).json({ error: 'Ad not found' });
    }

    const { title, description, price, currency, condition, category_id, location, contact_info, images } = req.body;

    // Re-run moderation if content changed
    const contentChanged = title !== existing.title || description !== existing.description || JSON.stringify(images) !== JSON.stringify(existing.images);

    let status = existing.status;
    let rejectionReason = existing.rejection_reason;
    let moderationFlags = existing.moderation_flags;

    if (contentChanged) {
      let categoryName = null;
      if (category_id) {
        const cat = await prisma.classified_categories.findUnique({ where: { id: parseInt(category_id) } });
        categoryName = cat?.name;
      }
      const moderation = await moderateAd({ title, description, price, condition, category: categoryName, images, location });
      status = moderation.approved ? 'approved' : 'pending_review';
      rejectionReason = moderation.approved ? null : moderation.reason;
      moderationFlags = moderation.flags.length ? moderation.flags : null;
    }

    const ad = await prisma.classified_ads.update({
      where: { id: adId },
      data: {
        title: title || existing.title,
        description,
        price: price != null ? parseFloat(price) : existing.price,
        currency: currency || existing.currency,
        condition: condition || existing.condition,
        category_id: category_id ? parseInt(category_id) : existing.category_id,
        location,
        contact_info,
        images: images || existing.images,
        status,
        rejection_reason: rejectionReason,
        moderation_flags: moderationFlags,
        updated_at: new Date(),
      },
      include: { category: true },
    });

    res.json({ success: true, ad });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/mark-sold', requireCustomer, async (req, res) => {
  try {
    const adId = parseInt(req.params.id);
    const customerId = req.customer.id || req.customer.customerId;
    const existing = await prisma.classified_ads.findUnique({ where: { id: adId } });
    if (!existing || existing.customer_id !== customerId) return res.status(404).json({ error: 'Ad not found' });

    const ad = await prisma.classified_ads.update({
      where: { id: adId },
      data: { status: 'sold', updated_at: new Date() },
    });
    res.json({ success: true, ad });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', requireCustomer, async (req, res) => {
  try {
    const adId = parseInt(req.params.id);
    const customerId = req.customer.id || req.customer.customerId;
    const existing = await prisma.classified_ads.findUnique({ where: { id: adId } });
    if (!existing || existing.customer_id !== customerId) return res.status(404).json({ error: 'Ad not found' });

    await prisma.classified_ads.delete({ where: { id: adId } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==============================
// ADMIN — Moderation & management
// ==============================

router.get('/admin/all', requireAuth, async (req, res) => {
  try {
    const { status, search, limit = 50, offset = 0 } = req.query;
    const where = {};
    if (status) where.status = status;
    if (search) {
      where.OR = [{ title: { contains: search } }, { description: { contains: search } }];
    }

    const [ads, total] = await Promise.all([
      prisma.classified_ads.findMany({
        where,
        include: {
          category: true,
          customer: { select: { id: true, email: true, first_name: true, last_name: true } },
        },
        orderBy: { created_at: 'desc' },
        take: parseInt(limit),
        skip: parseInt(offset),
      }),
      prisma.classified_ads.count({ where }),
    ]);

    res.json({ ads, total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Classifieds Settings ----

router.get('/admin/settings', requireAuth, async (req, res) => {
  try {
    const settings = await getClassifiedSettings();
    res.json({
      classifieds_enabled: settings.classifieds_enabled || 'true',
      classifieds_auto_approve: settings.classifieds_auto_approve || 'false',
      classifieds_expiry_days: settings.classifieds_expiry_days || '30',
      classifieds_max_images: settings.classifieds_max_images || '8',
      classifieds_ai_moderation: settings.classifieds_ai_moderation || 'false',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/admin/settings', requireAuth, requireAdmin, async (req, res) => {
  try {
    const keys = ['classifieds_enabled', 'classifieds_auto_approve', 'classifieds_expiry_days', 'classifieds_max_images', 'classifieds_ai_moderation'];
    for (const key of keys) {
      if (req.body[key] !== undefined) {
        await query(
          `INSERT INTO settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = ?`,
          [key, String(req.body[key]), String(req.body[key])]
        );
      }
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Categories CRUD ----

router.get('/admin/categories/all', requireAuth, async (req, res) => {
  try {
    const cats = await prisma.classified_categories.findMany({
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
      include: { children: { orderBy: { position: 'asc' } }, _count: { select: { classified_ads: true } } },
    });
    res.json(cats.filter(c => !c.parent_id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/admin/categories', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, parent_id, position } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const slug = slugify(name, { lower: true, strict: true });
    const cat = await prisma.classified_categories.create({
      data: { name, slug, parent_id: parent_id ? parseInt(parent_id) : null, position: position || 0 },
    });
    res.json({ success: true, category: cat });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/admin/categories/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, parent_id, position } = req.body;
    const data = {};
    if (name) { data.name = name; data.slug = slugify(name, { lower: true, strict: true }); }
    if (parent_id !== undefined) data.parent_id = parent_id ? parseInt(parent_id) : null;
    if (position !== undefined) data.position = position;

    const cat = await prisma.classified_categories.update({ where: { id: parseInt(req.params.id) }, data });
    res.json({ success: true, category: cat });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/admin/categories/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    // Set ads in this category to uncategorized
    await prisma.classified_ads.updateMany({ where: { category_id: parseInt(req.params.id) }, data: { category_id: null } });
    await prisma.classified_categories.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Moderation Rules CRUD ----

router.get('/admin/moderation-rules', requireAuth, async (req, res) => {
  try {
    const rules = await prisma.classified_moderation_rules.findMany({ orderBy: { id: 'asc' } });
    res.json(rules);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/admin/moderation-rules', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id, name, rule_type, description, enabled } = req.body;
    if (!name || !rule_type) return res.status(400).json({ error: 'Name and rule_type required' });

    let rule;
    if (id) {
      rule = await prisma.classified_moderation_rules.update({
        where: { id: parseInt(id) },
        data: { name, rule_type, description, enabled: enabled !== false },
      });
    } else {
      rule = await prisma.classified_moderation_rules.create({
        data: { name, rule_type, description: description || '', enabled: enabled !== false },
      });
    }
    res.json({ success: true, rule });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/admin/moderation-rules/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    await prisma.classified_moderation_rules.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Single Ad by ID (must be AFTER all specific /admin/* routes) ----

router.get('/admin/:id', requireAuth, async (req, res) => {
  console.trace(`[CLASSIFIEDS DEBUG] /admin/:id hit with id="${req.params.id}", full URL: ${req.originalUrl}`);
  try {
    const adId = parseInt(req.params.id);

    if (!adId || isNaN(adId)) {
      console.trace(`[CLASSIFIEDS DEBUG] Invalid ad ID: "${req.params.id}", originalUrl: ${req.originalUrl}`);
      return res.status(400).json({ error: 'Invalid ad ID' });
    }

    const ad = await prisma.classified_ads.findUnique({
      where: { id: adId },
      include: {
        category: true,
        customer: { select: { id: true, email: true, first_name: true, last_name: true } },
      },
    });
    if (!ad) return res.status(404).json({ error: 'Ad not found' });
    res.json(ad);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/admin/:id/approve', requireAuth, requireAdmin, async (req, res) => {
  try {
    const ad = await prisma.classified_ads.update({
      where: { id: parseInt(req.params.id) },
      data: { status: 'approved', rejection_reason: null, updated_at: new Date() },
    });
    res.json({ success: true, ad });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/admin/:id/reject', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { reason } = req.body;
    const ad = await prisma.classified_ads.update({
      where: { id: parseInt(req.params.id) },
      data: { status: 'rejected', rejection_reason: reason || 'Rejected by admin', updated_at: new Date() },
    });
    res.json({ success: true, ad });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
