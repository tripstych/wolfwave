import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import couponsRouter from '../server/api/coupons.js';

// Mock the database query helper
vi.mock('../server/db/connection.js', () => ({
  query: vi.fn(),
  getPool: vi.fn()
}));

// Mock auth middleware
vi.mock('../server/middleware/auth.js', () => ({
  requireAuth: (req, res, next) => {
    req.user = { id: 1, role: 'admin' };
    next();
  },
  requireAdmin: (req, res, next) => next()
}));

// Mock logger
vi.mock('../server/lib/logger.js', () => ({
  error: vi.fn()
}));

import { query } from '../server/db/connection.js';

describe('Coupons API', () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/coupons', couponsRouter);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should list coupons with pagination', async () => {
    const mockCoupons = [
      { id: 1, code: 'SAVE10', discount_type: 'percentage', discount_value: 10, target_slugs: '["*"]' },
      { id: 2, code: 'SAVE20', discount_type: 'fixed', discount_value: 20, target_slugs: null }
    ];

    query.mockResolvedValueOnce(mockCoupons); // For SELECT *
    query.mockResolvedValueOnce([{ total: 2 }]); // For SELECT COUNT(*)

    const res = await request(app).get('/api/coupons?limit=25&offset=0');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].code).toBe('SAVE10');
    expect(res.body.data[0].target_slugs).toEqual(['*']);
    expect(res.body.data[1].target_slugs).toEqual([]);
    expect(res.body.pagination.total).toBe(2);
  });

  it('should filter coupons by search term', async () => {
    query.mockResolvedValueOnce([]); // Results
    query.mockResolvedValueOnce([{ total: 0 }]); // Total

    await request(app).get('/api/coupons?search=SAVE');

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE code LIKE ?'),
      expect.arrayContaining(['%SAVE%'])
    );
  });

  it('should create a new coupon', async () => {
    const newCoupon = {
      code: 'NEWYEAR',
      discount_type: 'percentage',
      discount_value: 15,
      is_active: true
    };

    query.mockResolvedValueOnce({ insertId: 3 }); // For INSERT
    query.mockResolvedValueOnce([{ id: 3, ...newCoupon }]); // For SELECT *

    const res = await request(app)
      .post('/api/coupons')
      .send(newCoupon);

    expect(res.status).toBe(201);
    expect(res.body.code).toBe('NEWYEAR');
  });

  it('should handle database errors gracefully', async () => {
    query.mockRejectedValueOnce(new Error('Database connection failed'));

    const res = await request(app).get('/api/coupons');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to list coupons');
  });
});
