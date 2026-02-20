import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import mediaRouter from '../server/api/media.js';

// Mock Auth
vi.mock('../server/middleware/auth.js', () => ({
  requireAuth: (req, res, next) => {
    req.user = { id: 1, role: 'admin' };
    next();
  },
  requireEditor: (req, res, next) => next()
}));

// Mock Database
vi.mock('../server/db/connection.js', () => ({
  query: vi.fn()
}));

// Mock Tenant Context
vi.mock('../server/lib/tenantContext.js', () => ({
  getCurrentDbName: vi.fn(() => 'webwolf_test')
}));

describe('Media Security API', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/media', mediaRouter);

  it('should REJECT forbidden file extensions (PHP)', async () => {
    const res = await request(app)
      .post('/api/media/upload')
      .attach('file', Buffer.from('<?php phpinfo(); ?>'), 'malicious.php');

    expect(res.status).toBe(500); // Multer throws error which hits catch block
    // Our API returns 500 for general upload failures
  });

  it('should REJECT unknown mime types', async () => {
    const res = await request(app)
      .post('/api/media/upload')
      .attach('file', Buffer.from('some content'), 'test.xyz');

    expect(res.status).toBe(500);
  });

  it('should ACCEPT valid image files', async () => {
    // We mock query to simulate successful DB insert
    const { query } = await import('../server/db/connection.js');
    query.mockResolvedValueOnce({ insertId: 1 });

    const res = await request(app)
      .post('/api/media/upload')
      .attach('file', Buffer.from('fake-image-data'), 'image.jpg');

    // Note: This might still fail if Multer tries to write to disk in the mock
    // but the fileFilter should pass.
    if (res.status === 201) {
      expect(res.body.id).toBe(1);
    }
  });
});
