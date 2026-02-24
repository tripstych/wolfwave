/**
 * WordPress Theme ZIP Converter
 *
 * Accepts a WP theme ZIP, extracts it, converts PHP templates to Nunjucks,
 * writes them to the templates/ directory, and registers them in the DB.
 */

import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import prisma from '../lib/prisma.js';
import { syncTemplatesToDb } from './templateParser.js';
import { getCurrentDbName } from '../lib/tenantContext.js';
import { info, error as logError } from '../lib/logger.js';
import {
  convertPhpToNunjucks,
  extractBodyContent,
  buildBaseLayout,
  wrapAsChildTemplate,
  parseThemeMetadata,
  extractThemeStyles,
  detectPluginUsage,
  convertPhpWithLLM
} from '../lib/phpToNunjucks.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(__dirname, '../../templates');
const THEMES_DIR = path.join(__dirname, '../../themes');
const UPLOADS_DIR = path.join(__dirname, '../../uploads');

// WP template hierarchy → WebWolf content types
const TEMPLATE_MAP = {
  'page.php':          { dir: 'pages',    name: 'page',     contentType: 'pages' },
  'single.php':        { dir: 'posts',    name: 'post',     contentType: 'posts' },
  'single-post.php':   { dir: 'posts',    name: 'post',     contentType: 'posts' },
  'archive.php':       { dir: 'posts',    name: 'archive',  contentType: 'posts' },
  'category.php':      { dir: 'posts',    name: 'category', contentType: 'posts' },
  'tag.php':           { dir: 'posts',    name: 'tag',      contentType: 'posts' },
  'index.php':         { dir: 'pages',    name: 'index',    contentType: 'pages' },
  'front-page.php':    { dir: 'pages',    name: 'home',     contentType: 'pages' },
  'home.php':          { dir: 'pages',    name: 'home',     contentType: 'pages' },
  'search.php':        { dir: 'pages',    name: 'search',   contentType: 'pages' },
  '404.php':           { dir: 'pages',    name: '404',      contentType: 'pages' },
  'author.php':        { dir: 'pages',    name: 'author',   contentType: 'pages' },
  'taxonomy.php':      { dir: 'pages',    name: 'taxonomy', contentType: 'pages' },
};

/**
 * Preview a WP theme ZIP without writing anything.
 * Returns metadata, detected files, and a sample conversion.
 */
export async function previewWpTheme(zipBuffer) {
  const AdmZip = (await import('adm-zip')).default;
  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries();

  // Find the theme root (could be nested in a subfolder)
  const themeRoot = findThemeRoot(entries);

  // Read style.css for metadata
  const styleCssEntry = findEntry(entries, themeRoot, 'style.css');
  const metadata = styleCssEntry
    ? parseThemeMetadata(styleCssEntry.getData().toString('utf-8'))
    : { theme_name: 'Unknown Theme' };

  // Detect which template files exist
  const detectedFiles = [];
  const allPhpFiles = entries.filter(e => !e.isDirectory && e.entryName.endsWith('.php'));

  for (const entry of allPhpFiles) {
    const relativePath = themeRoot ? entry.entryName.replace(themeRoot, '') : entry.entryName;
    const basename = path.basename(relativePath);
    const mapping = TEMPLATE_MAP[basename];

    detectedFiles.push({
      source: relativePath,
      basename,
      size: entry.header.size,
      hasMapping: !!mapping,
      targetDir: mapping?.dir || null,
      targetName: mapping?.name || null,
      contentType: mapping?.contentType || null,
      isTemplatePart: relativePath.includes('template-parts/') || relativePath.includes('inc/') || relativePath.includes('partials/'),
      isLayout: basename === 'header.php' || basename === 'footer.php' || basename === 'sidebar.php'
    });
  }

  // Extract theme styles
  let themeStyles = null;
  if (styleCssEntry) {
    themeStyles = extractThemeStyles(styleCssEntry.getData().toString('utf-8'));
  }

  // Detect screenshot
  const screenshotEntry = findEntry(entries, themeRoot, 'screenshot.png') || findEntry(entries, themeRoot, 'screenshot.jpg');
  const hasScreenshot = !!screenshotEntry;

  // Check if it's a child theme
  const wpParentSlug = metadata.template || null;
  const isChildTheme = !!wpParentSlug;
  const convertedParent = isChildTheme ? await findConvertedParent(wpParentSlug) : null;

  const functionsEntry = findEntry(entries, themeRoot, 'functions.php');

  // Scan all PHP files for plugin usage
  const allPhpSource = allPhpFiles.map(e => e.getData().toString('utf-8')).join('\n');
  const pluginInfo = detectPluginUsage(allPhpSource);

  // Count files that need LLM conversion
  const filesNeedingLLM = allPhpFiles.filter(e => {
    const src = e.getData().toString('utf-8');
    const det = detectPluginUsage(src);
    return det.needsLLM;
  }).length;

  return {
    metadata,
    isChildTheme,
    parentTheme: wpParentSlug,
    parentThemeFound: !!convertedParent,
    hasScreenshot,
    hasFunctionsPhp: !!functionsEntry,
    detectedFiles,
    templateCount: detectedFiles.filter(f => f.hasMapping).length,
    partialCount: detectedFiles.filter(f => f.isTemplatePart).length,
    layoutCount: detectedFiles.filter(f => f.isLayout).length,
    themeStyles: themeStyles ? {
      primaryColor: themeStyles.colors.primary || null,
      secondaryColor: themeStyles.colors.secondary || null,
      fonts: themeStyles.fonts.slice(0, 3)
    } : null,
    plugins: pluginInfo.pluginHints,
    hasElementor: pluginInfo.hasElementor,
    hasACF: pluginInfo.hasACF,
    needsLLM: pluginInfo.needsLLM,
    filesNeedingLLM
  };
}

/**
 * Convert a WP theme ZIP and install it.
 * Returns the list of generated templates.
 */
export async function convertWpTheme(zipBuffer, options = {}) {
  const dbName = getCurrentDbName();
  const AdmZip = (await import('adm-zip')).default;
  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries();
  const themeRoot = findThemeRoot(entries);
  const useLLM = options.useLLM !== false; // default true
  const scanFunctions = options.scanFunctions === true; // default false

  // 1. Read metadata
  const styleCssEntry = findEntry(entries, themeRoot, 'style.css');
  const metadata = styleCssEntry
    ? parseThemeMetadata(styleCssEntry.getData().toString('utf-8'))
    : { theme_name: 'Imported Theme' };

  const themeSlug = sanitizeName(metadata.theme_name || 'imported');
  const themePath = path.join(THEMES_DIR, themeSlug);
  
  info(dbName, 'WP_CONVERT_START', `Converting WP theme: ${metadata.theme_name} into themes/${themeSlug}`);

  // Check if it's a child theme
  const wpParentSlug = metadata.template || null;
  let inherits = null;
  if (wpParentSlug) {
    // Try to find if we've already converted the parent
    // We search for a theme folder that matches the parent slug or has metadata matching it
    const convertedParent = await findConvertedParent(wpParentSlug);
    if (convertedParent) {
      inherits = convertedParent;
      info(dbName, 'WP_CONVERT_INHERIT', `Detected child theme! Inheriting from: ${inherits}`);
    } else {
      info(dbName, 'WP_CONVERT_INHERIT_MISSING', `Detected child theme but parent "${wpParentSlug}" not found in themes/. Defaulting to inheritance from base.`);
    }
  }

  const results = {
    themeName: metadata.theme_name,
    slug: themeSlug,
    inherits,
    templates: [],
    warnings: [],
    themeOptions: {}
  };

  // 2. Create theme directory structure
  await ensureDir(themePath);
  await ensureDir(path.join(themePath, 'layouts'));
  await ensureDir(path.join(themePath, 'pages'));
  await ensureDir(path.join(themePath, 'posts'));
  await ensureDir(path.join(themePath, 'components'));
  await ensureDir(path.join(themePath, 'assets'));

  // 3. Extract theme styles / colors
  if (styleCssEntry) {
    const styles = extractThemeStyles(styleCssEntry.getData().toString('utf-8'));
    if (styles.colors.primary) results.themeOptions.primary_color = styles.colors.primary;
    if (styles.colors.secondary) results.themeOptions.secondary_color = styles.colors.secondary;
    if (styles.fonts[0]) results.themeOptions.google_font_body = styles.fonts[0];
    if (styles.fonts[1]) results.themeOptions.google_font_heading = styles.fonts[1];
  }

  // 4. Build base layout from header.php + footer.php
  const headerEntry = findEntry(entries, themeRoot, 'header.php');
  const footerEntry = findEntry(entries, themeRoot, 'footer.php');

  let baseLayout = 'layouts/main.njk';

  if (headerEntry || footerEntry) {
    const headerPhp = headerEntry ? headerEntry.getData().toString('utf-8') : '';
    const footerPhp = footerEntry ? footerEntry.getData().toString('utf-8') : '';
    const layoutNjk = buildBaseLayout(headerPhp, footerPhp, themeSlug);
    await fs.writeFile(path.join(themePath, 'layouts/main.njk'), layoutNjk, 'utf-8');
    info(dbName, 'WP_CONVERT_LAYOUT', `Generated base layout: layouts/main.njk`);
  } else if (inherits) {
    // Child theme with no header/footer — it will inherit layouts/main.njk from parent
    info(dbName, 'WP_CONVERT_LAYOUT_INHERIT', `No header/footer found, inheriting layout from ${inherits}`);
  } else {
    // No header/footer and no parent — fallback to system base
    baseLayout = 'layouts/base.njk';
    results.warnings.push('No header.php/footer.php found — templates will use the default system layout');
  }

  // 5. Create theme.json
  const themeJson = {
    name: metadata.theme_name,
    slug: themeSlug,
    version: metadata.version || '1.0.0',
    description: metadata.description || 'Converted from WordPress',
    inherits: inherits,
    assets: {
      css: ["assets/style.css"],
      js: []
    }
  };

  // 5A. Scan functions.php for extra assets if requested
  const functionsEntry = findEntry(entries, themeRoot, 'functions.php');
  if (functionsEntry && scanFunctions) {
    const { scanFunctionsPhp } = await import('../lib/phpToNunjucks.js');
    const extraAssets = scanFunctionsPhp(functionsEntry.getData().toString('utf-8'));
    
    // Add extra CSS
    for (const cssFile of extraAssets.styles) {
      if (!themeJson.assets.css.includes(cssFile)) {
        themeJson.assets.css.push(cssFile);
        info(dbName, 'WP_CONVERT_ASSET', `Extracted CSS from functions.php: ${cssFile}`);
      }
    }
    
    // Add extra JS
    for (const jsFile of extraAssets.scripts) {
      if (!themeJson.assets.js.includes(jsFile)) {
        themeJson.assets.js.push(jsFile);
        info(dbName, 'WP_CONVERT_ASSET', `Extracted JS from functions.php: ${jsFile}`);
      }
    }
  }

  await fs.writeFile(path.join(themePath, 'theme.json'), JSON.stringify(themeJson, null, 2), 'utf-8');

  // 6. Extract and save CSS
  if (styleCssEntry) {
    const rawCss = styleCssEntry.getData().toString('utf-8');
    const extractedCss = rawCss.replace(/\/\*[\s\S]*?\*\//, '').trim();
    if (extractedCss.length > 0) {
      await fs.writeFile(path.join(themePath, 'assets/style.css'), extractedCss, 'utf-8');
    }
  }

  // 7. Save screenshot if present
  const screenshotEntry = findEntry(entries, themeRoot, 'screenshot.png') || findEntry(entries, themeRoot, 'screenshot.jpg');
  if (screenshotEntry) {
    const ext = screenshotEntry.entryName.endsWith('.png') ? 'png' : 'jpg';
    await fs.writeFile(path.join(themePath, `screenshot.${ext}`), screenshotEntry.getData());
  }

  // 8. Copy theme assets (images, fonts in theme directory)
  const assetExtensions = ['.woff', '.woff2', '.ttf', '.eot', '.otf', '.svg', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico'];
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const ext = path.extname(entry.entryName).toLowerCase();
    if (assetExtensions.includes(ext)) {
      const relativePath = themeRoot ? entry.entryName.replace(themeRoot, '') : entry.entryName;
      // Filter out files we already handled
      if (['style.css', 'screenshot.png', 'screenshot.jpg'].includes(path.basename(relativePath))) continue;
      
      const destPath = path.join(themePath, 'assets', relativePath);
      await ensureDir(path.dirname(destPath));
      await fs.writeFile(destPath, entry.getData());
    }
  }

  // 9. Convert template-parts → components
  const partialEntries = entries.filter(e => {
    if (e.isDirectory) return false;
    const rel = themeRoot ? e.entryName.replace(themeRoot, '') : e.entryName;
    return (rel.startsWith('template-parts/') || rel.startsWith('partials/') || rel.startsWith('inc/templates/'))
      && e.entryName.endsWith('.php');
  });

  for (const entry of partialEntries) {
    const relativePath = themeRoot ? entry.entryName.replace(themeRoot, '') : entry.entryName;
    const partName = sanitizeName(path.basename(relativePath, '.php'));
    const phpSource = entry.getData().toString('utf-8');

    const detection = detectPluginUsage(phpSource);
    let njk;
    if (useLLM && detection.needsLLM) {
      info(dbName, 'WP_CONVERT_LLM', `Using LLM for partial: ${relativePath} (${detection.pluginHints.join(', ')})`);
      njk = await convertPhpWithLLM(phpSource, { filename: relativePath, templateType: 'component', pluginHints: detection.pluginHints });
    } else {
      njk = convertPhpToNunjucks(phpSource);
    }

    const compFilename = `components/${partName}.njk`;
    const compPath = path.join(themePath, compFilename);

    await ensureDir(path.dirname(compPath));
    await fs.writeFile(compPath, njk, 'utf-8');
    info(dbName, 'WP_CONVERT_PARTIAL', `Component: ${compFilename}`);
  }

  // 10. Convert sidebar.php → component
  const sidebarEntry = findEntry(entries, themeRoot, 'sidebar.php');
  if (sidebarEntry) {
    const sidebarPhp = sidebarEntry.getData().toString('utf-8');
    const sidebarNjk = convertPhpToNunjucks(sidebarPhp);
    await fs.writeFile(path.join(themePath, 'components/sidebar.njk'), sidebarNjk, 'utf-8');
  }

  // 11. Convert main content templates
  for (const [wpFile, mapping] of Object.entries(TEMPLATE_MAP)) {
    const entry = findEntry(entries, themeRoot, wpFile);
    if (!entry) continue;

    if (options.selectedFiles && !options.selectedFiles.includes(wpFile)) continue;

    const phpSource = entry.getData().toString('utf-8');
    const bodyPhp = extractBodyContent(phpSource);

    const detection = detectPluginUsage(bodyPhp);
    let bodyNjk;
    if (useLLM && detection.needsLLM) {
      info(dbName, 'WP_CONVERT_LLM', `Using LLM for template: ${wpFile} (${detection.pluginHints.join(', ')})`);
      bodyNjk = await convertPhpWithLLM(bodyPhp, { filename: wpFile, templateType: mapping.contentType, pluginHints: detection.pluginHints });
    } else {
      bodyNjk = convertPhpToNunjucks(bodyPhp);
    }

    let inlineStyles = '';
    const styleMatches = bodyNjk.match(/<style[^>]*>([\s\S]*?)<\/style>/gi);
    let cleanBody = bodyNjk;
    if (styleMatches) {
      inlineStyles = styleMatches.map(s => s.replace(/<\/?style[^>]*>/gi, '')).join('\n');
      cleanBody = bodyNjk.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    }

    const templateNjk = wrapAsChildTemplate(cleanBody, baseLayout, inlineStyles);
    const filename = `${mapping.dir}/${mapping.name}.njk`;
    const templatePath = path.join(themePath, filename);

    await ensureDir(path.dirname(templatePath));
    await fs.writeFile(templatePath, templateNjk, 'utf-8');

    const dbFilename = `themes/${themeSlug}/${filename}`;
    results.templates.push({
      source: wpFile,
      filename: dbFilename,
      contentType: mapping.contentType,
      name: `WP ${metadata.theme_name} - ${capitalize(mapping.name)}`
    });

    info(dbName, 'WP_CONVERT_TEMPLATE', `Template: ${wpFile} → ${dbFilename}`);
  }

  // 12. Handle any remaining top-level PHP templates
  const customTemplateRegex = /^page-(.+)\.php$/;
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const relativePath = themeRoot ? entry.entryName.replace(themeRoot, '') : entry.entryName;

    if (relativePath.includes('/')) continue;
    if (!relativePath.endsWith('.php')) continue;
    if (TEMPLATE_MAP[relativePath]) continue;
    if (['header.php', 'footer.php', 'sidebar.php', 'functions.php', 'comments.php', 'searchform.php'].includes(relativePath)) continue;

    const customMatch = relativePath.match(customTemplateRegex);
    if (customMatch) {
      const pageName = sanitizeName(customMatch[1]);
      const phpSource = entry.getData().toString('utf-8');
      const bodyPhp = extractBodyContent(phpSource);

      const detection = detectPluginUsage(bodyPhp);
      let bodyNjk;
      if (useLLM && detection.needsLLM) {
        info(dbName, 'WP_CONVERT_LLM', `Using LLM for custom template: ${relativePath} (${detection.pluginHints.join(', ')})`);
        bodyNjk = await convertPhpWithLLM(bodyPhp, { filename: relativePath, templateType: 'pages', pluginHints: detection.pluginHints });
      } else {
        bodyNjk = convertPhpToNunjucks(bodyPhp);
      }

      const templateNjk = wrapAsChildTemplate(bodyNjk, baseLayout);
      const filename = `pages/${pageName}.njk`;
      const templatePath = path.join(themePath, filename);

      await ensureDir(path.dirname(templatePath));
      await fs.writeFile(templatePath, templateNjk, 'utf-8');

      const dbFilename = `themes/${themeSlug}/${filename}`;
      results.templates.push({
        source: relativePath,
        filename: dbFilename,
        contentType: 'pages',
        name: `WP ${metadata.theme_name} - ${capitalize(pageName)}`
      });

      info(dbName, 'WP_CONVERT_CUSTOM', `Custom template: ${relativePath} → ${dbFilename}`);
    }
  }

  // 13. Register templates in DB (linking them to this theme folder)
  for (const tpl of results.templates) {
    const fullPath = path.join(THEMES_DIR, tpl.filename.replace('themes/', ''));
    let content = '';
    try { content = await fs.readFile(fullPath, 'utf-8'); } catch {}

    const { extractRegions } = await import('./templateParser.js');
    const regions = extractRegions(content);

    await prisma.templates.upsert({
      where: { filename: tpl.filename },
      create: {
        name: tpl.name,
        filename: tpl.filename,
        content_type: tpl.contentType,
        content,
        regions: regions.length > 0 ? regions : [{ name: 'main', type: 'richtext', label: 'Main Content' }],
        options: results.themeOptions
      },
      update: {
        name: tpl.name,
        content,
        regions: regions.length > 0 ? regions : [{ name: 'main', type: 'richtext', label: 'Main Content' }],
        options: results.themeOptions
      }
    });
  }

  // 14. Sync content types
  try {
    await syncTemplatesToDb(prisma, themeSlug);
  } catch (err) {
    results.warnings.push(`Content type sync warning: ${err.message}`);
  }

  info(dbName, 'WP_CONVERT_DONE', `Converted ${results.templates.length} templates from ${metadata.theme_name}`);
  return results;
}

/**
 * Helper to find a converted parent theme by its WP slug
 */
async function findConvertedParent(wpParentSlug) {
  try {
    const themes = await fs.readdir(THEMES_DIR);
    for (const theme of themes) {
      try {
        const configPath = path.join(THEMES_DIR, theme, 'theme.json');
        const raw = await fs.readFile(configPath, 'utf-8');
        const config = JSON.parse(raw);
        // Match by slug or some metadata if we added it
        if (theme === wpParentSlug || theme === sanitizeName(wpParentSlug)) {
          return theme;
        }
      } catch (e) {}
    }
  } catch (e) {}
  return null;
}

// ── HELPERS ──

function findThemeRoot(entries) {
  // WP themes are usually in a subfolder like theme-name/style.css
  for (const entry of entries) {
    if (entry.entryName.endsWith('style.css') && !entry.isDirectory) {
      const parts = entry.entryName.split('/');
      if (parts.length === 2) return parts[0] + '/';
      if (parts.length === 1) return '';
    }
  }
  // Fallback: look for any header.php
  for (const entry of entries) {
    if (entry.entryName.endsWith('header.php') && !entry.isDirectory) {
      const parts = entry.entryName.split('/');
      if (parts.length === 2) return parts[0] + '/';
    }
  }
  return '';
}

function findEntry(entries, root, filename) {
  const target = root + filename;
  return entries.find(e => e.entryName === target || e.entryName === filename);
}

function sanitizeName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'theme';
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}
