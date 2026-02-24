import { query } from '../db/connection.js';
import { themeRender, renderError } from '../lib/renderer.js';
import { error as logError } from '../lib/logger.js';
import { canAccess } from '../middleware/permission.js';
import { SYSTEM_ROUTES } from '../lib/systemRoutes.js';

function parseJsonField(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    if (value.trim() === '') return null;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return null;
}

function setRenderDebugHeaders(req, res, page, content) {
  const token = process.env.DEBUG_TOKEN;
  const debugParam = req.query?.__debug;
  if (!token || typeof debugParam !== 'string' || debugParam !== token) return;

  const features = content?.features;
  const isArray = Array.isArray(features);
  const length = isArray ? features.length : 0;
  const type = features === null ? 'null' : typeof features;

  res.setHeader('X-WebWolf-Debug', '1');
  res.setHeader('X-WebWolf-Page-Id', String(page?.id ?? ''));
  res.setHeader('X-WebWolf-Page-Slug', String(page?.slug ?? ''));
  res.setHeader('X-WebWolf-Template', String(page?.template_filename ?? ''));
  res.setHeader('X-WebWolf-Features-Type', type);
  res.setHeader('X-WebWolf-Features-IsArray', isArray ? 'true' : 'false');
  res.setHeader('X-WebWolf-Features-Length', String(length));
}

export const robotsTxt = async (req, res) => {
  try {
    const settings = await query('SELECT setting_value FROM settings WHERE setting_key = ?', ['robots_txt']);
    const robotsTxt = settings[0]?.setting_value || 'User-agent: *\nAllow: /';
    res.type('text/plain').send(robotsTxt);
  } catch (err) {
    res.type('text/plain').send('User-agent: *\nAllow: /');
  }
};

export const sitemapXml = async (req, res) => {
  try {
    const settings = await query('SELECT setting_value FROM settings WHERE setting_key = ?', ['site_url']);
    const siteUrl = settings[0]?.setting_value || `${req.protocol}://${req.get('host')}`;

    // Query pages with published status via content table
    const pages = await query(`
      SELECT c.slug, p.updated_at
      FROM pages p
      JOIN content c ON p.content_id = c.id
      WHERE p.status = ?
      ORDER BY p.updated_at DESC
    `, ['published']);

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

    // 1. Add System Routes (if priority > 0)
    for (const route of SYSTEM_ROUTES) {
      if (route.priority > 0) {
        xml += '  <url>\n';
        xml += `    <loc>${siteUrl}${route.url === '/' ? '' : route.url}</loc>\n`;
        xml += '    <changefreq>' + (route.changefreq || 'weekly') + '</changefreq>\n';
        xml += `    <priority>${route.priority.toFixed(1)}</priority>\n`;
        xml += '  </url>\n';
      }
    }

    // 2. Add dynamic pages
    for (const page of pages) {
      const slug = page.slug === '/' ? '' : page.slug;
      xml += '  <url>\n';
      xml += `    <loc>${siteUrl}${slug}</loc>\n`;
      xml += `    <lastmod>${new Date(page.updated_at).toISOString().split('T')[0]}</lastmod>\n`;
      xml += '    <changefreq>weekly</changefreq>\n';
      xml += `    <priority>${page.slug === '/' ? '1.0' : '0.8'}</priority>\n`;
      xml += '  </url>\n';
    }

    xml += '</urlset>';

    res.type('application/xml').send(xml);
  } catch (err) {
    logError(req, err, 'SITEMAP');
    res.status(500).send('Error generating sitemap');
  }
};

export const search = async (req, res) => {
  const { site } = res.locals;
  const q = req.query.q || '';

  try {
    let results = [];
    if (q) {
      results = await query(
        `SELECT c.id, c.module, c.slug, c.title, c.data 
         FROM content c
         WHERE (c.title LIKE ? OR c.slug LIKE ? OR c.search_index LIKE ?)
         AND c.slug IS NOT NULL
         LIMIT 20`,
        [`%${q}%`, `%${q}%`, `%${q}%`]
      );
    }

    themeRender(req, res, 'pages/search.njk', {
      q,
      results,
      page: { title: `Search Results for "${q}"`, slug: '/search' },
      seo: {
        title: `Search: ${q} - ${site.site_name}`,
        robots: 'noindex, follow'
      }
    });
  } catch (err) {
    renderError(req, res, 500, { error: err.message });
  }
};

export const handleRedirects = async (req, res, next) => {
  try {
    const redirects = await query(
      'SELECT * FROM redirects WHERE source_path = ?',
      [req.path]
    );

    if (redirects[0]) {
      return res.redirect(redirects[0].status_code, redirects[0].target_path);
    }

    next();
  } catch (err) {
    next();
  }
};

export const renderContent = async (req, res) => {
  const { site, customer } = res.locals;

  try {
    // Normalize path
    let slug = req.path;
    if (slug !== '/' && slug.endsWith('/')) {
      slug = slug.slice(0, -1);
    }

    // If root path and home page is set, route to that page
    if (slug === '/' && site.home_page_id) {
      try {
        const homePage = await query(
          'SELECT p.id, c.slug FROM pages p LEFT JOIN content c ON p.content_id = c.id WHERE p.id = ?',
          [site.home_page_id]
        );
        if (homePage && homePage[0] && homePage[0].slug) {
          slug = homePage[0].slug;
        }
      } catch (err) {
        // If home page lookup fails, continue with root path
      }
    }

    // Check if this is a module index request (e.g., /pages, /products, /posts)
    const indexModules = ['pages', 'products', 'posts'];
    const moduleMatch = slug.match(/^\/([a-z]+)$/);
    if (moduleMatch && indexModules.includes(moduleMatch[1])) {
      const module = moduleMatch[1];
      try {
        const templatePath = `${module}/index.njk`;

        const { sort, order, min_price, max_price, q } = req.query;

        // Build base query
        let sql = `
          SELECT c.id, c.module, c.slug, c.title, COALESCE(c.data, '{}') as data,
                 c.created_at, c.updated_at
          FROM content c
          WHERE c.module = ? AND c.slug IS NOT NULL
        `;
        
        // Add specific module joins/fields
        if (module === 'products') {
          sql = `
            SELECT c.id, c.module, c.slug, c.title, COALESCE(c.data, '{}') as data,
                   p.price, p.sku, p.inventory_quantity, p.image,
                   c.created_at, c.updated_at
            FROM content c
            LEFT JOIN products p ON c.id = p.content_id
            WHERE c.module = ? AND c.slug IS NOT NULL
          `;
        }
        
        const params = [module];

        if (module === 'products') {
          if (q) {
            sql += ` AND (c.title LIKE ? OR p.sku LIKE ? OR c.search_index LIKE ?)`;
            params.push(`%${q}%`, `%${q}%`, `%${q}%`);
          }
          if (min_price) {
            sql += ` AND p.price >= ?`;
            params.push(parseFloat(min_price));
          }
          if (max_price) {
            sql += ` AND p.price <= ?`;
            params.push(parseFloat(max_price));
          }
          
          // Sorting
          const validSortFields = ['price', 'title', 'created_at'];
          const sortField = validSortFields.includes(sort) ? sort : 'title';
          const sortOrder = order === 'desc' ? 'DESC' : 'ASC';
          
          if (sortField === 'title') {
            sql += ` ORDER BY c.title ${sortOrder}`;
          } else {
            sql += ` ORDER BY p.${sortField} ${sortOrder}`;
          }
        } else {
          sql += ` ORDER BY c.created_at DESC`;
        }

        const moduleContent = await query(sql, params);

        const context = {
          module,
          content: moduleContent,
          filters: { sort, order, min_price, max_price, q },
          seo: {
            title: `${module.charAt(0).toUpperCase() + module.slice(1)} - ${site.site_name}`,
            description: site.default_meta_description,
            robots: 'index, follow'
          }
        };

        return themeRender(req, res, templatePath, context);
      } catch (err) {
        // Fall through if template doesn't exist
      }
    }

    // Look up content by slug
    let contentRows = await query(
      'SELECT id, module, title, data FROM content WHERE slug = ?',
      [slug]
    );

    // Fallback resolution
    if (!contentRows[0] && slug !== '/') {
      const prefixes = ['/products', '/pages', '/posts'];
      
      // Case A: Prepend prefix (e.g. /my-product -> /products/my-product)
      for (const p of prefixes) {
        if (!slug.startsWith(p)) {
          const fallbackSlug = p + (slug.startsWith('/') ? slug : '/' + slug);
          const rows = await query('SELECT id, module, title, data FROM content WHERE slug = ?', [fallbackSlug]);
          if (rows && rows.length > 0 && rows[0]) {
            contentRows = rows;
            slug = fallbackSlug;
            break;
          }
        }
      }

      // Case B: Strip prefix (e.g. /products/my-product -> /my-product)
      if (!contentRows[0]) {
        for (const p of prefixes) {
          if (slug.startsWith(p + '/')) {
            const strippedSlug = slug.slice(p.length);
            const rows = await query('SELECT id, module, title, data FROM content WHERE slug = ? AND module = ?', [strippedSlug, p.slice(1)]);
            if (rows && rows.length > 0 && rows[0]) {
              contentRows = rows;
              slug = strippedSlug;
              break;
            }
          }
        }
      }
    }

    if (!contentRows[0]) {
      return renderError(req, res, 404, { title: 'Page Not Found' });
    }

    const contentRow = contentRows[0];
    const contentType = contentRow.module;

    // Query the appropriate module table based on content type
    let pageData;
    if (contentType === 'pages') {
      const pages = await query(`
        SELECT p.*, t.filename as template_filename, t.options as template_options, t.id as template_id
        FROM pages p
        LEFT JOIN templates t ON p.template_id = t.id
        WHERE p.content_id = ? AND p.status = 'published'
      `, [contentRow.id]);
      pageData = pages[0];
    } else if (contentType === 'products') {
      const products = await query(`
        SELECT pr.*, pr.access_rules, t.filename as template_filename, t.options as template_options, t.id as template_id,
               c.title as content_title
        FROM products pr
        LEFT JOIN templates t ON pr.template_id = t.id
        LEFT JOIN content c ON pr.content_id = c.id
        WHERE pr.content_id = ? AND pr.status IN ('active', 'draft')
      `, [contentRow.id]);
      pageData = products[0];
      // Map content title to page.title for template consistency
      if (pageData && pageData.content_title) {
        pageData.title = pageData.content_title;
        delete pageData.content_title;
      }
      // Fetch product variants
      if (pageData) {
        const variants = await query(
          'SELECT * FROM product_variants WHERE product_id = ? ORDER BY position ASC',
          [pageData.id]
        );
        pageData.variants = variants;

        const images = await query(
          'SELECT * FROM product_images WHERE product_id = ? ORDER BY position ASC',
          [pageData.id]
        );
        pageData.images = images;
      }
    } else if (contentType === 'posts') {
      const posts = await query(`
        SELECT p.*, t.filename as template_filename, t.options as template_options, t.id as template_id,
               u.name as created_by_name
        FROM pages p
        LEFT JOIN templates t ON p.template_id = t.id
        LEFT JOIN users u ON p.created_by = u.id
        WHERE p.content_id = ? AND p.status = 'published' AND p.content_type = 'posts'
      `, [contentRow.id]);
      pageData = posts[0];
    } else if (contentType === 'classifieds') {
      const ads = await query(`
        SELECT ca.*, t.filename as template_filename, t.options as template_options, t.id as template_id,
               c.title as content_title, cat.name as category_name, cat.slug as category_slug,
               cust.first_name as owner_first_name, cust.last_name as owner_last_name
        FROM classified_ads ca
        LEFT JOIN templates t ON ca.template_id = t.id
        LEFT JOIN content c ON ca.content_id = c.id
        LEFT JOIN classified_categories cat ON ca.category_id = cat.id
        LEFT JOIN customers cust ON ca.customer_id = cust.id
        WHERE ca.content_id = ? AND ca.status = 'approved'
      `, [contentRow.id]);
      pageData = ads[0];
      if (pageData && pageData.content_title) {
        pageData.title = pageData.content_title;
      }
    } else if (contentType === 'blocks') {
      const blocks = await query(`
        SELECT b.*, b.access_rules, t.filename as template_filename, t.options as template_options, t.id as template_id
        FROM blocks b
        LEFT JOIN templates t ON b.template_id = t.id
        WHERE b.content_id = ?
      `, [contentRow.id]);
      pageData = blocks[0];
    } else {
      // Unknown content type, try to render as page
      const pages = await query(`
        SELECT p.*, t.filename as template_filename, t.options as template_options, t.id as template_id
        FROM pages p
        LEFT JOIN templates t ON p.template_id = t.id
        WHERE p.content_id = ? AND p.status = 'published'
      `, [contentRow.id]);
      pageData = pages[0];
    }

    if (!pageData) {
      return renderError(req, res, 404, { title: 'Page Not Found' });
    }

    if (!pageData.template_filename) {
      console.error('No template assigned to content:', { contentType, contentId: contentRow.id });
      return renderError(req, res, 500);
    }

    // Parse content JSON
    const content = parseJsonField(contentRow.data) || {};

    // Parse schema markup (may not exist on all content types)
    const schemaMarkup = parseJsonField(pageData.schema_markup || null);

    // Build SEO data (with fallbacks for fields that may not exist on all content types)
    const seo = {
      title: pageData.meta_title || contentRow.title,
      description: pageData.meta_description || '',
      canonical: pageData.canonical_url || `${site.site_url}${slug}`,
      robots: pageData.robots || 'index, follow',
      og: {
        title: pageData.og_title || pageData.meta_title || contentRow.title,
        description: pageData.og_description || pageData.meta_description || '',
        image: pageData.image || (pageData.images && pageData.images[0]?.url) || pageData.og_image || '',
        url: `${site.site_url}${slug}`,
        type: 'website'
      },
      schema: schemaMarkup
    };

    setRenderDebugHeaders(req, res, pageData, content);

    // Centralized Permission Check
    const accessRules = parseJsonField(pageData.access_rules);
    
    const hasAccess = canAccess(accessRules, {
      isLoggedIn: !!customer,
      hasActiveSubscription: !!customer?.subscription,
      customer
    });

    // Render template
    const templateContext = {
      page: pageData,
      content,
      user: req.user || null, // Explicitly pass user from req
      customer: customer || null,
      template: {
        id: pageData.template_id,
        options: pageData.template_options // Pass raw options, themeRender will resolve them
      },
      content_type: contentType,
      seo,
      subscription_required: !hasAccess
    };

    // For products, also pass as 'product' variable for template convenience
    if (contentType === 'products') {
      templateContext.product = pageData;
    }
    
    if (contentType === 'classifieds') {
      templateContext.ad = pageData;
    }

    themeRender(req, res, pageData.template_filename, templateContext);
  } catch (err) {
    logError(req, err, 'RENDER_CONTENT');
    renderError(req, res, 500);
  }
};
