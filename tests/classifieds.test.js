import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Mock Prisma ----
const mockPrisma = {
  classified_ads: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  classified_categories: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  classified_moderation_rules: {
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  customer_subscriptions: {
    findFirst: vi.fn(),
  },
};

vi.mock('../server/lib/prisma.js', () => ({ default: mockPrisma }));

// ---- Mock DB query ----
const mockQuery = vi.fn();
vi.mock('../server/db/connection.js', () => ({
  query: (...args) => mockQuery(...args),
}));

// ---- Mock moderation service ----
const mockModerateAd = vi.fn();
vi.mock('../server/services/classifiedModerationService.js', () => ({
  moderateAd: (...args) => mockModerateAd(...args),
}));

// ---- Mock slugify ----
vi.mock('slugify', () => ({
  default: (str, opts) => str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
}));

// ---- Mock jwt ----
vi.mock('jsonwebtoken', () => ({
  default: {
    verify: vi.fn(),
  },
}));

import jwt from 'jsonwebtoken';

// ---- Helpers ----

function makeReq(overrides = {}) {
  return {
    params: {},
    query: {},
    body: {},
    cookies: {},
    headers: {},
    customer: null,
    ...overrides,
  };
}

function makeRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) { res.statusCode = code; return res; },
    json(data) { res.body = data; return res; },
  };
  return res;
}

// Extract route handlers from express router
async function getRouteHandlers() {
  const mod = await import('../server/api/classifieds.js');
  const router = mod.default;
  const routes = {};

  // Walk the router stack to extract handlers
  for (const layer of router.stack) {
    if (layer.route) {
      const method = Object.keys(layer.route.methods)[0];
      const path = layer.route.path;
      const key = `${method.toUpperCase()} ${path}`;
      // Get the last handler (after middleware)
      const handlers = layer.route.stack.map(s => s.handle);
      routes[key] = handlers;
    }
  }
  return routes;
}

// Run a chain of Express middleware/handlers
async function runHandlers(handlers, req, res) {
  for (const handler of handlers) {
    let nextCalled = false;
    await handler(req, res, () => { nextCalled = true; });
    if (!nextCalled && res.body !== null) break; // response was sent
    if (!nextCalled) break; // handler didn't call next, but also didn't respond
  }
}

// ==============================
// Tests
// ==============================

describe('Classifieds Module', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.mockResolvedValue([]);
  });

  // ---- Moderation Service ----
  describe('Moderation Logic', () => {
    it('should auto-approve when auto_approve setting is true and AI is off', async () => {
      // Import the actual service (not mocked)
      vi.doUnmock('../server/services/classifiedModerationService.js');

      // Mock dependencies for the real service
      const mockRules = [];
      mockPrisma.classified_moderation_rules.findMany.mockResolvedValue(mockRules);

      // Mock settings: AI off, auto-approve on
      mockQuery.mockImplementation(async (sql) => {
        if (sql.includes('classifieds_ai_moderation')) return [{ setting_value: 'false' }];
        if (sql.includes('classifieds_auto_approve')) return [{ setting_value: 'true' }];
        return [];
      });

      const { moderateAd } = await import('../server/services/classifiedModerationService.js');
      const result = await moderateAd({ title: 'Test Ad', description: 'A nice item' });

      expect(result.approved).toBe(true);
      expect(result.flags).toEqual([]);

      // Re-mock for other tests
      vi.doMock('../server/services/classifiedModerationService.js', () => ({
        moderateAd: (...args) => mockModerateAd(...args),
      }));
    });

    it('should queue for manual review when both AI and auto-approve are off', async () => {
      vi.doUnmock('../server/services/classifiedModerationService.js');

      mockQuery.mockImplementation(async (sql) => {
        if (sql.includes('classifieds_ai_moderation')) return [{ setting_value: 'false' }];
        if (sql.includes('classifieds_auto_approve')) return [{ setting_value: 'false' }];
        return [];
      });

      const { moderateAd } = await import('../server/services/classifiedModerationService.js');
      const result = await moderateAd({ title: 'Test Ad', description: 'Something' });

      expect(result.approved).toBe(false);
      expect(result.flags).toContain('manual_review');

      vi.doMock('../server/services/classifiedModerationService.js', () => ({
        moderateAd: (...args) => mockModerateAd(...args),
      }));
    });
  });

  // ---- Public Routes ----
  describe('Public Listings API', () => {

    it('GET /listings should return approved ads', async () => {
      const routes = await getRouteHandlers();
      const handlers = routes['GET /listings'];

      const mockAds = [
        { id: 1, title: 'Used Bike', status: 'approved', price: 150, category: { name: 'Vehicles' } },
        { id: 2, title: 'Guitar', status: 'approved', price: 300, category: { name: 'Music' } },
      ];

      mockPrisma.classified_ads.findMany.mockResolvedValue(mockAds);
      mockPrisma.classified_ads.count.mockResolvedValue(2);

      const req = makeReq({ query: {} });
      const res = makeRes();
      await runHandlers(handlers, req, res);

      expect(res.body.ads).toHaveLength(2);
      expect(res.body.total).toBe(2);
      expect(mockPrisma.classified_ads.findMany).toHaveBeenCalled();
    });

    it('GET /listings should filter by category slug', async () => {
      const routes = await getRouteHandlers();
      const handlers = routes['GET /listings'];

      mockPrisma.classified_categories.findUnique.mockResolvedValue({ id: 5, slug: 'electronics' });
      mockPrisma.classified_ads.findMany.mockResolvedValue([]);
      mockPrisma.classified_ads.count.mockResolvedValue(0);

      const req = makeReq({ query: { category: 'electronics' } });
      const res = makeRes();
      await runHandlers(handlers, req, res);

      expect(mockPrisma.classified_categories.findUnique).toHaveBeenCalledWith({
        where: { slug: 'electronics' },
      });
    });

    it('GET /listings/:slug should return a single ad', async () => {
      const routes = await getRouteHandlers();
      const handlers = routes['GET /listings/:slug'];

      const mockAd = { id: 1, slug: 'used-bike', title: 'Used Bike', status: 'approved' };
      mockPrisma.classified_ads.findUnique.mockResolvedValue(mockAd);

      const req = makeReq({ params: { slug: 'used-bike' } });
      const res = makeRes();
      await runHandlers(handlers, req, res);

      expect(res.body.title).toBe('Used Bike');
    });

    it('GET /listings/:slug should 404 for non-approved ads', async () => {
      const routes = await getRouteHandlers();
      const handlers = routes['GET /listings/:slug'];

      mockPrisma.classified_ads.findUnique.mockResolvedValue({
        id: 1, slug: 'pending-item', status: 'pending_review',
      });

      const req = makeReq({ params: { slug: 'pending-item' } });
      const res = makeRes();
      await runHandlers(handlers, req, res);

      expect(res.statusCode).toBe(404);
    });
  });

  // ---- Customer Routes ----
  describe('Customer Ad Posting', () => {

    function authCustomerReq(body = {}) {
      jwt.verify.mockReturnValue({ id: 42, email: 'customer@test.com' });
      return makeReq({
        cookies: { customer_token: 'valid-token' },
        customer: { id: 42, email: 'customer@test.com' },
        body,
      });
    }

    it('POST / should create an ad when subscription is active and moderation passes', async () => {
      const routes = await getRouteHandlers();
      const handlers = routes['POST /'];

      // Active subscription
      mockPrisma.customer_subscriptions.findFirst.mockResolvedValue({ id: 1, status: 'active' });

      // Settings
      mockQuery.mockResolvedValue([]);

      // Moderation passes
      mockModerateAd.mockResolvedValue({ approved: true, reason: null, flags: [] });

      const createdAd = {
        id: 10, title: 'My Item', slug: 'my-item-123', status: 'approved',
        customer_id: 42, category: null,
      };
      mockPrisma.classified_ads.create.mockResolvedValue(createdAd);

      const req = authCustomerReq({
        title: 'My Item',
        description: 'Great condition',
        price: 50,
        condition: 'used',
      });
      const res = makeRes();
      await runHandlers(handlers, req, res);

      expect(res.body.success).toBe(true);
      expect(res.body.ad.title).toBe('My Item');
      expect(res.body.moderation.approved).toBe(true);
    });

    it('POST / should set status to pending_review when moderation rejects', async () => {
      const routes = await getRouteHandlers();
      const handlers = routes['POST /'];

      mockPrisma.customer_subscriptions.findFirst.mockResolvedValue({ id: 1, status: 'active' });
      mockQuery.mockResolvedValue([]);
      mockModerateAd.mockResolvedValue({ approved: false, reason: 'Contains blocked content', flags: ['nudity'] });

      const createdAd = {
        id: 11, title: 'Flagged Item', slug: 'flagged-item-123', status: 'pending_review',
        customer_id: 42, category: null,
      };
      mockPrisma.classified_ads.create.mockResolvedValue(createdAd);

      const req = authCustomerReq({ title: 'Flagged Item', description: 'Something' });
      const res = makeRes();
      await runHandlers(handlers, req, res);

      expect(res.body.moderation.approved).toBe(false);
      expect(res.body.moderation.flags).toContain('nudity');
    });

    it('POST / should reject without subscription', async () => {
      const routes = await getRouteHandlers();
      const handlers = routes['POST /'];

      mockPrisma.customer_subscriptions.findFirst.mockResolvedValue(null);

      const req = authCustomerReq({ title: 'No Sub Item' });
      const res = makeRes();
      await runHandlers(handlers, req, res);

      expect(res.statusCode).toBe(403);
      expect(res.body.error).toMatch(/subscription/i);
    });

    it('POST /:id/mark-sold should update status', async () => {
      const routes = await getRouteHandlers();
      const handlers = routes['POST /:id/mark-sold'];

      mockPrisma.classified_ads.findUnique.mockResolvedValue({ id: 10, customer_id: 42 });
      mockPrisma.classified_ads.update.mockResolvedValue({ id: 10, status: 'sold' });

      const req = authCustomerReq();
      req.params = { id: '10' };
      const res = makeRes();
      await runHandlers(handlers, req, res);

      expect(res.body.success).toBe(true);
      expect(res.body.ad.status).toBe('sold');
    });

    it('DELETE /:id should not allow deleting another customer\'s ad', async () => {
      const routes = await getRouteHandlers();
      const handlers = routes['DELETE /:id'];

      mockPrisma.classified_ads.findUnique.mockResolvedValue({ id: 10, customer_id: 999 }); // different customer

      const req = authCustomerReq();
      req.params = { id: '10' };
      const res = makeRes();
      await runHandlers(handlers, req, res);

      expect(res.statusCode).toBe(404);
      expect(mockPrisma.classified_ads.delete).not.toHaveBeenCalled();
    });
  });

  // ---- Admin Routes ----
  describe('Admin Moderation', () => {

    function adminReq(overrides = {}) {
      return makeReq({
        user: { id: 1, role: 'admin' },
        ...overrides,
      });
    }

    it('POST /admin/:id/approve should set status to approved', async () => {
      const routes = await getRouteHandlers();
      const handlers = routes['POST /admin/:id/approve'];

      mockPrisma.classified_ads.update.mockResolvedValue({ id: 5, status: 'approved' });

      const req = adminReq({ params: { id: '5' } });
      const res = makeRes();
      // Skip auth middleware for unit test — call final handler directly
      await handlers[handlers.length - 1](req, res, () => {});

      expect(mockPrisma.classified_ads.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 5 },
          data: expect.objectContaining({ status: 'approved', rejection_reason: null }),
        })
      );
    });

    it('POST /admin/:id/reject should set status and reason', async () => {
      const routes = await getRouteHandlers();
      const handlers = routes['POST /admin/:id/reject'];

      mockPrisma.classified_ads.update.mockResolvedValue({ id: 5, status: 'rejected' });

      const req = adminReq({ params: { id: '5' }, body: { reason: 'Inappropriate content' } });
      const res = makeRes();
      await handlers[handlers.length - 1](req, res, () => {});

      expect(mockPrisma.classified_ads.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'rejected', rejection_reason: 'Inappropriate content' }),
        })
      );
    });
  });

  // ---- Categories CRUD ----
  describe('Categories', () => {

    it('POST /admin/categories should create a category', async () => {
      const routes = await getRouteHandlers();
      const handlers = routes['POST /admin/categories'];

      mockPrisma.classified_categories.create.mockResolvedValue({ id: 1, name: 'Electronics', slug: 'electronics' });

      const req = makeReq({ body: { name: 'Electronics' }, user: { id: 1, role: 'admin' } });
      const res = makeRes();
      await handlers[handlers.length - 1](req, res, () => {});

      expect(res.body.success).toBe(true);
      expect(res.body.category.name).toBe('Electronics');
    });

    it('DELETE /admin/categories/:id should uncategorize ads before deleting', async () => {
      const routes = await getRouteHandlers();
      const handlers = routes['DELETE /admin/categories/:id'];

      mockPrisma.classified_ads.updateMany.mockResolvedValue({ count: 3 });
      mockPrisma.classified_categories.delete.mockResolvedValue({});

      const req = makeReq({ params: { id: '5' }, user: { id: 1, role: 'admin' } });
      const res = makeRes();
      await handlers[handlers.length - 1](req, res, () => {});

      // Should uncategorize ads first
      expect(mockPrisma.classified_ads.updateMany).toHaveBeenCalledWith({
        where: { category_id: 5 },
        data: { category_id: null },
      });
      expect(mockPrisma.classified_categories.delete).toHaveBeenCalledWith({ where: { id: 5 } });
      expect(res.body.success).toBe(true);
    });
  });

  // ---- Moderation Rules ----
  describe('Moderation Rules', () => {

    it('POST /admin/moderation-rules should create a new rule', async () => {
      const routes = await getRouteHandlers();
      const handlers = routes['POST /admin/moderation-rules'];

      mockPrisma.classified_moderation_rules.create.mockResolvedValue({
        id: 1, name: 'No Weapons', rule_type: 'block', description: 'Weapons not allowed', enabled: true,
      });

      const req = makeReq({
        body: { name: 'No Weapons', rule_type: 'block', description: 'Weapons not allowed' },
        user: { id: 1, role: 'admin' },
      });
      const res = makeRes();
      await handlers[handlers.length - 1](req, res, () => {});

      expect(res.body.success).toBe(true);
      expect(res.body.rule.name).toBe('No Weapons');
      expect(res.body.rule.rule_type).toBe('block');
    });

    it('POST /admin/moderation-rules should update existing rule when id is passed', async () => {
      const routes = await getRouteHandlers();
      const handlers = routes['POST /admin/moderation-rules'];

      mockPrisma.classified_moderation_rules.update.mockResolvedValue({
        id: 1, name: 'Updated Rule', rule_type: 'allow', enabled: true,
      });

      const req = makeReq({
        body: { id: 1, name: 'Updated Rule', rule_type: 'allow' },
        user: { id: 1, role: 'admin' },
      });
      const res = makeRes();
      await handlers[handlers.length - 1](req, res, () => {});

      expect(mockPrisma.classified_moderation_rules.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 1 } })
      );
    });

    it('POST /admin/moderation-rules should reject without name', async () => {
      const routes = await getRouteHandlers();
      const handlers = routes['POST /admin/moderation-rules'];

      const req = makeReq({
        body: { rule_type: 'block' },
        user: { id: 1, role: 'admin' },
      });
      const res = makeRes();
      await handlers[handlers.length - 1](req, res, () => {});

      expect(res.statusCode).toBe(400);
    });
  });

  // ---- Settings ----
  describe('Classifieds Settings', () => {

    it('GET /admin/settings should return defaults when nothing configured', async () => {
      const routes = await getRouteHandlers();
      const handlers = routes['GET /admin/settings'];

      mockQuery.mockResolvedValue([]);

      const req = makeReq({ user: { id: 1, role: 'admin' } });
      const res = makeRes();
      await handlers[handlers.length - 1](req, res, () => {});

      expect(res.body.classifieds_enabled).toBe('true');
      expect(res.body.classifieds_expiry_days).toBe('30');
      expect(res.body.classifieds_max_images).toBe('8');
      expect(res.body.classifieds_ai_moderation).toBe('false');
    });

    it('PUT /admin/settings should save settings', async () => {
      const routes = await getRouteHandlers();
      const handlers = routes['PUT /admin/settings'];

      mockQuery.mockResolvedValue([]);

      const req = makeReq({
        body: { classifieds_expiry_days: '60', classifieds_ai_moderation: 'true' },
        user: { id: 1, role: 'admin' },
      });
      const res = makeRes();
      await handlers[handlers.length - 1](req, res, () => {});

      expect(res.body.success).toBe(true);
      // Should have called query for each setting key
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO settings'),
        ['classifieds_expiry_days', '60', '60']
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO settings'),
        ['classifieds_ai_moderation', 'true', 'true']
      );
    });
  });
});
