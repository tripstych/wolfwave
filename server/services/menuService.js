import { query } from '../db/connection.js';
import { canAccess } from '../middleware/permission.js';

export async function getMenuBySlug(slug, context = {}) {
  try {
    const menuResult = await query('SELECT * FROM menus WHERE slug = ?', [slug]);
    if (!menuResult || !menuResult.length || !menuResult[0]) return null;
    const [menu] = menuResult;

    const items = await query(`
      SELECT mi.*, p.title as page_title, c.slug as content_slug
      FROM menu_items mi
      LEFT JOIN pages p ON mi.page_id = p.id
      LEFT JOIN content c ON p.content_id = c.id
      WHERE mi.menu_id = ?
      ORDER BY mi.position
    `, [menu.id]);

    // Build nested tree
    const itemMap = {};
    const rootItems = [];

    // Filter items based on rules
    const filteredItems = items.filter(item => {
      let rules = item.display_rules;
      if (rules && typeof rules === 'string') {
        try { rules = JSON.parse(rules); } catch (e) {}
      }

      // 1. Centralized permission check (Auth + Subscription)
      if (!canAccess(rules, context)) return false;

      // 2. URL Pattern rule (Menu-specific)
      if (rules && rules.urlPattern && context.currentPath) {
        try {
          // Convert wildcard * to regex .*
          const pattern = rules.urlPattern
            .replace(/[.+^${}()|[\]\\]/g, '\\$&') // escape regex chars
            .replace(/\\\*/g, '.*'); // convert escaped * back to .*
          const regex = new RegExp(`^${pattern}$`);
          if (!regex.test(context.currentPath)) return false;
        } catch (e) {
          console.error('Invalid URL pattern:', rules.urlPattern);
        }
      }

      return true;
    });

    filteredItems.forEach(item => {
      const url = item.page_id ? (item.content_slug || '/') : item.url;
      
      let rules = item.display_rules;
      if (typeof rules === 'string') {
        try { rules = JSON.parse(rules); } catch (e) { rules = null; }
      }

      itemMap[item.id] = {
        id: item.id,
        title: item.title,
        url,
        target: item.target,
        description: item.description || null,
        image: item.image || null,
        is_mega: !!item.is_mega,
        mega_columns: item.mega_columns || 4,
        css_class: item.css_class || null,
        display_rules: rules,
        children: []
      };
    });

    filteredItems.forEach(item => {
      if (item.parent_id && itemMap[item.parent_id]) {
        itemMap[item.parent_id].children.push(itemMap[item.id]);
      } else if (!item.parent_id) {
        rootItems.push(itemMap[item.id]);
      }
    });

    return { ...menu, items: rootItems };
  } catch (err) {
    console.error('Error fetching menu:', err);
    return null;
  }
}

export async function createMenu(name, slug, description = '') {
  const result = await query(
    'INSERT INTO menus (name, slug, description, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())',
    [name, slug, description]
  );
  return { id: result.insertId, name, slug, description };
}

export async function createMenuItem(menuId, item) {
  const { title, url, parentId = null, position = 0, target = 'self' } = item;
  const result = await query(
    'INSERT INTO menu_items (menu_id, parent_id, title, url, target, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())',
    [menuId, parentId, title, url, target, position]
  );
  return { id: result.insertId, ...item };
}

export async function getAllMenus(context = {}) {
  try {
    const menus = await query('SELECT slug FROM menus');
    const result = {};
    
    for (const menu of menus) {
      result[menu.slug] = await getMenuBySlug(menu.slug, context);
    }
    
    return result;
  } catch (err) {
    console.error('Error fetching menus:', err);
    return {};
  }
}
