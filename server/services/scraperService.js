import axios from 'axios';
import * as cheerio from 'cheerio';

/**
 * Extract metadata from a Cheerio object
 * Accepts optional rules for custom extraction logic.
 */
export function extractMetadata($, rules = [], url = '') {
  const result = {
    title: '',
    description: '',
    images: [],
    price: null,
    sku: '',
    canonical: '',
    type: 'page' // 'page' or 'product'
  };

  // 0. Canonical URL
  result.canonical = $('link[rel="canonical"]').attr('href') || '';

  // 1. Try JSON-LD (The Gold Standard)
  const jsonLdScripts = $('script[type="application/ld+json"]');
  jsonLdScripts.each((i, el) => {
    try {
      const json = JSON.parse($(el).html());
      const schemas = Array.isArray(json) ? json : [json];
      schemas.forEach(schema => {
        const type = schema['@type'];
        if (type === 'Product') {
          result.type = 'product';
          if (schema.name) result.title = schema.name;
          if (schema.description) result.description = schema.description;
          if (schema.image) {
            const imgs = Array.isArray(schema.image) ? schema.image : [schema.image];
            result.images.push(...imgs.map(img => typeof img === 'object' ? img.url : img));
          }
          if (schema.sku) result.sku = schema.sku;
          if (schema.offers) {
            const offer = Array.isArray(schema.offers) ? schema.offers[0] : schema.offers;
            if (offer.price) result.price = offer.price;
          }
        }
        if (type === 'Article' || type === 'BlogPosting' || type === 'WebPage') {
          if (!result.title && schema.headline) result.title = schema.headline;
          if (!result.title && schema.name) result.title = schema.name;
          if (!result.description && (schema.description || schema.articleBody)) {
            result.description = schema.description || schema.articleBody;
          }
          if (schema.image && result.images.length === 0) {
            const imgs = Array.isArray(schema.image) ? schema.image : [schema.image];
            result.images.push(...imgs.map(img => typeof img === 'object' ? img.url : img));
          }
        }
      });
    } catch (e) {}
  });

  // 2. Fallback to OpenGraph / Meta Tags
  if (!result.title) result.title = $('meta[property="og:title"]').attr('content') || $('title').text() || '';
  if (!result.description) result.description = $('meta[property="og:description"]').attr('content') || $('meta[name="description"]').attr('content') || '';
  if (result.images.length === 0) {
    const ogImage = $('meta[property="og:image"]').attr('content');
    if (ogImage) result.images.push(ogImage);
  }
  if (!result.price) {
    const shopifyPrice = $('meta[property="og:price:amount"]').attr('content');
    if (shopifyPrice) result.price = shopifyPrice;
  }

  // 3. Structural Signal Defaults (WebWolf primitives)
  if ($('product-card').length > 0) {
    result.type = 'product';
  }

  // 4. INTELLIGENT RULES ENGINE (Overrides)
  if (Array.isArray(rules)) {
    rules.forEach(rule => {
      const { selector, urlPattern, action, value } = rule;
      if (!action) return;

      // Check URL pattern match (if specified) — tests against pathname
      let urlMatched = false;
      if (urlPattern) {
        try {
          const testPath = url ? new URL(url).pathname : '';
          urlMatched = new RegExp(urlPattern).test(testPath);
        } catch { return; }
        if (!urlMatched) return; // URL pattern specified but didn't match, skip rule
      }

      // Check CSS selector match (if specified)
      let $match = null;
      if (selector) {
        $match = $(selector);
        if ($match.length === 0) return; // CSS selector specified but didn't match, skip rule
      }

      // If neither selector nor urlPattern, skip
      if (!selector && !urlPattern) return;

      switch (action) {
        case 'setType': result.type = value; break;
        case 'setField':
          if (['price', 'sku', 'title', 'description'].includes(value)) {
            if ($match && $match.length > 0) {
              result[value] = $match.first().text().trim();
            }
          }
          break;
        case 'setConst':
          const [field, constVal] = value.split(':');
          if (field && constVal && result.hasOwnProperty(field)) {
            result[field] = constVal;
          }
          break;
      }
    });
  }

  // Clean numeric fields
  const numericFields = ['price', 'compare_at_price', 'cost', 'inventory_quantity', 'weight'];
  numericFields.forEach(field => {
    if (result[field]) {
      const cleaned = String(result[field]).replace(/[^\d.]/g, '');
      result[field] = cleaned ? parseFloat(cleaned) : null;
    }
  });

  result.title = result.title.trim();
  result.images = [...new Set(result.images)].filter(Boolean);
  return result;
}

export async function scrapeUrl(url) {
  try {
    const { data } = await axios.get(url, { headers: { 'User-Agent': 'WebWolf-Import-Bot/1.0' } });
    return extractMetadata(cheerio.load(data));
  } catch (err) { throw new Error(`Failed to scrape: ${err.message}`); }
}
