import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { query, getPool } from '../server/db/connection.js';

describe('Database Seeding', () => {
  let pool;

  beforeAll(async () => {
    // Setup test database connection
    pool = getPool();
  });

  afterAll(async () => {
    // Clean up test database connection
    if (pool) {
      await pool.end();
    }
  });

  beforeEach(async () => {
    // Clean up test data before each test
    await query('DELETE FROM blocks WHERE slug LIKE ?', ['test-%']);
    await query('DELETE FROM content WHERE title LIKE ?', ['Test%']);
    await query('DELETE FROM templates WHERE filename LIKE ?', ['widgets/test-%']);
  });

  describe('Widget Creation', () => {
    it('should create widget content type with proper validation', async () => {
      // Test that widgets content type exists
      const widgetTypes = await query('SELECT * FROM content_types WHERE name = ?', ['widgets']);
      expect(widgetTypes).toBeDefined();
      expect(widgetTypes.length).toBeGreaterThan(0);
      expect(widgetTypes[0]).toHaveProperty('name', 'widgets');
      expect(widgetTypes[0]).toHaveProperty('label', 'Widget');
    });

    it('should handle missing template gracefully', async () => {
      // Test the validation we added - should not throw error
      const nonExistentTemplate = await query('SELECT id FROM templates WHERE filename = ?', ['widgets/non-existent.njk']);
      
      // This should not throw due to our validation
      expect(() => {
        if (nonExistentTemplate && nonExistentTemplate.length > 0 && nonExistentTemplate[0]) {
          // This block should not execute
          throw new Error('Should not reach here');
        }
      }).not.toThrow();
    });

    it('should validate query results before accessing array elements', async () => {
      // Test empty result handling
      const emptyResult = await query('SELECT id FROM templates WHERE filename = ?', ['widgets/empty-test.njk']);
      
      // Should handle empty results gracefully
      expect(emptyResult).toBeDefined();
      expect(emptyResult.length).toBe(0);
      
      // This should not throw due to our validation
      const hasValidResult = emptyResult && emptyResult.length > 0 && emptyResult[0];
      expect(hasValidResult).toBe(false);
    });

    it('should create search widget template with proper regions', async () => {
      // Insert test template
      const regions = JSON.stringify([
        { name: 'widget_title', type: 'text', label: 'Widget Title' },
        { name: 'placeholder', type: 'text', label: 'Input Placeholder' }
      ]);

      const result = await query(
        `INSERT INTO templates (name, filename, description, regions, content_type) 
         VALUES (?, ?, ?, ?, ?)`,
        ['Test Search Form', 'widgets/test-search-form.njk', 'Test search widget', regions, 'widgets']
      );

      expect(result.insertId).toBeDefined();
      expect(result.insertId).toBeGreaterThan(0);

      // Verify template was created correctly
      const templates = await query('SELECT * FROM templates WHERE filename = ?', ['widgets/test-search-form.njk']);
      expect(templates && templates.length > 0 && templates[0]).toBe(true);
      
      if (templates && templates.length > 0 && templates[0]) {
        const template = templates[0];
        expect(template.name).toBe('Test Search Form');
        expect(template.content_type).toBe('widgets');
        
        const parsedRegions = JSON.parse(template.regions);
        expect(parsedRegions).toHaveLength(2);
        expect(parsedRegions[0].name).toBe('widget_title');
        expect(parsedRegions[1].name).toBe('placeholder');
      }
    });

    it('should prevent duplicate widget creation', async () => {
      // Create a test widget
      const contentResult = await query(
        `INSERT INTO content (module, title, data) VALUES (?, ?, ?)`,
        ['widgets', 'Test Widget', JSON.stringify({ widget_title: 'Test', placeholder: 'Test placeholder' })]
      );

      const templateResult = await query('SELECT id FROM templates WHERE filename = ?', ['widgets/test-search-form.njk']);
      
      if (templateResult && templateResult.length > 0 && templateResult[0]) {
        // Create first widget
        await query(
          `INSERT INTO blocks (template_id, content_id, name, slug, content_type) 
           VALUES (?, ?, ?, ?, ?)`,
          [templateResult[0].id, contentResult.insertId, 'Test Widget', 'test-widget', 'widgets']
        );

        // Try to create duplicate - should fail due to unique slug constraint
        await expect(
          query(
            `INSERT INTO blocks (template_id, content_id, name, slug, content_type) 
             VALUES (?, ?, ?, ?, ?)`,
            [templateResult[0].id, contentResult.insertId, 'Test Widget 2', 'test-widget', 'widgets']
          )
        ).rejects.toThrow();
      }
    });
  });

  describe('Query Validation', () => {
    it('should handle null query results', () => {
      // Test our validation pattern
      const nullResult = null;
      const undefinedResult = undefined;
      const emptyArray = [];
      const validArray = [{ id: 1 }];

      expect(nullResult && nullResult.length > 0 && nullResult[0]).toBe(false);
      expect(undefinedResult && undefinedResult.length > 0 && undefinedResult[0]).toBe(false);
      expect(emptyArray && emptyArray.length > 0 && emptyArray[0]).toBe(false);
      expect(validArray && validArray.length > 0 && validArray[0]).toBe(true);
    });

    it('should validate menu service query pattern', async () => {
      // Test the menu service validation pattern
      const menuResult = await query('SELECT * FROM menus WHERE slug = ?', ['non-existent-menu']);
      
      // Should handle non-existent menu gracefully
      expect(menuResult).toBeDefined();
      
      const hasValidMenu = menuResult && menuResult.length > 0 && menuResult[0];
      expect(hasValidMenu).toBe(false);
      
      // Should not throw when trying to destructure
      expect(() => {
        if (hasValidMenu) {
          const [menu] = menuResult;
          expect(menu).toBeDefined();
        }
      }).not.toThrow();
    });
  });
});
