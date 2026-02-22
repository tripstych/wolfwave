import express from 'express';
import { query } from '../db/connection.js';
import { requireAuth, requireAdmin, requireEditor } from '../middleware/auth.js';
import slugify from 'slugify';
import { getMenuBySlug } from '../services/menuService.js';
import { getCustomerContext } from '../services/customerService.js';

const router = express.Router();

// Get all menus
router.get('/', requireAuth, async (req, res) => {
  try {
    const menus = await query(`
      SELECT m.*, COUNT(mi.id) as item_count 
      FROM menus m 
      LEFT JOIN menu_items mi ON m.id = mi.menu_id 
      GROUP BY m.id 
      ORDER BY m.name
    `);
    res.json(menus);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single menu with items
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const [menu] = await query('SELECT * FROM menus WHERE id = ?', [req.params.id]);
    if (!menu) {
      return res.status(404).json({ error: 'Menu not found' });
    }

    // Get menu items with nested structure
    const itemsData = await query(`
      SELECT mi.*, p.title as page_title, c.slug as page_slug, p.access_rules as page_access_rules
      FROM menu_items mi
      LEFT JOIN pages p ON mi.page_id = p.id
      LEFT JOIN content c ON p.content_id = c.id
      WHERE mi.menu_id = ?
      ORDER BY mi.position
    `, [req.params.id]);

    const items = itemsData.map(item => ({
      ...item,
      display_rules: item.display_rules ? (typeof item.display_rules === 'string' ? JSON.parse(item.display_rules) : item.display_rules) : { auth: 'all' },
      page_access_rules: item.page_access_rules ? (typeof item.page_access_rules === 'string' ? JSON.parse(item.page_access_rules) : item.page_access_rules) : null
    }));

    // Build nested tree structure
    const itemMap = {};
    const rootItems = [];

    items.forEach(item => {
      itemMap[item.id] = { ...item, children: [] };
    });

    items.forEach(item => {
      if (item.parent_id && itemMap[item.parent_id]) {
        itemMap[item.parent_id].children.push(itemMap[item.id]);
      } else {
        rootItems.push(itemMap[item.id]);
      }
    });

    res.json({ ...menu, items: rootItems });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get menu by slug (for public use)
router.get('/slug/:slug', async (req, res) => {
  try {
    const customer = await getCustomerContext(req);
    const menu = await getMenuBySlug(req.params.slug, {
      isLoggedIn: !!customer,
      hasActiveSubscription: !!customer?.subscription,
      customer,
      currentPath: req.query.path || '/'
    });

    if (!menu) {
      return res.status(404).json({ error: 'Menu not found' });
    }

    res.json(menu);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create menu
router.post('/', requireAuth, requireEditor, async (req, res) => {
  try {
    const { name, description, display_rules } = req.body;
    const slug = slugify(name, { lower: true, strict: true });

    const rulesJson = display_rules ? (typeof display_rules === 'string' ? display_rules : JSON.stringify(display_rules)) : null;

    const result = await query(
      'INSERT INTO menus (name, slug, description, display_rules) VALUES (?, ?, ?, ?)',
      [name, slug, description || null, rulesJson]
    );

    const [menu] = await query('SELECT * FROM menus WHERE id = ?', [result.insertId]);
    res.status(201).json(menu);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'A menu with this name already exists' });
    }
    console.error('[MENU_CREATE] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update menu
router.put('/:id', requireAuth, requireEditor, async (req, res) => {
  try {
    const { name, description, display_rules } = req.body;
    const slug = slugify(name, { lower: true, strict: true });

    const rulesJson = display_rules ? (typeof display_rules === 'string' ? display_rules : JSON.stringify(display_rules)) : null;

    await query(
      'UPDATE menus SET name = ?, slug = ?, description = ?, display_rules = ? WHERE id = ?',
      [name, slug, description || null, rulesJson, req.params.id]
    );

    const [menu] = await query('SELECT * FROM menus WHERE id = ?', [req.params.id]);
    res.json(menu);
  } catch (err) {
    console.error('[MENU_UPDATE] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Delete menu
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    await query('DELETE FROM menus WHERE id = ?', [req.params.id]);
    res.json({ message: 'Menu deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add menu item
router.post('/:id/items', requireAuth, requireEditor, async (req, res) => {
  try {
    const { title, url, page_id, parent_id, target, display_rules, description, image, is_mega, mega_columns, css_class } = req.body;

    // Get max position
    const [maxPos] = await query(
      'SELECT MAX(position) as max_pos FROM menu_items WHERE menu_id = ? AND parent_id <=> ?',
      [req.params.id, parent_id ? parseInt(parent_id) : null]
    );
    const position = (maxPos?.max_pos || 0) + 1;

    // Ensure display_rules is a string for storage
    const rulesJson = display_rules ? (typeof display_rules === 'string' ? display_rules : JSON.stringify(display_rules)) : null;

    const result = await query(
      `INSERT INTO menu_items (menu_id, parent_id, title, url, page_id, target, position, display_rules, description, image, is_mega, mega_columns, css_class)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.params.id,
        parent_id ? parseInt(parent_id) : null,
        title,
        url || null,
        page_id ? parseInt(page_id) : null,
        target || '_self',
        position,
        rulesJson,
        description || null,
        image || null,
        is_mega ? 1 : 0,
        mega_columns ? parseInt(mega_columns) : 4,
        css_class || null
      ]
    );

    const [item] = await query('SELECT * FROM menu_items WHERE id = ?', [result.insertId]);
    res.status(201).json(item);
  } catch (err) {
    console.error('[MENU_ITEM_CREATE] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update menu item
router.put('/:menuId/items/:itemId', requireAuth, requireEditor, async (req, res) => {
  try {
    const { title, url, page_id, parent_id, target, position, display_rules, description, image, is_mega, mega_columns, css_class } = req.body;

    // Ensure display_rules is a string for storage
    const rulesJson = display_rules ? (typeof display_rules === 'string' ? display_rules : JSON.stringify(display_rules)) : null;

    await query(
      `UPDATE menu_items SET title = ?, url = ?, page_id = ?, parent_id = ?, target = ?, position = ?, display_rules = ?, description = ?, image = ?, is_mega = ?, mega_columns = ?, css_class = ? WHERE id = ? AND menu_id = ?`,
      [
        title,
        url || null,
        page_id ? parseInt(page_id) : null,
        parent_id ? parseInt(parent_id) : null,
        target || '_self',
        position || 0,
        rulesJson,
        description || null,
        image || null,
        is_mega ? 1 : 0,
        mega_columns ? parseInt(mega_columns) : 4,
        css_class || null,
        req.params.itemId,
        req.params.menuId
      ]
    );

    const [item] = await query('SELECT * FROM menu_items WHERE id = ?', [req.params.itemId]);
    res.json(item);
  } catch (err) {
    console.error('[MENU_ITEM_UPDATE] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Delete menu item
router.delete('/:menuId/items/:itemId', requireAuth, requireEditor, async (req, res) => {
  try {
    await query('DELETE FROM menu_items WHERE id = ? AND menu_id = ?', [req.params.itemId, req.params.menuId]);
    res.json({ message: 'Menu item deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reorder single menu item
router.put('/:menuId/items/:itemId/reorder', requireAuth, requireEditor, async (req, res) => {
  try {
    const { direction } = req.body;
    const [item] = await query('SELECT * FROM menu_items WHERE id = ? AND menu_id = ?', [req.params.itemId, req.params.menuId]);

    if (!item) {
      return res.status(404).json({ error: 'Menu item not found' });
    }

    // Get sibling items (same parent_id)
    const siblings = await query(
      'SELECT * FROM menu_items WHERE menu_id = ? AND parent_id <=> ? ORDER BY position',
      [req.params.menuId, item.parent_id]
    );

    const currentIndex = siblings.findIndex(s => s.id === item.id);
    let targetIndex = currentIndex;

    if (direction === 'up' && currentIndex > 0) {
      targetIndex = currentIndex - 1;
    } else if (direction === 'down' && currentIndex < siblings.length - 1) {
      targetIndex = currentIndex + 1;
    }

    if (targetIndex !== currentIndex) {
      // Swap positions
      const sibling = siblings[targetIndex];
      await query('UPDATE menu_items SET position = ? WHERE id = ?', [sibling.position, item.id]);
      await query('UPDATE menu_items SET position = ? WHERE id = ?', [item.position, sibling.id]);
    }

    res.json({ message: 'Menu item reordered' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reorder menu items
router.put('/:id/reorder', requireAuth, requireEditor, async (req, res) => {
  try {
    const { items } = req.body; // Array of { id, position, parent_id }

    for (const item of items) {
      await query(
        'UPDATE menu_items SET position = ?, parent_id = ? WHERE id = ? AND menu_id = ?',
        [item.position, item.parent_id || null, item.id, req.params.id]
      );
    }

    res.json({ message: 'Menu reordered' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
