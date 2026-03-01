import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';


const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_TEMPLATES_DIR = path.join(__dirname, '../../templates');

/**
 * Parse a Nunjucks template file to extract CMS regions
 */
export async function parseTemplate(filename) {
  const templatePath = path.join(ROOT_TEMPLATES_DIR, filename);

  try {
    const content = await fs.readFile(templatePath, 'utf-8');
    return extractRegions(content);
  } catch (err) {
    console.error(`Failed to parse template ${filename}:`, err.message);
    return [];
  }
}

/**
 * Extract CMS regions from template content
 */
export function extractRegions(content) {
  const regions = [];

  // Match data-cms-region attributes with their associated attributes
  const regionRegex = /data-cms-region=["']([^"']+)["'][^>]*>/gi;
  const matches = content.matchAll(regionRegex);

  for (const match of matches) {
    const regionName = match[1];
    const fullMatch = match[0];

    // Extract other attributes from the same element
    const region = {
      name: regionName,
      type: extractAttribute(fullMatch, 'data-cms-type') || 'text',
      label: extractAttribute(fullMatch, 'data-cms-label') || formatLabel(regionName),
      required: extractAttribute(fullMatch, 'data-cms-required') === 'true',
      placeholder: extractAttribute(fullMatch, 'data-cms-placeholder') || ''
    };

    // Handle repeater fields
    if (region.type === 'repeater') {
      const fieldsJson = extractAttribute(fullMatch, 'data-cms-fields');
      if (fieldsJson) {
        try {
          region.fields = JSON.parse(fieldsJson.replace(/&quot;/g, '"'));
        } catch (e) {
          region.fields = [];
        }
      }
    }

    // Avoid duplicates
    if (!regions.find(r => r.name === regionName)) {
      regions.push(region);
    }
  }

  return regions;
}

/**
 * Extract a specific attribute value from an HTML tag string
 */
function extractAttribute(tagString, attrName) {
  const regex = new RegExp(`${attrName}=("([^"]*)"|'([^']*)')`, 'i');
  const match = tagString.match(regex);
  return match ? (match[2] ?? match[3] ?? null) : null;
}

/**
 * Convert snake_case or kebab-case to Title Case
 */
function formatLabel(name) {
  return name
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Extract content type from template filename
 * Examples:
 *   "pages/homepage.njk" → "pages"
 *   "blog/post.njk" → "blog"
 *   "products/single.njk" → "products"
 */
export function extractContentType(filename) {
  const parts = filename.split('/');
  return parts[0]; // First folder is content type
}

/**
 * Scan all templates in the root templates directory
 */
export async function scanTemplates() {
  const templates = [];

  async function scanDir(dir, prefix = '') {
    try {
      await fs.access(dir);
    } catch (e) {
      return;
    }

    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        // Skip layouts, assets, partials, and scaffolds directories
        if (!['layouts', 'assets', 'partials', 'scaffolds'].includes(entry.name)) {
          await scanDir(path.join(dir, entry.name), relativePath);
        }
      } else if (entry.name.endsWith('.njk')) {
        const regions = await parseTemplate(relativePath);

        if (!templates.find(t => t.filename === relativePath)) {
          templates.push({
            filename: relativePath,
            name: formatLabel(entry.name.replace('.njk', '')),
            regions
          });
        }
      }
    }
  }

  await scanDir(ROOT_TEMPLATES_DIR);

  return templates;
}

/**
 * Scan only block templates (from blocks/ directory)
 */
export async function scanBlockTemplates() {
  const templates = [];
  const blocksDir = path.join(ROOT_TEMPLATES_DIR, 'blocks');

  try {
    const entries = await fs.readdir(blocksDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.njk')) {
        const relativePath = `blocks/${entry.name}`;
        const regions = await parseTemplate(relativePath);
        templates.push({
          filename: relativePath,
          name: formatLabel(entry.name.replace('.njk', '')),
          regions
        });
      }
    }
  } catch (err) {
    console.error('Failed to scan block templates:', err.message);
  }

  return templates;
}

/**
 * Scan only page templates (excluding blocks/, layouts/, assets/, partials/)
 */
export async function scanPageTemplates() {
  const templates = [];

  async function scanDir(dir, prefix = '') {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        if (!['layouts', 'blocks', 'assets', 'partials'].includes(entry.name)) {
          await scanDir(path.join(dir, entry.name), relativePath);
        }
      } else if (entry.name.endsWith('.njk')) {
        const regions = await parseTemplate(relativePath);
        templates.push({
          filename: relativePath,
          name: formatLabel(entry.name.replace('.njk', '')),
          regions
        });
      }
    }
  }

  await scanDir(ROOT_TEMPLATES_DIR);
  return templates;
}

/**
 * Sync templates from filesystem (templates/) to database.
 * Also syncs CSS files so they can be served from DB.
 *
 * @param {object} prisma - Prisma client
 * @param {object} options
 * @param {string} options.mode - 'overwrite' (default) replaces all templates with filesystem versions.
 *                                'merge' only inserts templates that don't already exist in DB.
 */
export async function syncTemplatesToDb(prisma, options = {}) {
  const mode = (typeof options === 'string') ? 'overwrite' : (options.mode || 'overwrite');
  const templates = await scanTemplates();
  const syncedFilenames = templates.map(t => t.filename);
  let created = 0, updated = 0, skipped = 0;

  // Also sync CSS files from templates/css/
  const cssDir = path.join(ROOT_TEMPLATES_DIR, 'css');
  try {
    const cssEntries = await fs.readdir(cssDir, { withFileTypes: true });
    for (const entry of cssEntries) {
      if (entry.isFile() && entry.name.endsWith('.css')) {
        const cssFilename = `css/${entry.name}`;
        const cssContent = await fs.readFile(path.join(cssDir, entry.name), 'utf-8');

        // Store with default/ prefix so /themes/default/css/x.css resolves in DB
        const dbFilename = `default/${cssFilename}`;
        syncedFilenames.push(dbFilename);

        const existing = await prisma.templates.findFirst({
          where: { filename: dbFilename }
        });

        if (existing) {
          if (mode === 'overwrite') {
            await prisma.templates.update({
              where: { id: existing.id },
              data: { content: cssContent, name: entry.name, content_type: 'css' }
            });
            updated++;
          } else {
            skipped++;
          }
        } else {
          await prisma.templates.create({
            data: { filename: dbFilename, content: cssContent, name: entry.name, content_type: 'css' }
          });
          created++;
        }
      }
    }
  } catch (err) {
    console.warn(`[TemplateParser] Could not sync CSS files: ${err.message}`);
  }

  for (const template of templates) {
    const contentType = extractContentType(template.filename);
    const normalizedFilename = template.filename.replace(/\\/g, '/').replace(/^\//, '');

    // Read the content from the file
    let content = null;
    try {
      const templatePath = path.join(ROOT_TEMPLATES_DIR, template.filename);
      content = await fs.readFile(templatePath, 'utf-8');
    } catch (e) {
      console.error(`Failed to read content for ${template.filename}:`, e.message);
    }

    // Try to find existing template with any path format variation
    const existingTemplate = await prisma.templates.findFirst({
      where: {
        OR: [
          { filename: normalizedFilename },
          { filename: '/' + normalizedFilename },
          { filename: normalizedFilename.replace(/\//g, '\\') }
        ]
      }
    });

    if (existingTemplate) {
      if (mode === 'overwrite') {
        await prisma.templates.update({
          where: { id: existingTemplate.id },
          data: {
            name: template.name,
            filename: normalizedFilename,
            regions: template.regions,
            content_type: contentType,
            content: content
          }
        });
        updated++;
      } else {
        skipped++;
      }
    } else {
      await prisma.templates.create({
        data: {
          name: template.name,
          filename: normalizedFilename,
          regions: template.regions,
          content_type: contentType,
          content: content
        }
      });
      created++;
    }
  }

  // ── CLEANUP STALE TEMPLATES (only in overwrite mode) ──
  if (mode === 'overwrite') {
    const allDbTemplates = await prisma.templates.findMany({
      where: { filename: { notIn: syncedFilenames } },
      select: { id: true, filename: true, content_type: true }
    });

    const virtualThemes = await prisma.themes.findMany({
      where: { source: 'virtual' },
      select: { slug: true }
    });
    const virtualThemeSlugs = new Set(virtualThemes.map(t => t.slug));

    const staleTemplates = allDbTemplates.filter(t => {
      if (!t.filename) return false;
      const templateSlug = t.filename.split('/')[0];
      return !virtualThemeSlugs.has(templateSlug);
    });

    if (staleTemplates.length > 0) {
      console.log(`Cleaning up ${staleTemplates.length} stale templates...`);
      const { handleStaleTemplateMigration } = await import('./templateMigrationService.js');

      const availableTemplates = await prisma.templates.findMany({
        where: { filename: { in: syncedFilenames } }
      });

      for (const stale of staleTemplates) {
        try {
          const canDelete = await handleStaleTemplateMigration(stale.id, availableTemplates);

          if (canDelete) {
            await prisma.templates.delete({ where: { id: stale.id } });
            console.log(`Deleted stale template: ${stale.filename}`);
          } else {
            console.warn(`Preserved stale template ${stale.filename} as it still has records that couldn't be migrated.`);
          }
        } catch (err) {
          console.warn(`Could not delete stale template ${stale.filename}: ${err.message}`);
        }
      }
    }
  }

  return { templates, created, updated, skipped, mode };
}

/**
 * Save current tenant's DB templates as a named theme.
 * Creates a theme record and copies all templates with a theme-prefixed filename.
 */
export async function saveCurrentAsTheme(prisma, { name, description = '' }) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 50);

  // Get all current templates (excluding ones already prefixed with another theme slug)
  const allTemplates = await prisma.templates.findMany();

  // Filter to "base" templates — filenames that don't start with a known theme slug
  const existingThemes = await prisma.themes.findMany({ select: { slug: true } });
  const themeSlugs = new Set(existingThemes.map(t => t.slug));

  const baseTemplates = allTemplates.filter(t => {
    if (!t.filename) return false;
    const prefix = t.filename.split('/')[0];
    // Keep templates that aren't prefixed with a theme slug (or are prefixed with 'default/')
    return !themeSlugs.has(prefix) || prefix === 'default';
  });

  // Create or update the theme record
  const themeConfig = {
    name,
    slug,
    version: '1.0.0',
    description,
    inherits: null,
    assets: { css: [], js: [] }
  };

  // Collect CSS assets from the base templates
  const cssTemplates = baseTemplates.filter(t => t.filename.startsWith('default/css/'));
  for (const css of cssTemplates) {
    // default/css/variables.css → css/variables.css
    const assetPath = css.filename.replace('default/', '');
    themeConfig.assets.css.push(assetPath);
  }

  await prisma.themes.upsert({
    where: { slug },
    update: {
      name,
      description,
      config: themeConfig,
      source: 'saved',
      updated_at: new Date()
    },
    create: {
      slug,
      name,
      description,
      version: '1.0.0',
      config: themeConfig,
      source: 'saved',
      created_at: new Date(),
      updated_at: new Date()
    }
  });

  // Copy templates into theme-prefixed filenames
  let copied = 0;
  for (const tpl of baseTemplates) {
    // For CSS: default/css/x.css → mytheme/css/x.css
    // For templates: pages/homepage.njk → mytheme/pages/homepage.njk
    const themeFilename = tpl.filename.startsWith('default/')
      ? tpl.filename.replace('default/', `${slug}/`)
      : `${slug}/${tpl.filename}`;

    await prisma.templates.upsert({
      where: { filename: themeFilename },
      update: {
        content: tpl.content,
        name: tpl.name,
        regions: tpl.regions,
        content_type: tpl.content_type,
        updated_at: new Date()
      },
      create: {
        filename: themeFilename,
        content: tpl.content,
        name: tpl.name,
        regions: tpl.regions,
        content_type: tpl.content_type,
        created_at: new Date(),
        updated_at: new Date()
      }
    });
    copied++;
  }

  return { slug, name, copied };
}

export default { parseTemplate, extractRegions, scanTemplates, syncTemplatesToDb, saveCurrentAsTheme };
