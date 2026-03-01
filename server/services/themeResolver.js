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
const ROOT_TEMPLATES_DIR = path.join(__dirname, '../../templates');

const DEFAULT_THEME_CONFIG = {
  name: 'Default',
  slug: 'default',
  version: '1.0.0',
  description: 'The default WolfWave theme',
  inherits: null,
  assets: {
    css: ['css/variables.css', 'css/theme.css'],
    js: []
  }
};

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
 * Ensure the default theme exists in the DB.
 * Called at startup so every site always has a default theme record.
 */
export async function ensureDefaultTheme() {
  try {
    await prisma.themes.upsert({
      where: { slug: 'default' },
      update: {
        name: DEFAULT_THEME_CONFIG.name,
        description: DEFAULT_THEME_CONFIG.description,
        version: DEFAULT_THEME_CONFIG.version,
        inherits: DEFAULT_THEME_CONFIG.inherits,
        config: DEFAULT_THEME_CONFIG,
        updated_at: new Date()
      },
      create: {
        slug: 'default',
        name: DEFAULT_THEME_CONFIG.name,
        description: DEFAULT_THEME_CONFIG.description,
        version: DEFAULT_THEME_CONFIG.version,
        inherits: DEFAULT_THEME_CONFIG.inherits,
        config: DEFAULT_THEME_CONFIG,
        source: 'system',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      }
    });

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
    console.error('[ThemeResolver] Failed to ensure default theme:', err.message);
  }
}

/**
 * Get theme config from DB.
 */
async function getThemeConfig(themeName) {
  if (themeConfigCache.has(themeName)) {
    return themeConfigCache.get(themeName);
  }

  // Hardcoded default — no DB or filesystem lookup needed
  if (themeName === 'default') {
    try {
      const dbTheme = await prisma.themes.findUnique({ where: { slug: 'default' } });
      if (dbTheme?.config) {
        const config = typeof dbTheme.config === 'string' ? JSON.parse(dbTheme.config) : dbTheme.config;
        themeConfigCache.set(themeName, config);
        return config;
      }
    } catch { /* fall through */ }
    // DB not available yet — use hardcoded default
    themeConfigCache.set(themeName, DEFAULT_THEME_CONFIG);
    return DEFAULT_THEME_CONFIG;
  }

  try {
    const dbTheme = await prisma.themes.findUnique({ where: { slug: themeName } });
    if (dbTheme) {
      const config = dbTheme.config ? (typeof dbTheme.config === 'string' ? JSON.parse(dbTheme.config) : dbTheme.config) : null;
      themeConfigCache.set(themeName, config);
      return config;
    }
  } catch (e) {
    console.warn(`[ThemeResolver] DB lookup for theme "${themeName}" failed: ${e.message}`);
  }

  return null;
}

/**
 * Compute ordered search paths for Nunjucks FileSystemLoader.
 * Only ROOT_TEMPLATES_DIR is used as a filesystem fallback — DB is primary.
 */
export async function getThemeSearchPaths(themeName) {
  const paths = [];

  // Root templates directory is the only filesystem fallback
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
    return [];
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
