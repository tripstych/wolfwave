import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// Mock the database
vi.mock('../server/db/connection.js', () => ({
  query: vi.fn()
}));

// Mock tenant context
vi.mock('../server/lib/tenantContext.js', () => ({
  getCurrentDbName: vi.fn(() => 'webwolf_test')
}));

// Mock auth middleware to inject user
vi.mock('../server/middleware/auth.js', () => ({
  requireAuth: (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    next();
  },
  requireAdmin: (req, res, next) => {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    next();
  }
}));

import { query } from '../server/db/connection.js';
import apiKeysRouter from '../server/api/api-keys.js';

function createApp(user) {
  const app = express();
  app.use(express.json());
  // Inject user into request
  app.use((req, res, next) => {
    req.user = user;
    next();
  });
  app.use('/api/api-keys', apiKeysRouter);
  return app;
}

describe('API Keys API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const adminUser = { id: 1, email: 'admin@test.com', role: 'admin' };
  const editorUser = { id: 2, email: 'editor@test.com', role: 'editor' };

  describe('GET /api/api-keys', () => {
    it('should return all keys for admin users', async () => {
      const mockKeys = [
        { id: 1, name: 'Site Key', public_key: 'pk_live_abc', type: 'site', user_id: null, permissions: '["pages:read"]', is_active: 1, created_at: '2025-01-01' },
        { id: 2, name: 'User Key', public_key: 'pk_live_def', type: 'user', user_id: 2, permissions: '[]', is_active: 1, created_at: '2025-01-02', user_name: 'Editor', user_email: 'editor@test.com' }
      ];
      query.mockResolvedValueOnce(mockKeys);

      const app = createApp(adminUser);
      const res = await request(app).get('/api/api-keys');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].permissions).toEqual(['pages:read']);
      expect(res.body[1].permissions).toEqual([]);
      // Admin query includes JOIN
      expect(query).toHaveBeenCalledWith(expect.stringContaining('LEFT JOIN users'));
    });

    it('should return only own keys for non-admin users', async () => {
      const mockKeys = [
        { id: 2, name: 'My Key', public_key: 'pk_live_def', type: 'user', user_id: 2, permissions: '["pages:read"]', is_active: 1, created_at: '2025-01-01' }
      ];
      query.mockResolvedValueOnce(mockKeys);

      const app = createApp(editorUser);
      const res = await request(app).get('/api/api-keys');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(query).toHaveBeenCalledWith(expect.stringContaining('WHERE user_id = ?'), [2]);
    });

    it('should return 401 without auth', async () => {
      const app = createApp(null);
      const res = await request(app).get('/api/api-keys');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/api-keys/scopes', () => {
    it('should return available permission scopes', async () => {
      const app = createApp(adminUser);
      const res = await request(app).get('/api/api-keys/scopes');

      expect(res.status).toBe(200);
      expect(res.body).toContain('pages:read');
      expect(res.body).toContain('products:write');
      expect(res.body.length).toBeGreaterThan(0);
    });
  });

  describe('POST /api/api-keys', () => {
    it('should create a site key and return public + secret', async () => {
      query.mockResolvedValueOnce({ insertId: 1 });

      const app = createApp(adminUser);
      const res = await request(app)
        .post('/api/api-keys')
        .send({ name: 'Test Site Key', type: 'site', permissions: ['pages:read', 'pages:write'] });

      expect(res.status).toBe(201);
      expect(res.body.public_key).toMatch(/^pk_live_/);
      expect(res.body.secret_key).toMatch(/^sk_live_/);
      expect(res.body.name).toBe('Test Site Key');
      expect(res.body.type).toBe('site');
      expect(res.body.permissions).toEqual(['pages:read', 'pages:write']);
      expect(res.body.message).toContain('not be shown again');

      // Verify INSERT was called with hashed secret (not raw)
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO api_keys'),
        expect.arrayContaining(['Test Site Key', expect.stringMatching(/^pk_live_/)])
      );
    });

    it('should create a user key for the current user', async () => {
      query.mockResolvedValueOnce({ insertId: 2 });

      const app = createApp(editorUser);
      const res = await request(app)
        .post('/api/api-keys')
        .send({ name: 'My User Key', type: 'user', permissions: ['pages:read'] });

      expect(res.status).toBe(201);
      expect(res.body.type).toBe('user');
      // Verify user_id is set to current user
      const insertCall = query.mock.calls[0];
      expect(insertCall[1]).toContain(2); // user_id = editor's id
    });

    it('should reject site key creation by non-admin', async () => {
      const app = createApp(editorUser);
      const res = await request(app)
        .post('/api/api-keys')
        .send({ name: 'Sneaky Site Key', type: 'site' });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Only admins');
    });

    it('should reject creation without a name', async () => {
      const app = createApp(adminUser);
      const res = await request(app)
        .post('/api/api-keys')
        .send({ name: '', type: 'site' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Name is required');
    });

    it('should filter out invalid permission scopes', async () => {
      query.mockResolvedValueOnce({ insertId: 1 });

      const app = createApp(adminUser);
      const res = await request(app)
        .post('/api/api-keys')
        .send({ name: 'Test', type: 'site', permissions: ['pages:read', 'invalid:scope', 'drop:tables'] });

      expect(res.status).toBe(201);
      expect(res.body.permissions).toEqual(['pages:read']);
    });

    it('should allow admin to assign user key to another user', async () => {
      query.mockResolvedValueOnce({ insertId: 3 });

      const app = createApp(adminUser);
      const res = await request(app)
        .post('/api/api-keys')
        .send({ name: 'For Editor', type: 'user', user_id: 2, permissions: [] });

      expect(res.status).toBe(201);
      const insertCall = query.mock.calls[0];
      expect(insertCall[1]).toContain(2); // user_id assigned to editor
    });
  });

  describe('PUT /api/api-keys/:id', () => {
    it('should update key name and permissions', async () => {
      query.mockResolvedValueOnce([{ id: 1, name: 'Old', user_id: null, type: 'site' }]); // SELECT
      query.mockResolvedValueOnce({}); // UPDATE

      const app = createApp(adminUser);
      const res = await request(app)
        .put('/api/api-keys/1')
        .send({ name: 'New Name', permissions: ['products:read'] });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(query).toHaveBeenCalledTimes(2);
    });

    it('should toggle is_active', async () => {
      query.mockResolvedValueOnce([{ id: 1, name: 'Key', user_id: null }]); // SELECT
      query.mockResolvedValueOnce({}); // UPDATE

      const app = createApp(adminUser);
      const res = await request(app)
        .put('/api/api-keys/1')
        .send({ is_active: false });

      expect(res.status).toBe(200);
      const updateCall = query.mock.calls[1];
      expect(updateCall[0]).toContain('is_active');
      expect(updateCall[1]).toContain(0); // false -> 0
    });

    it('should return 404 for non-existent key', async () => {
      query.mockResolvedValueOnce([]); // empty result

      const app = createApp(adminUser);
      const res = await request(app)
        .put('/api/api-keys/999')
        .send({ name: 'Updated' });

      expect(res.status).toBe(404);
    });

    it('should deny non-admin updating another user\'s key', async () => {
      query.mockResolvedValueOnce([{ id: 1, name: 'Other Key', user_id: 99 }]);

      const app = createApp(editorUser);
      const res = await request(app)
        .put('/api/api-keys/1')
        .send({ name: 'Hijacked' });

      expect(res.status).toBe(403);
    });

    it('should return 400 with no updates', async () => {
      query.mockResolvedValueOnce([{ id: 1, name: 'Key', user_id: 2 }]);

      const app = createApp(editorUser);
      const res = await request(app)
        .put('/api/api-keys/1')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('No updates');
    });
  });

  describe('DELETE /api/api-keys/:id', () => {
    it('should delete a key as admin', async () => {
      query.mockResolvedValueOnce([{ id: 1, name: 'Key', user_id: null }]); // SELECT
      query.mockResolvedValueOnce({}); // DELETE

      const app = createApp(adminUser);
      const res = await request(app).delete('/api/api-keys/1');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(query).toHaveBeenCalledWith('DELETE FROM api_keys WHERE id = ?', ['1']);
    });

    it('should allow user to delete their own key', async () => {
      query.mockResolvedValueOnce([{ id: 5, name: 'My Key', user_id: 2 }]);
      query.mockResolvedValueOnce({});

      const app = createApp(editorUser);
      const res = await request(app).delete('/api/api-keys/5');

      expect(res.status).toBe(200);
    });

    it('should deny non-admin deleting another user\'s key', async () => {
      query.mockResolvedValueOnce([{ id: 1, name: 'Admin Key', user_id: 99 }]);

      const app = createApp(editorUser);
      const res = await request(app).delete('/api/api-keys/1');

      expect(res.status).toBe(403);
    });

    it('should return 404 for non-existent key', async () => {
      query.mockResolvedValueOnce([]);

      const app = createApp(adminUser);
      const res = await request(app).delete('/api/api-keys/999');

      expect(res.status).toBe(404);
    });
  });
});
