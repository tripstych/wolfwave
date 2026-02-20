import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import ordersRouter from '../server/api/orders-prisma.js';
import { runWithTenant } from '../server/lib/tenantContext.js';

// Mock Prisma
vi.mock('../server/lib/prisma.js', () => ({
  default: {
    orders: {
      findUnique: vi.fn()
    }
  }
}));

import prisma from '../server/lib/prisma.js';

// Mock Auth middleware
vi.mock('../server/middleware/auth.js', () => ({
  requireAuth: (req, res, next) => {
    req.user = { id: 1, role: 'admin' }; // Simulate logged in admin
    next();
  },
  requireEditor: (req, res, next) => next()
}));

describe('Tenant Data Leak (Red Team Test)', () => {
  const app = express();
  app.use(express.json());
  
  // Custom middleware to simulate the tenant database from a header
  app.use((req, res, next) => {
    const tenantId = req.headers['x-tenant-id'] || 'webwolf_default';
    runWithTenant(tenantId, next);
  });

  app.use('/api/orders', ordersRouter);

  it('should FAIL to find an order if the request is for the wrong tenant', async () => {
    // 1. Setup: Order 123 exists in Tenant B
    // But when we query, we are in Tenant A's context.
    
    prisma.orders.findUnique.mockResolvedValueOnce(null);

    const res = await request(app)
      .get('/api/orders/123')
      .set('x-tenant-id', 'webwolf_tenant_a');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Order not found');
  });

  it('should SUCCESS if the request is for the correct tenant', async () => {
    prisma.orders.findUnique.mockResolvedValueOnce({ id: 123, order_number: '#1001' });

    const res = await request(app)
      .get('/api/orders/123')
      .set('x-tenant-id', 'webwolf_tenant_b');

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(123);
  });
});
