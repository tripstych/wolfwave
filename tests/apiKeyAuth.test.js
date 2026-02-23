import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import bcrypt from 'bcryptjs';

// Mock the database
vi.mock('../server/db/connection.js', () => ({
  query: vi.fn()
}));

// Mock tenant context
vi.mock('../server/lib/tenantContext.js', () => ({
  getCurrentDbName: vi.fn(() => 'webwolf_test')
}));

import { query } from '../server/db/connection.js';
import { apiKeyAuth, requireScope } from '../server/middleware/apiKeyAuth.js';

function createApp(middlewares = []) {
  const app = express();
  app.use(express.json());
  app.use(apiKeyAuth);
  middlewares.forEach(mw => app.use(mw));
  app.get('/test', (req, res) => {
    res.json({
      user: req.user || null,
      apiKey: req.apiKey || null
    });
  });
  return app;
}

describe('API Key Auth Middleware', () => {
  const secretKey = 'sk_live_testsecret123';
  let secretHash;

  beforeEach(async () => {
    vi.clearAllMocks();
    secretHash = await bcrypt.hash(secretKey, 10);
  });

  it('should pass through if no X-API-Key header', async () => {
    const app = createApp();
    const res = await request(app).get('/test');

    expect(res.status).toBe(200);
    expect(res.body.user).toBeNull();
    expect(res.body.apiKey).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });

  it('should reject malformed API key (missing colon separator)', async () => {
    const app = createApp();
    const res = await request(app)
      .get('/test')
      .set('X-API-Key', 'pk_live_abc_no_colon');

    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Invalid API key format');
  });

  it('should reject unknown public key', async () => {
    query.mockResolvedValueOnce([]); // No rows found

    const app = createApp();
    const res = await request(app)
      .get('/test')
      .set('X-API-Key', 'pk_live_unknown:sk_live_wrong');

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid API key');
  });

  it('should reject inactive key', async () => {
    query.mockResolvedValueOnce([{
      id: 1, public_key: 'pk_live_abc', secret_key_hash: secretHash,
      type: 'site', user_id: null, permissions: '[]',
      is_active: false, expires_at: null
    }]);

    const app = createApp();
    const res = await request(app)
      .get('/test')
      .set('X-API-Key', `pk_live_abc:${secretKey}`);

    expect(res.status).toBe(401);
  });

  it('should reject expired key', async () => {
    query.mockResolvedValueOnce([{
      id: 1, public_key: 'pk_live_abc', secret_key_hash: secretHash,
      type: 'site', user_id: null, permissions: '[]',
      is_active: true, expires_at: '2020-01-01T00:00:00Z'
    }]);

    const app = createApp();
    const res = await request(app)
      .get('/test')
      .set('X-API-Key', `pk_live_abc:${secretKey}`);

    expect(res.status).toBe(401);
  });

  it('should reject wrong secret key', async () => {
    query.mockResolvedValueOnce([{
      id: 1, public_key: 'pk_live_abc', secret_key_hash: secretHash,
      type: 'site', user_id: null, permissions: '[]',
      is_active: true, expires_at: null
    }]);

    const app = createApp();
    const res = await request(app)
      .get('/test')
      .set('X-API-Key', 'pk_live_abc:sk_live_wrong_secret');

    expect(res.status).toBe(401);
  });

  it('should authenticate valid site key and set admin role', async () => {
    query.mockResolvedValueOnce([{
      id: 1, name: 'Site Key', public_key: 'pk_live_abc', secret_key_hash: secretHash,
      type: 'site', user_id: null, permissions: '["pages:read"]',
      is_active: true, expires_at: null
    }]);
    query.mockResolvedValueOnce({}); // last_used_at update

    const app = createApp();
    const res = await request(app)
      .get('/test')
      .set('X-API-Key', `pk_live_abc:${secretKey}`);

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('admin');
    expect(res.body.user.apiKey).toBe(true);
    expect(res.body.apiKey.type).toBe('site');
    expect(res.body.apiKey.permissions).toEqual(['pages:read']);
  });

  it('should authenticate valid user key and set user id', async () => {
    query.mockResolvedValueOnce([{
      id: 2, name: 'User Key', public_key: 'pk_live_def', secret_key_hash: secretHash,
      type: 'user', user_id: 5, permissions: '["products:read"]',
      is_active: true, expires_at: null
    }]);
    query.mockResolvedValueOnce({}); // last_used_at update

    const app = createApp();
    const res = await request(app)
      .get('/test')
      .set('X-API-Key', `pk_live_def:${secretKey}`);

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(5);
    expect(res.body.user.role).toBe('api');
    expect(res.body.apiKey.type).toBe('user');
  });

  it('should accept key with future expiry', async () => {
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    query.mockResolvedValueOnce([{
      id: 1, name: 'Key', public_key: 'pk_live_abc', secret_key_hash: secretHash,
      type: 'site', user_id: null, permissions: '[]',
      is_active: true, expires_at: futureDate
    }]);
    query.mockResolvedValueOnce({});

    const app = createApp();
    const res = await request(app)
      .get('/test')
      .set('X-API-Key', `pk_live_abc:${secretKey}`);

    expect(res.status).toBe(200);
    expect(res.body.apiKey).not.toBeNull();
  });
});

describe('requireScope Middleware', () => {
  it('should pass through if no API key auth (JWT flow)', async () => {
    const app = express();
    app.use(requireScope('pages:read'));
    app.get('/test', (req, res) => res.json({ ok: true }));

    const res = await request(app).get('/test');
    expect(res.status).toBe(200);
  });

  it('should allow site key with no permissions (full access)', async () => {
    const app = express();
    app.use((req, res, next) => {
      req.apiKey = { type: 'site', permissions: [] };
      next();
    });
    app.use(requireScope('pages:read'));
    app.get('/test', (req, res) => res.json({ ok: true }));

    const res = await request(app).get('/test');
    expect(res.status).toBe(200);
  });

  it('should allow key with matching scope', async () => {
    const app = express();
    app.use((req, res, next) => {
      req.apiKey = { type: 'user', permissions: ['pages:read', 'pages:write'] };
      next();
    });
    app.use(requireScope('pages:read'));
    app.get('/test', (req, res) => res.json({ ok: true }));

    const res = await request(app).get('/test');
    expect(res.status).toBe(200);
  });

  it('should deny key missing required scope', async () => {
    const app = express();
    app.use((req, res, next) => {
      req.apiKey = { type: 'user', permissions: ['pages:read'] };
      next();
    });
    app.use(requireScope('products:write'));
    app.get('/test', (req, res) => res.json({ ok: true }));

    const res = await request(app).get('/test');
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Missing required scope: products:write');
  });

  it('should deny site key with explicit permissions missing scope', async () => {
    const app = express();
    app.use((req, res, next) => {
      req.apiKey = { type: 'site', permissions: ['pages:read'] };
      next();
    });
    app.use(requireScope('orders:read'));
    app.get('/test', (req, res) => res.json({ ok: true }));

    const res = await request(app).get('/test');
    expect(res.status).toBe(403);
  });
});
