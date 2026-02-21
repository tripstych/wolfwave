import { query } from '../db/connection.js';

/**
 * Seed a new tenant with essential initial content.
 * Assumes templates have already been synced.
 */
export async function seedNewTenant(tenantName) {
  try {
    // 1. Setup default settings
    await query(
      `INSERT INTO settings (setting_key, setting_value) 
       VALUES (?, ?), (?, ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      ['site_name', tenantName, 'active_theme', 'default']
    );

    // 2. Create Homepage
    const homepageTemplate = await query('SELECT id FROM templates WHERE filename = ?', ['pages/homepage.njk']);
    if (homepageTemplate && homepageTemplate[0]) {
      const homeContent = {
        hero_title: `Welcome to ${tenantName}`,
        hero_subtitle: 'Build something amazing today.',
        hero_cta_text: 'Learn More',
        hero_cta_link: '/pages/about',
        intro_content: `<p>Welcome to our new website powered by WolfWave CMS.</p>`,
        features: [
          { title: 'Feature 1', description: 'Describe your first key feature here.', icon: 'star' },
          { title: 'Feature 2', description: 'Describe your second key feature here.', icon: 'zap' },
          { title: 'Feature 3', description: 'Describe your third key feature here.', icon: 'shield' }
        ]
      };

      const contentResult = await query(
        `INSERT INTO content (module, slug, title, data) VALUES (?, ?, ?, ?)`,
        ['pages', '/pages/home', 'Home', JSON.stringify(homeContent)]
      );

      const pageResult = await query(
        `INSERT INTO pages (template_id, content_id, title, status, meta_title, meta_description, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [homepageTemplate[0].id, contentResult.insertId, 'Home', 'published', `Welcome to ${tenantName}`, `The homepage of ${tenantName}`, 1]
      );

      // Set as homepage in settings
      await query(
        `INSERT INTO settings (setting_key, setting_value) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
        ['home_page_id', String(pageResult.insertId)]
      );
    }

    // 3. Create About Page
    const standardTemplate = await query('SELECT id FROM templates WHERE filename = ?', ['pages/standard.njk']);
    if (standardTemplate && standardTemplate[0]) {
      const aboutContent = {
        page_title: 'About Us',
        page_content: `<h2>Our Story</h2><p>This is where you tell the world about ${tenantName}. Edit this in the admin panel to share your mission and values.</p>`,
        sidebar_content: '<p>Contact us anytime at support@example.com</p>'
      };

      const contentResult = await query(
        `INSERT INTO content (module, slug, title, data) VALUES (?, ?, ?, ?)`,
        ['pages', '/pages/about', 'About Us', JSON.stringify(aboutContent)]
      );

      await query(
        `INSERT INTO pages (template_id, content_id, title, status, meta_title, meta_description, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [standardTemplate[0].id, contentResult.insertId, 'About Us', 'published', 'About Us', `Learn more about ${tenantName}`, 1]
      );
    }

    console.log(`[TENANT_SEED] Essential pages seeded for tenant.`);
    return true;
  } catch (err) {
    console.error('[TENANT_SEED] Failed to seed essential pages:', err.message);
    return false;
  }
}
