import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { launchBrowser, loginCustomer } from './helpers/puppeteer.js';
import prisma from '../server/lib/prisma.js';
import bcrypt from 'bcryptjs';

describe('Classified Ads E2E', () => {
  let browser;
  let page;
  const baseUrl = 'http://localhost:3000';
  const testEmail = 'test-subscriber@example.com';
  const testPassword = 'password123';

  beforeAll(async () => {
    // 1. Create a test customer
    const hashedPassword = await bcrypt.hash(testPassword, 10);
    const customer = await prisma.customers.upsert({
      where: { email: testEmail },
      update: { password: hashedPassword },
      create: {
        email: testEmail,
        password: hashedPassword,
        first_name: 'Test',
        last_name: 'Subscriber'
      }
    });

    // 2. Create a test category
    await prisma.classified_categories.upsert({
      where: { slug: 'test-category' },
      update: {},
      create: {
        name: 'Test Category',
        slug: 'test-category'
      }
    });

    // 3. Create a classifieds template
    await prisma.templates.upsert({
      where: { filename: 'classifieds/default.njk' },
      update: { content_type: 'classifieds' },
      create: {
        name: 'Default Classified',
        filename: 'classifieds/default.njk',
        content_type: 'classifieds',
        regions: JSON.stringify([
          { name: 'description', type: 'textarea', label: 'Description' },
          { name: 'extra_info', type: 'text', label: 'Extra Info' }
        ])
      }
    });

    // 4. Launch browser
    const setup = await launchBrowser();
    browser = setup.browser;
    page = setup.page;
  });

  afterAll(async () => {
    if (browser) await browser.close();
    // Cleanup test data
    await prisma.classified_ads.deleteMany({
      where: { customer: { email: testEmail } }
    });
  });

  it('should allow a subscriber to post a classified ad', async () => {
    // 1. Login
    await loginCustomer(page, baseUrl, testEmail, testPassword);
    expect(page.url()).toContain('/customer/account');

    // 2. Go to creation page
    await page.goto(`${baseUrl}/customer/ads/create`);
    
    // 3. Fill out the form
    await page.type('#title', 'E2E Test Ad');
    await page.type('#price', '99.99');
    await page.type('#location', 'Test City');
    await page.type('#contact_info', '555-TEST');
    await page.type('#description', 'This is a description from an automated test.');
    
    // Select category (find by text)
    const categoryId = (await prisma.classified_categories.findFirst({ where: { slug: 'test-category' } })).id;
    await page.select('#category_id', String(categoryId));

    // Submit
    await page.click('#submit-btn');
    
    // 4. Should redirect back to list
    await page.waitForNavigation();
    expect(page.url()).toContain('/customer/ads');

    // 5. Verify ad exists in list
    const bodyText = await page.evaluate(() => document.body.innerText);
    expect(bodyText).toContain('E2E Test Ad');
    expect(bodyText).toContain('pending review');
  }, 20000);

  it('should display the ad on the public listing after approval', async () => {
    // 1. Manually approve the ad in DB
    await prisma.classified_ads.updateMany({
      where: { title: 'E2E Test Ad' },
      data: { status: 'approved' }
    });

    // 2. Go to public index
    await page.goto(`${baseUrl}/classifieds`);
    
    // 3. Verify it appears
    const bodyText = await page.evaluate(() => document.body.innerText);
    expect(bodyText).toContain('E2E Test Ad');
    expect(bodyText).toContain('$99.99');
  });
});
