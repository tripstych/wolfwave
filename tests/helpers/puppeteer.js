import puppeteer from 'puppeteer';

/**
 * Shared puppeteer setup helper.
 */
export async function launchBrowser() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  
  // Set a reasonable viewport
  await page.setViewport({ width: 1280, height: 800 });
  
  return { browser, page };
}

/**
 * Helper to log in a user/customer.
 */
export async function loginCustomer(page, baseUrl, email, password) {
  await page.goto(`${baseUrl}/customer/login`);
  await page.type('input[name="email"]', email);
  await page.type('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForNavigation();
}
