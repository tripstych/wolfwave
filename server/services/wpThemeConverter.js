/**
 * WordPress Theme ZIP Converter
 *
 * Accepts a WP theme ZIP, extracts it, converts PHP templates to Nunjucks,
 * writes them to the templates/ directory, and registers them in the DB.
 */

import AdmZip from 'adm-zip';
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
  extractThemeStyles
} from '../lib/phpToNunjucks.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(__dirname, '../../templates');
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
  const isChildTheme = !!metadata.template;

  return {
    metadata,
    isChildTheme,
    parentTheme: metadata.template || null,
    hasScreenshot,
    detectedFiles,
    templateCount: detectedFiles.filter(f => f.hasMapping).length,
    partialCount: detectedFiles.filter(f => f.isTemplatePart).length,
    layoutCount: detectedFiles.filter(f => f.isLayout).length,
    themeStyles: themeStyles ? {
      primaryColor: themeStyles.colors.primary || null,
      secondaryColor: themeStyles.colors.secondary || null,
      fonts: themeStyles.fonts.slice(0, 3)
    } : null
  };
}

/**
 * Convert a WP theme ZIP and install it.
 * Returns the list of generated templates.
 */
export async function convertWpTheme(zipBuffer, options = {}) {
  const dbName = getCurrentDbName();
  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries();
  const themeRoot = findThemeRoot(entries);

  // 1. Read metadata
  const styleCssEntry = findEntry(entries, themeRoot, 'style.css');
  const metadata = styleCssEntry
    ? parseThemeMetadata(styleCssEntry.getData().toString('utf-8'))
    : { theme_name: 'Imported Theme' };

  const themeName = sanitizeName(metadata.theme_name || 'imported');
  info(dbName, 'WP_CONVERT_START', `Converting WP theme: ${metadata.theme_name}`);

  const results = {
    themeName: metadata.theme_name,
    slug: themeName,
    templates: [],
    warnings: [],
    themeOptions: {}
  };

  // 2. Extract theme styles / colors
  if (styleCssEntry) {
    const styles = extractThemeStyles(styleCssEntry.getData().toString('utf-8'));
    if (styles.colors.primary) results.themeOptions.primary_color = styles.colors.primary;
    if (styles.colors.secondary) results.themeOptions.secondary_color = styles.colors.secondary;
    if (styles.fonts[0]) results.themeOptions.google_font_body = styles.fonts[0];
    if (styles.fonts[1]) results.themeOptions.google_font_heading = styles.fonts[1];
  }

  // 3. Build base layout from header.php + footer.php
  const headerEntry = findEntry(entries, themeRoot, 'header.php');
  const footerEntry = findEntry(entries, themeRoot, 'footer.php');

  const headerPhp = headerEntry ? headerEntry.getData().toString('utf-8') : '';
  const footerPhp = footerEntry ? footerEntry.getData().toString('utf-8') : '';

  const layoutFilename = `layouts/wp-${themeName}.njk`;
  const layoutPath = path.join(TEMPLATES_DIR, layoutFilename);

  if (headerPhp || footerPhp) {
    const layoutNjk = buildBaseLayout(headerPhp, footerPhp, themeName);
    await ensureDir(path.dirname(layoutPath));
    await fs.writeFile(layoutPath, layoutNjk, 'utf-8');
    info(dbName, 'WP_CONVERT_LAYOUT', `Generated base layout: ${layoutFilename}`);
  } else {
    // No header/footer — use the default base layout
    results.warnings.push('No header.php/footer.php found — templates will use the default base layout');
  }

  const baseLayout = (headerPhp || footerPhp) ? layoutFilename : 'layouts/base.njk';

  // 4. Extract and save CSS
  let extractedCss = '';
  if (styleCssEntry) {
    const rawCss = styleCssEntry.getData().toString('utf-8');
    // Strip the header comment
    extractedCss = rawCss.replace(/\/\*[\s\S]*?\*\//, '').trim();

    if (extractedCss.length > 0) {
      const cssDir = path.join(UPLOADS_DIR, 'theme-assets', themeName);
      await ensureDir(cssDir);
      await fs.writeFile(path.join(cssDir, 'style.css'), extractedCss, 'utf-8');
    }
  }

  // 5. Save screenshot if present
  const screenshotEntry = findEntry(entries, themeRoot, 'screenshot.png') || findEntry(entries, themeRoot, 'screenshot.jpg');
  if (screenshotEntry) {
    const ext = screenshotEntry.entryName.endsWith('.png') ? 'png' : 'jpg';
    const screenshotDir = path.join(UPLOADS_DIR, 'theme-assets', themeName);
    await ensureDir(screenshotDir);
    await fs.writeFile(path.join(screenshotDir, `screenshot.${ext}`), screenshotEntry.getData());
  }

  // 6. Copy theme assets (images, fonts in theme directory)
  const assetExtensions = ['.woff', '.woff2', '.ttf', '.eot', '.otf', '.svg', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico'];
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const ext = path.extname(entry.entryName).toLowerCase();
    if (assetExtensions.includes(ext)) {
      const relativePath = themeRoot ? entry.entryName.replace(themeRoot, '') : entry.entryName;
      const destPath = path.join(UPLOADS_DIR, 'theme-assets', themeName, relativePath);
      await ensureDir(path.dirname(destPath));
      await fs.writeFile(destPath, entry.getData());
    }
  }

  // 7. Convert template-parts → components
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

    const njk = convertPhpToNunjucks(phpSource);
    const compFilename = `components/wp-${themeName}-${partName}.njk`;
    const compPath = path.join(TEMPLATES_DIR, compFilename);

    await ensureDir(path.dirname(compPath));
    await fs.writeFile(compPath, njk, 'utf-8');
    info(dbName, 'WP_CONVERT_PARTIAL', `Component: ${compFilename}`);
  }

  // 8. Convert sidebar.php → component
  const sidebarEntry = findEntry(entries, themeRoot, 'sidebar.php');
  if (sidebarEntry) {
    const sidebarPhp = sidebarEntry.getData().toString('utf-8');
    const sidebarNjk = convertPhpToNunjucks(sidebarPhp);
    const sidebarFilename = `components/wp-${themeName}-sidebar.njk`;
    await ensureDir(path.join(TEMPLATES_DIR, 'components'));
    await fs.writeFile(path.join(TEMPLATES_DIR, sidebarFilename), sidebarNjk, 'utf-8');
  }

  // 9. Convert main content templates
  for (const [wpFile, mapping] of Object.entries(TEMPLATE_MAP)) {
    const entry = findEntry(entries, themeRoot, wpFile);
    if (!entry) continue;

    // Skip if user deselected this template
    if (options.selectedFiles && !options.selectedFiles.includes(wpFile)) continue;

    const phpSource = entry.getData().toString('utf-8');
    const bodyPhp = extractBodyContent(phpSource);
    const bodyNjk = convertPhpToNunjucks(bodyPhp);

    // Extract any inline <style> blocks for the styles block
    let inlineStyles = '';
    const styleMatches = bodyNjk.match(/<style[^>]*>([\s\S]*?)<\/style>/gi);
    let cleanBody = bodyNjk;
    if (styleMatches) {
      inlineStyles = styleMatches.map(s => s.replace(/<\/?style[^>]*>/gi, '')).join('\n');
      cleanBody = bodyNjk.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    }

    const templateNjk = wrapAsChildTemplate(cleanBody, baseLayout, inlineStyles);
    const filename = `${mapping.dir}/wp-${themeName}-${mapping.name}.njk`;
    const templatePath = path.join(TEMPLATES_DIR, filename);

    await ensureDir(path.dirname(templatePath));
    await fs.writeFile(templatePath, templateNjk, 'utf-8');

    results.templates.push({
      source: wpFile,
      filename,
      contentType: mapping.contentType,
      name: `WP ${metadata.theme_name} - ${capitalize(mapping.name)}`
    });

    info(dbName, 'WP_CONVERT_TEMPLATE', `Template: ${wpFile} → ${filename}`);
  }

  // 10. Handle any remaining top-level PHP templates not in TEMPLATE_MAP
  // (custom page templates like page-about.php, page-contact.php, etc.)
  const customTemplateRegex = /^page-(.+)\.php$/;
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const relativePath = themeRoot ? entry.entryName.replace(themeRoot, '') : entry.entryName;

    // Only top-level PHP files
    if (relativePath.includes('/')) continue;
    if (!relativePath.endsWith('.php')) continue;
    if (TEMPLATE_MAP[relativePath]) continue;
    if (['header.php', 'footer.php', 'sidebar.php', 'functions.php', 'comments.php', 'searchform.php'].includes(relativePath)) continue;

    const customMatch = relativePath.match(customTemplateRegex);
    if (customMatch) {
      const pageName = sanitizeName(customMatch[1]);
      const phpSource = entry.getData().toString('utf-8');
      const bodyPhp = extractBodyContent(phpSource);
      const bodyNjk = convertPhpToNunjucks(bodyPhp);
      const templateNjk = wrapAsChildTemplate(bodyNjk, baseLayout);

      const filename = `pages/wp-${themeName}-${pageName}.njk`;
      const templatePath = path.join(TEMPLATES_DIR, filename);

      await ensureDir(path.dirname(templatePath));
      await fs.writeFile(templatePath, templateNjk, 'utf-8');

      results.templates.push({
        source: relativePath,
        filename,
        contentType: 'pages',
        name: `WP ${metadata.theme_name} - ${capitalize(pageName)}`
      });

      info(dbName, 'WP_CONVERT_CUSTOM', `Custom template: ${relativePath} → ${filename}`);
    }
  }

  // 11. Register templates in DB
  for (const tpl of results.templates) {
    const fullPath = path.join(TEMPLATES_DIR, tpl.filename);
    let content = '';
    try { content = await fs.readFile(fullPath, 'utf-8'); } catch {}

    // Parse regions from the generated template
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

  // 12. Sync content types
  try {
    await syncTemplatesToDb(prisma);
  } catch (err) {
    results.warnings.push(`Content type sync warning: ${err.message}`);
  }

  info(dbName, 'WP_CONVERT_DONE', `Converted ${results.templates.length} templates from ${metadata.theme_name}`);
  return results;
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
