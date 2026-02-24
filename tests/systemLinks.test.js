import { describe, it, expect, beforeAll } from 'vitest';
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

    // 2. Create a template to avoid 500s on render
    await query(
      "INSERT INTO templates (id, name, filename, content_type) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE filename=VALUES(filename), name=VALUES(name), content_type=VALUES(content_type)",
      [1, 'Default Page', 'pages/index.njk', 'pages']
    );

    // 3. Create a homepage
    const contentRes = await query(
      "INSERT INTO content (module, slug, title, data) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id), title=VALUES(title), data=VALUES(data)",
      ['pages', '/', 'Home', '{}']
    );
    const contentId = contentRes.insertId;

    await query(
      "INSERT INTO pages (title, status, content_id, template_id) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE template_id=VALUES(template_id), status=VALUES(status)",
      ['Home', 'published', contentId, 1]
    );

    // 4. Create classified categories for the ads page
    await query(
      "INSERT INTO classified_categories (name, slug) VALUES (?, ?) ON DUPLICATE KEY UPDATE id=id",
      ['Electronics', 'electronics']
    );

    // 5. Ensure site settings exist
    await query(
      "INSERT INTO settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)",
      ['site_url', 'http://localhost:3000']
    );

    // 6. Generate customer token
    customerToken = jwt.sign(
      { id: customerId, email: 'smoke-test@example.com', type: 'customer' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
  });

  const checkBrokenHtml = (text) => {
    // 1. Check for unprocessed Nunjucks/CMS tags
    const indicators = [
      '[[', // Unprocessed shortcodes
      '{{', // Unprocessed Nunjucks vars
      '{%', // Unprocessed Nunjucks tags
    ];
    
    for (const indicator of indicators) {
      if (text.includes(indicator)) {
        return `Found unprocessed tag: "${indicator}"`;
      }
    }

    // 2. Check for common server-side error leaks
    const errorIndicators = [
      'Internal Server Error',
      'TypeError:',
      'nunjucks.render',
      'ReferenceError:'
    ];

    for (const indicator of errorIndicators) {
      if (text.includes(indicator)) {
        return `Found error indicator: "${indicator}"`;
      }
    }

    // 3. Check for JS syntax errors in the HTML (e.g. "const x =  || {}")
    if (/= \s*\|\|/.test(text) || /= \s*;/.test(text)) {
      return 'Found probable JS syntax error in HTML (empty assignment)';
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
          throw new Error(`Broken HTML detected at ${route.url}: ${brokenIndicator}`);
        }
      }
    });
  });

  // 2. Test Specific Problematic Routes mentioned by user
  const extraRoutes = [
    { title: 'Create Ad', url: '/customer/ads/create' },
    { title: 'Classifieds List', url: '/classifieds' },
    { title: 'Robots.txt', url: '/robots.txt' },
    { title: 'Sitemap.xml', url: '/sitemap.xml' },
    { title: 'Forgot Password', url: '/customer/forgot-password' },
    { title: '404 Page', url: '/this-page-does-not-exist' }
  ];

  extraRoutes.forEach(route => {
    it(`should render ${route.title} (${route.url}) without errors (Extra Route)`, async () => {
      const req = request(app).get(route.url).set('X-Tenant-ID', 'test');
      
      if (route.url.startsWith('/customer')) {
        req.set('Cookie', [`customer_token=${customerToken}`]);
      }

      const res = await req;
      
      if (route.title === '404 Page') {
        expect(res.status).toBe(404);
      } else {
        expect(res.status).toBe(200);
      }
      
      const brokenIndicator = checkBrokenHtml(res.text);
      if (brokenIndicator) {
        throw new Error(`Broken HTML detected at ${route.url}: ${brokenIndicator}`);
      }
    });
  });
});
