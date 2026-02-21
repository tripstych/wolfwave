import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { query, getPool } from './connection.js';

async function seed() {
  try {
    // Create admin user
    const email = process.env.ADMIN_EMAIL || 'admin@example.com';
    const password = process.env.ADMIN_PASSWORD || 'admin123';
    const hashedPassword = await bcrypt.hash(password, 10);

    await query(
      `INSERT INTO users (email, password, name, role) 
       VALUES (?, ?, ?, ?) 
       ON DUPLICATE KEY UPDATE password = VALUES(password)`,
      [email, hashedPassword, 'Admin', 'admin']
    );
    console.log(`✅ Admin user created: ${email}`);

    // Create default homepage template
    const homepageRegions = JSON.stringify([
      { name: 'hero_title', type: 'text', label: 'Hero Title' },
      { name: 'hero_subtitle', type: 'text', label: 'Hero Subtitle' },
      { name: 'hero_cta_text', type: 'text', label: 'CTA Button Text' },
      { name: 'hero_cta_link', type: 'text', label: 'CTA Button Link' },
      { name: 'intro_content', type: 'richtext', label: 'Introduction Content' },
      { name: 'features', type: 'repeater', label: 'Features', fields: [
        { name: 'title', type: 'text', label: 'Feature Title' },
        { name: 'description', type: 'textarea', label: 'Feature Description' },
        { name: 'icon', type: 'text', label: 'Icon Class' }
      ]}
    ]);

    await query(
      `INSERT INTO templates (name, filename, description, regions) 
       VALUES (?, ?, ?, ?) 
       ON DUPLICATE KEY UPDATE regions = VALUES(regions)`,
      ['Homepage', 'pages/homepage.njk', 'Main landing page template', homepageRegions]
    );

    // Create default page template
    const pageRegions = JSON.stringify([
      { name: 'page_title', type: 'text', label: 'Page Title' },
      { name: 'page_content', type: 'richtext', label: 'Page Content' },
      { name: 'sidebar_content', type: 'richtext', label: 'Sidebar Content' }
    ]);

    await query(
      `INSERT INTO templates (name, filename, description, regions) 
       VALUES (?, ?, ?, ?) 
       ON DUPLICATE KEY UPDATE regions = VALUES(regions)`,
      ['Standard Page', 'pages/standard.njk', 'Standard content page with sidebar', pageRegions]
    );

    // Create blog post template
    const blogRegions = JSON.stringify([
      { name: 'post_title', type: 'text', label: 'Post Title' },
      { name: 'featured_image', type: 'image', label: 'Featured Image' },
      { name: 'excerpt', type: 'textarea', label: 'Excerpt' },
      { name: 'post_content', type: 'richtext', label: 'Post Content' },
      { name: 'author', type: 'text', label: 'Author Name' },
      { name: 'tags', type: 'text', label: 'Tags (comma separated)' }
    ]);

    await query(
      `INSERT INTO templates (name, filename, description, regions) 
       VALUES (?, ?, ?, ?) 
       ON DUPLICATE KEY UPDATE regions = VALUES(regions)`,
      ['Blog Post', 'pages/blog-post.njk', 'Blog article template', blogRegions]
    );

    // Create product template
    const productRegions = JSON.stringify([
      { name: 'description', type: 'richtext', label: 'Product Description' },
      { name: 'features', type: 'repeater', label: 'Product Features', fields: [
        { name: 'title', type: 'text', label: 'Feature' },
        { name: 'description', type: 'textarea', label: 'Detail' }
      ]}
    ]);

    await query(
      `INSERT INTO templates (name, filename, description, regions)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE regions = VALUES(regions)`,
      ['Product Page', 'products/product-single.njk', 'Single product detail page', productRegions]
    );

    // Insert default settings
    const defaultSettings = [
      ['site_name', 'WebWolf CMS'],
      ['site_tagline', 'SEO-Centric Content Management'],
      ['site_url', 'http://localhost:3000'],
      ['default_meta_title', 'WebWolf CMS'],
      ['default_meta_description', 'A powerful SEO-centric content management system'],
      ['google_analytics_id', ''],
      ['robots_txt', 'User-agent: *\nAllow: /'],
      ['home_page_id', ''],
      ['active_theme', 'default']
    ];

    for (const [key, value] of defaultSettings) {
      await query(
        `INSERT INTO settings (setting_key, setting_value) 
         VALUES (?, ?) 
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
        [key, value]
      );
    }
    console.log('✅ Default settings created');

    // Seed default content types
    await query(
      `INSERT INTO content_types (name, label, plural_label, icon, menu_order, has_status, has_seo, is_system)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE label = VALUES(label), plural_label = VALUES(plural_label)`,
      ['pages', 'Page', 'Pages', 'FileText', 1, true, true, true]
    );

    await query(
      `INSERT INTO content_types (name, label, plural_label, icon, menu_order, has_status, has_seo, is_system)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE label = VALUES(label), plural_label = VALUES(plural_label)`,
      ['blocks', 'Block', 'Blocks', 'Boxes', 2, false, false, true]
    );

    await query(
      `INSERT INTO content_types (name, label, plural_label, icon, menu_order, has_status, has_seo, is_system)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE label = VALUES(label), plural_label = VALUES(plural_label)`,
      ['products', 'Product', 'Products', 'ShoppingCart', 3, true, true, false]
    );

    await query(
      `INSERT INTO content_types (name, label, plural_label, icon, menu_order, has_status, has_seo, is_system)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE label = VALUES(label), plural_label = VALUES(plural_label)`,
      ['widgets', 'Widget', 'Widgets', 'Puzzle', 4, false, false, true]
    );
    console.log('✅ Default content types created');

    // Create widget templates
    const mapRegions = JSON.stringify([
      { name: 'map_address', type: 'text', label: 'Map Address' },
      { name: 'map_zoom', type: 'text', label: 'Zoom Level (1-20)' }
    ]);
    await query(
      `INSERT INTO templates (name, filename, description, regions, content_type) 
       VALUES (?, ?, ?, ?, ?) 
       ON DUPLICATE KEY UPDATE regions = VALUES(regions)`,
      ['Google Maps', 'widgets/google-maps.njk', 'Embed a Google Map', mapRegions, 'widgets']
    );

    const searchWidgetRegions = JSON.stringify([
      { name: 'widget_title', type: 'text', label: 'Widget Title' },
      { name: 'placeholder', type: 'text', label: 'Input Placeholder' }
    ]);
    await query(
      `INSERT INTO templates (name, filename, description, regions, content_type) 
       VALUES (?, ?, ?, ?, ?) 
       ON DUPLICATE KEY UPDATE regions = VALUES(regions)`,
      ['Search Form', 'widgets/search-form.njk', 'A site-wide search input', searchWidgetRegions, 'widgets']
    );

    // Create an actual Global Search widget
    const searchTemplate = await query('SELECT id FROM templates WHERE filename = ?', ['widgets/search-form.njk']);
    if (searchTemplate && searchTemplate.length > 0 && searchTemplate[0]) {
      const existingWidget = await query('SELECT id FROM blocks WHERE slug = ?', ['global-search']);
      if (existingWidget && existingWidget.length > 0 && existingWidget[0]) {
        console.log('ℹ️ Global Search widget already exists');
      } else {
        const widgetContent = { widget_title: 'Search Our Site', placeholder: 'Find pages and products...' };
        const contentResult = await query(
          `INSERT INTO content (module, title, data) VALUES (?, ?, ?)`,
          ['widgets', 'Global Search', JSON.stringify(widgetContent)]
        );
        await query(
          `INSERT INTO blocks (template_id, content_id, name, slug, content_type) 
           VALUES (?, ?, ?, ?, ?)`,
          [searchTemplate[0].id, contentResult.insertId, 'Global Search', 'global-search', 'widgets']
        );
        console.log('✅ Global Search widget seeded');
      }
    }

    // Seed default email templates
    const emailTemplates = [
      {
        slug: 'order-confirmation',
        name: 'Order Confirmation',
        subject: 'Order {{order_number}} — Thank you for your purchase!',
        html_body: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif"><div style="max-width:600px;margin:0 auto;padding:40px 20px"><div style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)"><div style="background:#18181b;padding:24px 32px"><h1 style="margin:0;color:#fff;font-size:20px">{{site_name}}</h1></div><div style="padding:32px"><h2 style="margin:0 0 8px;color:#18181b;font-size:22px">Order Confirmed</h2><p style="margin:0 0 24px;color:#71717a;font-size:15px">Thanks for your order, {{customer_name}}!</p><div style="background:#f4f4f5;border-radius:6px;padding:16px;margin-bottom:24px"><p style="margin:0 0 4px;font-size:13px;color:#71717a">Order Number</p><p style="margin:0;font-size:16px;font-weight:600;color:#18181b">{{order_number}}</p></div><table style="width:100%;border-collapse:collapse;margin-bottom:24px"><thead><tr style="border-bottom:1px solid #e4e4e7"><th style="text-align:left;padding:8px 0;font-size:13px;color:#71717a">Item</th><th style="text-align:center;padding:8px 0;font-size:13px;color:#71717a">Qty</th><th style="text-align:right;padding:8px 0;font-size:13px;color:#71717a">Price</th></tr></thead><tbody>{{order_items}}</tbody></table><div style="border-top:2px solid #18181b;padding-top:12px;text-align:right"><span style="font-size:16px;font-weight:700;color:#18181b">Total: \${{total}}</span></div></div><div style="padding:20px 32px;background:#f4f4f5;text-align:center"><p style="margin:0;font-size:13px;color:#a1a1aa">{{site_name}}</p></div></div></div></body></html>`
      },
      {
        slug: 'shipping-update',
        name: 'Shipping Update',
        subject: 'Your order {{order_number}} has shipped!',
        html_body: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif"><div style="max-width:600px;margin:0 auto;padding:40px 20px"><div style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)"><div style="background:#18181b;padding:24px 32px"><h1 style="margin:0;color:#fff;font-size:20px">{{site_name}}</h1></div><div style="padding:32px"><h2 style="margin:0 0 8px;color:#18181b;font-size:22px">Your Order Has Shipped!</h2><p style="margin:0 0 24px;color:#71717a;font-size:15px">Great news, {{customer_name}}! Your order is on its way.</p><div style="background:#f4f4f5;border-radius:6px;padding:16px;margin-bottom:16px"><p style="margin:0 0 4px;font-size:13px;color:#71717a">Order Number</p><p style="margin:0;font-size:16px;font-weight:600;color:#18181b">{{order_number}}</p></div><div style="background:#f4f4f5;border-radius:6px;padding:16px;margin-bottom:16px"><p style="margin:0 0 4px;font-size:13px;color:#71717a">Tracking Number</p><p style="margin:0;font-size:16px;font-weight:600;color:#18181b">{{tracking_number}}</p></div><div style="background:#f4f4f5;border-radius:6px;padding:16px;margin-bottom:24px"><p style="margin:0 0 4px;font-size:13px;color:#71717a">Shipping Method</p><p style="margin:0;font-size:16px;font-weight:600;color:#18181b">{{shipping_method}}</p></div></div><div style="padding:20px 32px;background:#f4f4f5;text-align:center"><p style="margin:0;font-size:13px;color:#a1a1aa">{{site_name}}</p></div></div></div></body></html>`
      },
      {
        slug: 'payment-receipt',
        name: 'Payment Receipt',
        subject: 'Payment received for order {{order_number}}',
        html_body: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif"><div style="max-width:600px;margin:0 auto;padding:40px 20px"><div style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)"><div style="background:#18181b;padding:24px 32px"><h1 style="margin:0;color:#fff;font-size:20px">{{site_name}}</h1></div><div style="padding:32px"><h2 style="margin:0 0 8px;color:#18181b;font-size:22px">Payment Received</h2><p style="margin:0 0 24px;color:#71717a;font-size:15px">We've received your payment for order {{order_number}}.</p><div style="background:#f4f4f5;border-radius:6px;padding:16px;margin-bottom:16px"><p style="margin:0 0 4px;font-size:13px;color:#71717a">Order Number</p><p style="margin:0;font-size:16px;font-weight:600;color:#18181b">{{order_number}}</p></div><div style="background:#f4f4f5;border-radius:6px;padding:16px;margin-bottom:24px"><p style="margin:0 0 4px;font-size:13px;color:#71717a">Amount Paid</p><p style="margin:0;font-size:16px;font-weight:600;color:#18181b">\${{total}}</p></div><p style="margin:0;color:#71717a;font-size:14px">Your order is now being processed. We'll send you another email when it ships.</p></div><div style="padding:20px 32px;background:#f4f4f5;text-align:center"><p style="margin:0;font-size:13px;color:#a1a1aa">{{site_name}}</p></div></div></div></body></html>`
      },
      {
        slug: 'password-reset',
        name: 'Password Reset',
        subject: 'Reset your password',
        html_body: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif"><div style="max-width:600px;margin:0 auto;padding:40px 20px"><div style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)"><div style="background:#18181b;padding:24px 32px"><h1 style="margin:0;color:#fff;font-size:20px">{{site_name}}</h1></div><div style="padding:32px"><h2 style="margin:0 0 8px;color:#18181b;font-size:22px">Reset Your Password</h2><p style="margin:0 0 24px;color:#71717a;font-size:15px">We received a request to reset your password. Click the button below to choose a new one.</p><div style="text-align:center;margin:32px 0"><a href="{{reset_url}}" style="display:inline-block;background:#18181b;color:#fff;padding:12px 32px;border-radius:6px;text-decoration:none;font-size:15px;font-weight:600">Reset Password</a></div><p style="margin:0 0 8px;color:#71717a;font-size:13px">Or copy and paste this link:</p><p style="margin:0 0 24px;color:#3b82f6;font-size:13px;word-break:break-all">{{reset_url}}</p><p style="margin:0;color:#a1a1aa;font-size:13px">If you didn't request this, you can safely ignore this email. This link expires in 1 hour.</p></div><div style="padding:20px 32px;background:#f4f4f5;text-align:center"><p style="margin:0;font-size:13px;color:#a1a1aa">{{site_name}}</p></div></div></div></body></html>`
      }
    ];

    for (const tpl of emailTemplates) {
      await query(
        `INSERT INTO email_templates (slug, name, subject, html_body)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE name = VALUES(name)`,
        [tpl.slug, tpl.name, tpl.subject, tpl.html_body]
      );
    }
    console.log('✅ Default email templates created');

    // Create sample homepage
    const templates = await query('SELECT id FROM templates WHERE filename = ?', ['pages/homepage.njk']);
    if (templates && templates.length > 0 && templates[0]) {
      const homeContent = {
        hero_title: 'Welcome to WebWolf CMS',
        hero_subtitle: 'Build SEO-optimized websites with ease',
        hero_cta_text: 'Get Started',
        hero_cta_link: '/pages/about',
        intro_content: '<p>WebWolf CMS is a powerful, SEO-centric content management system built with React, Express, and Nunjucks.</p>',
        features: [
          { title: 'SEO First', description: 'Built with search engine optimization at its core', icon: 'search' },
          { title: 'Fast Rendering', description: 'Server-side rendered pages for optimal performance', icon: 'zap' },
          { title: 'Easy to Use', description: 'Intuitive admin interface powered by React', icon: 'smile' }
        ]
      };

      // Get or create content record
      let contentId;
      const existingContent = await query('SELECT id FROM content WHERE slug = ?', ['/pages/home']);

      if (existingContent && existingContent.length > 0 && existingContent[0]) {
        contentId = existingContent[0].id;
        // Update existing content
        await query(
          'UPDATE content SET module = ?, title = ?, data = ? WHERE slug = ?',
          ['pages', 'Home', JSON.stringify(homeContent), '/pages/home']
        );
      } else {
        // Create new content
        const contentResult = await query(
          `INSERT INTO content (module, slug, title, data)
           VALUES (?, ?, ?, ?)`,
          ['pages', '/pages/home', 'Home', JSON.stringify(homeContent)]
        );
        contentId = contentResult.insertId;
      }

      const pageResult = await query(
        `INSERT INTO pages (template_id, content_id, title, slug, status, meta_title, meta_description, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE content_id = VALUES(content_id)`,
        [templates[0].id, contentId, 'Home', '/pages/home', 'published', 'Welcome to WebWolf CMS', 'A powerful SEO-centric content management system', 1]
      );

      // Get the page ID (either inserted or existing)
      const pageIdResult = await query('SELECT id FROM pages WHERE content_id = ?', [contentId]);
      if (pageIdResult && pageIdResult[0]) {
        const pageId = pageIdResult[0].id;
        // Set this as the home page
        await query(
          'UPDATE settings SET setting_value = ? WHERE setting_key = ?',
          [String(pageId), 'home_page_id']
        );
      }

      console.log('✅ Sample homepage created');
    }

    // Create About and Contact pages (linked from default nav)
    const standardTemplate = await query('SELECT id FROM templates WHERE filename = ?', ['pages/standard.njk']);
    if (standardTemplate && standardTemplate.length > 0 && standardTemplate[0]) {
      const stdTemplateId = standardTemplate[0].id;

      const seedPages = [
        {
          slug: '/pages/about',
          title: 'About',
          metaTitle: 'About Us',
          metaDescription: 'Learn more about us',
          content: {
            page_title: 'About Us',
            page_content: '<p>Welcome to our site. This is the about page — edit it in the admin panel to tell your story.</p>',
            sidebar_content: ''
          }
        },
        {
          slug: '/pages/contact',
          title: 'Contact',
          metaTitle: 'Contact Us',
          metaDescription: 'Get in touch with us',
          content: {
            page_title: 'Contact Us',
            page_content: '<p>We\'d love to hear from you. Edit this page in the admin panel to add your contact details.</p>',
            sidebar_content: ''
          }
        }
      ];

      for (const sp of seedPages) {
        const existing = await query('SELECT id FROM content WHERE slug = ?', [sp.slug]);
        if (!existing || !existing.length || !existing[0]) {
          const contentResult = await query(
            'INSERT INTO content (module, slug, title, data) VALUES (?, ?, ?, ?)',
            ['pages', sp.slug, sp.title, JSON.stringify(sp.content)]
          );
          await query(
            `INSERT INTO pages (template_id, content_id, title, slug, status, meta_title, meta_description, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [stdTemplateId, contentResult.insertId, sp.title, sp.slug, 'published', sp.metaTitle, sp.metaDescription, 1]
          );
        }
      }
      console.log('✅ About and Contact pages created');
    }

    console.log('🌱 Seeding completed successfully');
    const pool = getPool();
    await pool.end();
  } catch (err) {
    console.error('❌ Seeding failed:', err.message);
    process.exit(1);
  }
}

seed();
