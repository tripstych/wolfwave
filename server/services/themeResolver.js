import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import nunjucks from 'nunjucks';
import moment from 'moment';
import { query } from '../db/connection.js';
import registerTemplateExtensions from './templateExtensions.js';
import prisma from '../lib/prisma.js';
import { canAccess } from '../middleware/permission.js';
import { getCurrentDbName } from '../lib/tenantContext.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const THEMES_DIR = path.join(__dirname, '../../themes');
const ROOT_TEMPLATES_DIR = path.join(__dirname, '../../templates');

const parseJsonField = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    if (value.trim() === '') return null;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return null;
};

// Custom DB Loader for Nunjucks
class DbLoader extends nunjucks.Loader {
  constructor(themeName) {
    super();
    this.async = true;
    this.themeName = themeName;
    this.tplCache = new Map();
  }

  getSource(name, callback) {
    if (this.tplCache.has(name)) {
      return callback(null, this.tplCache.get(name));
    }

    const searchNames = [name];
    if (this.themeName && !name.startsWith(this.themeName + '/')) {
      searchNames.push(`${this.themeName}/${name}`);
    }

    const variations = [];
    searchNames.forEach(n => {
      variations.push(n.replace(/\\/g, '/').replace(/^\//, ''));
      variations.push('/' + n.replace(/\\/g, '/').replace(/^\//, ''));
    });

    prisma.templates.findFirst({
      where: { filename: { in: [...new Set(variations)] } }
    }).then(template => {
      if (template && template.content) {
        const source = { src: template.content, path: name, noCache: false };
        this.tplCache.set(name, source);
        callback(null, source);
      } else {
        callback(null, null);
      }
    }).catch(err => {
      console.error('[DbLoader] Error fetching template:', err);
      callback(err);
    });
  }

  clearCache() {
    this.tplCache.clear();
  }
}

// Caches
const themeConfigCache = new Map();
const envCache = new Map();
const dbLoaderCache = new Map();

/**
 * Sync filesystem themes into the themes DB table.
 * Called at startup to ensure disk themes have DB records.
 */
export async function syncFilesystemThemes() {
  try {
    const entries = fs.readdirSync(THEMES_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const configPath = path.join(THEMES_DIR, entry.name, 'theme.json');
      let config;
      try {
        config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      } catch {
        continue; // Skip dirs without valid theme.json
      }

      const slug = config.slug || entry.name;
      await prisma.themes.upsert({
        where: { slug },
        update: {
          name: config.name || entry.name,
          description: config.description || '',
          version: config.version || '1.0.0',
          inherits: config.inherits || null,
          config: config,
          source: 'filesystem',
          updated_at: new Date()
        },
        create: {
          slug,
          name: config.name || entry.name,
          description: config.description || '',
          version: config.version || '1.0.0',
          inherits: config.inherits || null,
          config: config,
          source: 'filesystem',
          created_at: new Date(),
          updated_at: new Date()
        }
      });
    }

    // Mark the active theme
    const activeSetting = await prisma.settings.findUnique({ where: { setting_key: 'active_theme' } });
    if (activeSetting?.setting_value) {
      await prisma.themes.updateMany({ data: { is_active: false } });
      await prisma.themes.updateMany({
        where: { slug: activeSetting.setting_value },
        data: { is_active: true }
      });
    }
  } catch (err) {
    console.error('[ThemeResolver] Failed to sync filesystem themes:', err.message);
  }
}

/**
 * Get theme config from DB first, filesystem fallback.
 */
async function getThemeConfig(themeName) {
  if (themeConfigCache.has(themeName)) {
    return themeConfigCache.get(themeName);
  }

  // Try DB first
  try {
    const dbTheme = await prisma.themes.findUnique({ where: { slug: themeName } });
    if (dbTheme?.config) {
      const config = typeof dbTheme.config === 'string' ? JSON.parse(dbTheme.config) : dbTheme.config;
      themeConfigCache.set(themeName, config);
      return config;
    }
  } catch {
    // DB not ready yet or table doesn't exist — fall through to filesystem
  }

  // Fallback: read theme.json from disk
  const configPath = path.join(THEMES_DIR, themeName, 'theme.json');
  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(raw);
    themeConfigCache.set(themeName, config);
    return config;
  } catch {
    return null;
  }
}

/**
 * Compute ordered search paths for Nunjucks FileSystemLoader.
 */
export async function getThemeSearchPaths(themeName) {
  const paths = [];
  const visited = new Set();
  let current = themeName;

  while (current && !visited.has(current)) {
    visited.add(current);
    const dir = path.join(THEMES_DIR, current);
    if (fs.existsSync(dir)) {
      paths.push(dir);
    }
    const config = await getThemeConfig(current);
    current = config?.inherits || null;
  }

  // Always ensure default is in the chain
  const defaultDir = path.join(THEMES_DIR, 'default');
  if (!paths.includes(defaultDir) && fs.existsSync(defaultDir)) {
    paths.push(defaultDir);
  }

  // Add the root templates directory for widgets and system templates
  if (fs.existsSync(ROOT_TEMPLATES_DIR)) {
    paths.push(ROOT_TEMPLATES_DIR);
  }

  return paths;
}

/**
 * List all available themes from the database.
 */
export async function getAvailableThemes() {
  try {
    const themes = await prisma.themes.findMany({ orderBy: { name: 'asc' } });
    return themes.map(t => ({
      slug: t.slug,
      name: t.name,
      version: t.version || '1.0.0',
      description: t.description || '',
      inherits: t.inherits || null,
      source: t.source,
      is_active: t.is_active
    }));
  } catch {
    // Fallback to filesystem if themes table doesn't exist yet
    try {
      const entries = fs.readdirSync(THEMES_DIR, { withFileTypes: true });
      const themes = [];
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const configPath = path.join(THEMES_DIR, entry.name, 'theme.json');
        try {
          const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
          themes.push({
            slug: config.slug || entry.name,
            name: config.name || entry.name,
            version: config.version || '1.0.0',
            description: config.description || '',
            inherits: config.inherits || null,
            source: 'filesystem'
          });
        } catch { continue; }
      }
      return themes;
    } catch { return []; }
  }
}

/**
 * Get the CSS and JS asset URLs for a theme, resolving inheritance.
 */
export async function getThemeAssets(themeName) {
  const css = [];
  const js = [];

  const chain = [];
  const visited = new Set();
  let current = themeName;

  while (current && !visited.has(current)) {
    visited.add(current);
    const config = await getThemeConfig(current);
    if (config) {
      chain.unshift({ slug: current, config });
      current = config.inherits || null;
    } else {
      current = null;
    }
  }

  // Ensure default is in chain
  if (!visited.has('default')) {
    const defaultConfig = await getThemeConfig('default');
    if (defaultConfig) {
      chain.unshift({ slug: 'default', config: defaultConfig });
    }
  }

  for (const { slug, config } of chain) {
    if (config.assets?.css) {
      for (const file of config.assets.css) {
        css.push(`/themes/${slug}/${file}`);
      }
    }
    if (config.assets?.js) {
      for (const file of config.assets.js) {
        js.push(`/themes/${slug}/${file}`);
      }
    }
  }

  return { css, js };
}

/**
 * Apply custom Nunjucks filters and extensions to an environment.
 */
export function applyNunjucksCustomizations(env) {
  env.addFilter('truncate', (str, length) => {
    if (!str) return '';
    if (str.length <= length) return str;
    return str.substring(0, length) + '...';
  });

  env.addFilter('stripHtml', (str) => {
    if (!str) return '';
    return str.replace(/<[^>]*>/g, '');
  });

  env.addFilter('json', (str) => {
    if (!str) return {};
    if (typeof str === 'object') return str;
    try {
      return JSON.parse(str);
    } catch (e) {
      return {};
    }
  });

  env.addFilter('date', (date, format = 'YYYY-MM-DD') => {
    if (!date) return '';
    const m = moment(date);
    if (!m.isValid()) return '';
    return m.format(format);
  });

  env.addFilter('newline_to_br', (str) => {
    if (!str && str !== 0) return '';
    const text = str.toString();
    const escaped = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
    return escaped.replace(/(?:\r\n|\r|\n)/g, '<br>');
  });

  registerTemplateExtensions(env, query);

  env.addGlobal('renderBlock', function(slug) {
    return `[[block:${slug}]]`;
  });

  env.addGlobal('renderWidget', function(slug) {
    return `[[widget:${slug}]]`;
  });
}

/**
 * Get or create a cached Nunjucks Environment for a given theme.
 */
export async function getNunjucksEnv(themeName) {
  const dbName = getCurrentDbName();

  // Validate theme exists in DB
  try {
    const themeRecord = await prisma.themes.findUnique({ where: { slug: themeName } });
    if (!themeRecord && themeName !== 'default') {
      console.warn(`[ThemeResolver] Theme "${themeName}" not found in DB, falling back to "default"`);
      themeName = 'default';
    }
  } catch {
    // DB not ready — fall back to default
    if (themeName !== 'default') themeName = 'default';
  }

  const cacheKey = `${themeName}:${dbName}`;

  if (envCache.has(cacheKey)) {
    return envCache.get(cacheKey);
  }

  const searchPaths = await getThemeSearchPaths(themeName);

  const fsLoader = new nunjucks.FileSystemLoader(searchPaths, {
    watch: process.env.NODE_ENV === 'development',
    noCache: process.env.NODE_ENV === 'development'
  });

  const dbLoader = new DbLoader(themeName);
  dbLoaderCache.set(cacheKey, dbLoader);

  const env = new nunjucks.Environment([dbLoader, fsLoader], { autoescape: true });

  applyNunjucksCustomizations(env);

  envCache.set(cacheKey, env);
  return env;
}

/**
 * Clear cached environments (call when theme settings change).
 */
export function clearThemeCache() {
  themeConfigCache.clear();
  envCache.clear();
  dbLoaderCache.forEach(loader => loader.clearCache());
  dbLoaderCache.clear();
}

/**
 * Get the themes directory path.
 */
export function getThemesDir() {
  return THEMES_DIR;
}
