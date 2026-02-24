import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../server/index.js';
import { SYSTEM_ROUTES } from '../server/lib/systemRoutes.js';
import { query } from '../server/db/connection.js';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

describe('System Links Smoke Test', () => {
  let customerToken;
  let customerId;

  beforeAll(async () => {
    // 1. Create a test customer
    const res = await query(
      "INSERT INTO customers (email, password, first_name, last_name) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)",
      ['smoke-test@example.com', 'hashed_password', 'Smoke', 'Tester']
    );
    customerId = res.insertId || 1;

    // 2. Create a homepage
    await query(
      "INSERT INTO pages (title, slug, status, content, content_type) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE id=id",
      ['Home', 'index', 'published', '{}', 'pages']
    );

    // 3. Generate customer token
    customerToken = jwt.sign(
      { id: customerId, email: 'smoke-test@example.com', type: 'customer' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
  });

  const checkBrokenHtml = (text) => {
    // Common indicators of broken Nunjucks/CMS rendering
    const indicators = [
      '[[', // Unprocessed shortcodes
      '{{', // Unprocessed Nunjucks vars
      '{%', // Unprocessed Nunjucks tags
      'Undefined', // Possible JS leak
      'Internal Server Error',
      'TypeError',
      'nunjucks.render' // Stack trace indicator
    ];
    
    for (const indicator of indicators) {
      if (text.includes(indicator)) {
        return indicator;
      }
    }
    return null;
  };

  // 1. Test All System Routes from central registry
  SYSTEM_ROUTES.forEach(route => {
    if (route.url === '/customer/logout') return; // Skip logout

    it(`should render ${route.title} (${route.url}) without errors`, async () => {
      const req = request(app).get(route.url).set('X-Tenant-ID', 'test');
      
      // Add customer token for customer-only routes
      if (route.url.startsWith('/customer') || route.url.startsWith('/account')) {
        req.set('Cookie', [`customer_token=${customerToken}`]);
      }

      const res = await req;
      
      // Should be 200 or 302 (redirect to login)
      expect([200, 302]).toContain(res.status);
      
      if (res.status === 200) {
        const brokenIndicator = checkBrokenHtml(res.text);
        if (brokenIndicator) {
          throw new Error(`Broken HTML detected at ${route.url}: Found "${brokenIndicator}"`);
        }
      }
    });
  });

  // 2. Test Specific Problematic Routes mentioned by user
  const extraRoutes = [
    { title: 'Create Ad', url: '/customer/ads/create' },
    { title: 'Classifieds List', url: '/classifieds' }
  ];

  extraRoutes.forEach(route => {
    it(`should render ${route.title} (${route.url}) without errors (Extra Route)`, async () => {
      const req = request(app).get(route.url).set('X-Tenant-ID', 'test');
      
      if (route.url.startsWith('/customer')) {
        req.set('Cookie', [`customer_token=${customerToken}`]);
      }

      const res = await req;
      expect(res.status).toBe(200);
      
      const brokenIndicator = checkBrokenHtml(res.text);
      if (brokenIndicator) {
        throw new Error(`Broken HTML detected at ${route.url}: Found "${brokenIndicator}"`);
      }
    });
  });
});
