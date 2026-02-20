import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import authRouter from '../server/api/auth.js';

// Mock the database query helper
vi.mock('../server/db/connection.js', () => ({
  query: vi.fn()
}));

// Mock the tenant context helper
vi.mock('../server/lib/tenantContext.js', () => ({
  getCurrentDbName: vi.fn(() => 'webwolf_test')
}));

import { query } from '../server/db/connection.js';

describe('Auth API', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);

  it('should return 401 for invalid credentials', async () => {
    // Mock user not found
    query.mockResolvedValueOnce([]);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'wrong@example.com', password: 'password' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');
  });

  it('should return 400 if email or password missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'only-email@example.com' });

    expect(res.status).toBe(400);
  });
});
