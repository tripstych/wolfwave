import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import pluralize from 'pluralize';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const THEMES_DIR = path.join(__dirname, '../../themes');
const ROOT_TEMPLATES_DIR = path.join(__dirname, '../../templates');

function getTemplatesDir(themeName = 'default') {
  return path.join(THEMES_DIR, themeName);
}

/**
 * Parse a Nunjucks template file to extract CMS regions
 */
export async function parseTemplate(filename, themeName = 'default') {
  // Check root templates first, then theme
  let templatePath = path.join(ROOT_TEMPLATES_DIR, filename);
  
  try {
    await fs.access(templatePath);
  } catch (e) {
    templatePath = path.join(THEMES_DIR, themeName, filename);
  }
  
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
 * Format content type name to label
 * Examples:
 *   "blog" → "Blog"
 *   "products" → "Products"
 */
function formatContentTypeLabel(name) {
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

/**
 * Get default icon based on content type name
 */
function getDefaultIcon(contentType) {
  const iconMap = {
    'pages': 'FileText',
    'blocks': 'Boxes',
    'widgets': 'Puzzle',
    'blog': 'BookOpen',
    'news': 'Newspaper',
    'products': 'Package',
    'team': 'Users',
    'portfolio': 'Briefcase'
  };
  return iconMap[contentType] || 'FileText';
}

/**
 * Scan all templates in the templates directory
 */
export async function scanTemplates(themeName = 'default') {
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
        // Skip layouts, assets, and partials directories
        if (!['layouts', 'assets', 'partials'].includes(entry.name)) {
          await scanDir(path.join(dir, entry.name), relativePath);
        }
      } else if (entry.name.endsWith('.njk')) {
        const regions = await parseTemplate(relativePath, themeName);
        
        // Avoid adding the same template twice if it exists in both root and theme
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

  // Scan root templates first
  await scanDir(ROOT_TEMPLATES_DIR);
  // Then scan theme templates
  await scanDir(path.join(THEMES_DIR, themeName));
  
  return templates;
}

/**
 * Scan only block templates (from blocks/ directory)
 */
export async function scanBlockTemplates(themeName = 'default') {
  const templates = [];
  const blocksDir = path.join(getTemplatesDir(themeName), 'blocks');

  try {
    const entries = await fs.readdir(blocksDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.njk')) {
        const relativePath = `blocks/${entry.name}`;
        const regions = await parseTemplate(relativePath, themeName);
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
export async function scanPageTemplates(themeName = 'default') {
  const templatesDir = getTemplatesDir(themeName);
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
        const regions = await parseTemplate(relativePath, themeName);
        templates.push({
          filename: relativePath,
          name: formatLabel(entry.name.replace('.njk', '')),
          regions
        });
      }
    }
  }

  await scanDir(templatesDir);
  return templates;
}

/**
 * Auto-register content types discovered from templates
 */
async function registerContentTypes(prisma, templates) {
  const discoveredTypes = new Set();

  templates.forEach(template => {
    const contentType = extractContentType(template.filename);
    discoveredTypes.add(contentType);
  });

  for (const typeName of discoveredTypes) {
    // Check if content type already exists
    const existing = await prisma.content_types.findUnique({
      where: { name: typeName }
    });

    if (!existing) {
      // Create new content type with sensible defaults
      const label = formatContentTypeLabel(typeName);
      const pluralLabel = pluralize.plural(label);

      await prisma.content_types.create({
        data: {
          name: typeName,
          label,
          plural_label: pluralLabel,
          icon: getDefaultIcon(typeName),
          has_status: !['blocks', 'widgets'].includes(typeName), // blocks/widgets don't have status
          has_seo: !['blocks', 'widgets'].includes(typeName)     // all other types have SEO
        }
      });
    }
  }
}

/**
 * Sync templates from filesystem to database
 */
export async function syncTemplatesToDb(prisma, themeName = 'default') {
  const templates = await scanTemplates(themeName);

  for (const template of templates) {
    const contentType = extractContentType(template.filename);

    // Use upsert to insert or update
    await prisma.templates.upsert({
      where: { filename: template.filename },
      create: {
        name: template.name,
        filename: template.filename,
        regions: template.regions,
        content_type: contentType
      },
      update: {
        name: template.name,
        regions: template.regions,
        content_type: contentType
      }
    });
  }

  // Auto-discover and register new content types
  await registerContentTypes(prisma, templates);

  return templates;
}

export default { parseTemplate, extractRegions, scanTemplates, syncTemplatesToDb };
