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
    type: 'page', // 'page' or 'product'
    options: [], // e.g., [{ name: 'Size', values: ['S', 'M'] }]
    variants: [] // e.g., [{ title: 'S', price: 10, sku: '...' }]
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
        // Handle graph or direct objects
        const items = schema['@graph'] || [schema];
        items.forEach(item => {
          const type = item['@type'];
          if (type === 'Product') {
            result.type = 'product';
            if (item.name) result.title = item.name;
            if (item.description) result.description = item.description;
            if (item.image) {
              const imgs = Array.isArray(item.image) ? item.image : [item.image];
              result.images.push(...imgs.map(img => typeof img === 'object' ? img.url : img));
            }
            if (item.sku) result.sku = item.sku;
            
            // Extract Variants from Offers
            if (item.offers) {
              const offers = Array.isArray(item.offers) ? item.offers : [item.offers];
              if (offers[0]?.price) result.price = offers[0].price;
              
              result.variants = offers.map(offer => ({
                title: offer.name || item.name,
                price: parseFloat(offer.price) || 0,
                sku: offer.sku || item.sku || '',
                availability: offer.availability?.includes('InStock') ? 1 : 0
              }));
            }
          }
          if (type === 'Article' || type === 'BlogPosting' || type === 'WebPage') {
            if (!result.title && item.headline) result.title = item.headline;
            if (!result.title && item.name) result.title = item.name;
            if (!result.description && (item.description || item.articleBody)) {
              result.description = item.description || item.articleBody;
            }
            if (item.image && result.images.length === 0) {
              const imgs = Array.isArray(item.image) ? item.image : [item.image];
              result.images.push(...imgs.map(img => typeof img === 'object' ? img.url : img));
            }
          }
        });
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
          if (['price', 'sku', 'title', 'description', 'image', 'images'].includes(value)) {
            if ($match && $match.length > 0) {
              if (value === 'image' || value === 'images') {
                const imgUrls = $match.map((i, el) => {
                  let src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy-src') || $(el).attr('srcset');
                  if (src && src.includes(' ')) src = src.split(' ')[0]; // Handle srcset
                  return src;
                }).get().filter(Boolean);
                
                if (value === 'images') result.images.push(...imgUrls);
                else result.images.unshift(imgUrls[0]);
              } else {
                result[value] = $match.first().text().trim();
              }
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

  // 5. Final Guessing (If still empty)
  if (result.images.length === 0) {
    // Look for anything that looks like a primary product image
    const gallerySelectors = [
      '.product-single__media-wrapper img',
      '.product__media img',
      '.product-gallery img',
      '.woocommerce-product-gallery__image img',
      '.featured-image',
      '.primary-image',
      '#main-image',
      '#product-photo-container img',
      '.product-main-image img',
      '.gallery-item img'
    ];
    for (const sel of gallerySelectors) {
      const $imgs = $(sel);
      if ($imgs.length > 0) {
        $imgs.each((i, el) => {
          let src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy-src') || $(el).attr('srcset');
          if (src) {
            if (src.includes(' ')) src = src.split(' ')[0];
            result.images.push(src);
          }
        });
        if (result.images.length > 0) break;
      }
    }
  }

  // 6. Generic Image Extraction (Last Resort - only if still empty)
  if (result.images.length === 0 && result.type === 'product') {
    $('img').each((i, el) => {
      const $img = $(el);
      const width = parseInt($img.attr('width') || '0');
      const height = parseInt($img.attr('height') || '0');
      const src = $img.attr('src') || $img.attr('data-src');
      
      // Skip small icons/spacers
      if (src && !src.match(/icon|logo|avatar|spacer|pixel/i)) {
        if ((width > 200 && height > 200) || (!width && !height)) {
          result.images.push(src);
        }
      }
    });
  }

  // Final cleanup and URL normalization
  const origin = url ? new URL(url).origin : '';
  result.images = [...new Set(result.images)].filter(Boolean).map(img => {
    if (img.startsWith('//')) return 'https:' + img;
    if (img.startsWith('/') && origin) return origin + img;
    return img;
  });

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

/**
 * Intelligently detect the main content area of a page.
 * Looks for common container tags, IDs, and classes.
 */
export function automaticallyDetectContent($) {
  // 0. Pre-clean: remove obvious non-content
  $('header, footer, nav, aside, .header, .footer, .nav, .sidebar, .comments, .social-share, .related-products, #header, #footer, #nav, script, style, noscript').remove();

  // 1. Semantic Tags (Highest Priority)
  const semantic = $('main, [role="main"], article').first();
  if (semantic.length > 0 && semantic.text().trim().length > 100) return semantic.html().trim();

  // 2. Common Content IDs/Classes
  const common = [
    '#content', '#main', '#main-content', '.main-content', '.post-content', '.article-content',
    '.entry-content', '.product-description', '#description', '.product-single__description',
    '.product__description', '.page-content'
  ];
  for (const selector of common) {
    const el = $(selector).first();
    if (el.length > 0 && el.text().trim().length > 100) {
      return el.html().trim();
    }
  }

  // 3. Heuristic: Find element with highest text density
  let best = $('body');
  let maxLen = 0;
  
  $('div, section').each((i, el) => {
    const $el = $(el);
    const text = $el.text().trim();
    // Calculate a simple score based on text length and tag depth
    // We want deep nodes with lots of text, but not the body itself
    const score = text.length; 
    
    if (score > maxLen) {
      maxLen = score;
      best = $el;
    }
  });

  return best.html()?.trim() || '';
}

export async function scrapeUrl(url) {
  try {
    const { data } = await axios.get(url, { headers: { 'User-Agent': 'WebWolf-Import-Bot/1.0' } });
    return extractMetadata(cheerio.load(data));
  } catch (err) { throw new Error(`Failed to scrape: ${err.message}`); }
}
