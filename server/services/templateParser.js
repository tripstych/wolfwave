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
 */
export async function syncTemplatesToDb(prisma) {
  const templates = await scanTemplates();
  const syncedFilenames = templates.map(t => t.filename);

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
          await prisma.templates.update({
            where: { id: existing.id },
            data: { content: cssContent, name: entry.name, content_type: 'css' }
          });
        } else {
          await prisma.templates.create({
            data: { filename: dbFilename, content: cssContent, name: entry.name, content_type: 'css' }
          });
        }
      }
    }
  } catch (err) {
    console.warn(`[TemplateParser] Could not sync CSS files: ${err.message}`);
  }

  for (const template of templates) {
    const contentType = extractContentType(template.filename);

    // Normalize filename: use forward slashes, no leading slash
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
    }
  }

  // ── CLEANUP STALE TEMPLATES ──
  const allDbTemplates = await prisma.templates.findMany({
    where: { filename: { notIn: syncedFilenames } },
    select: { id: true, filename: true, content_type: true }
  });

  // Get all virtual theme slugs to exclude them from cleanup
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

  return templates;
}

export default { parseTemplate, extractRegions, scanTemplates, syncTemplatesToDb };
