import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import nunjucks from 'nunjucks';
import moment from 'moment';
import { query } from '../db/connection.js';
import registerTemplateExtensions from './templateExtensions.js';
import prisma from '../lib/prisma.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const THEMES_DIR = path.join(__dirname, '../../themes');
const ROOT_TEMPLATES_DIR = path.join(__dirname, '../../templates');

// Custom DB Loader for Nunjucks
class DbLoader extends nunjucks.Loader {
  constructor(themeName) {
    super();
    this.async = true;
    this.themeName = themeName;
    this.cache = new Map(); // Simple in-memory cache
  }

  getSource(name, callback) {
    // Only handle 'default' theme for now
    if (this.themeName !== 'default') {
      return callback(null, null);
    }

    // Try cache first
    if (this.cache.has(name)) {
      return callback(null, this.cache.get(name));
    }

    // Normalized name might have leading slash or be relative to search path
    // Template parser usually gives relative paths like 'pages/home.liquid'
    prisma.templates.findUnique({
      where: { filename: name }
    }).then(template => {
      if (template && template.content) {
        const source = {
          src: template.content,
          path: name,
          noCache: false
        };
        this.cache.set(name, source);
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
    this.cache.clear();
  }
}

// Cache: theme slug -> parsed theme.json
const themeConfigCache = new Map();

// Cache: theme slug -> Nunjucks Environment
const envCache = new Map();

// Cache: theme slug -> DbLoader instance
const dbLoaderCache = new Map();

/**
 * Read and cache theme.json for a given theme slug.
 */
function getThemeConfig(themeName) {
  if (themeConfigCache.has(themeName)) {
    return themeConfigCache.get(themeName);
  }

  const configPath = path.join(THEMES_DIR, themeName, 'theme.json');
  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(raw);
    themeConfigCache.set(themeName, config);
    return config;
  } catch (e) {
    console.error(`[ThemeResolver] Failed to load theme config for "${themeName}": ${e.message}`);
    return null;
  }
}

/**
 * Compute ordered search paths for Nunjucks FileSystemLoader.
 * Walks the `inherits` chain so child themes override parent templates.
 *
 * Example: "starter-dark" inherits "default"
 *   → [ themes/starter-dark, themes/default ]
 */
export function getThemeSearchPaths(themeName) {
  const paths = [];
  const visited = new Set();
  let current = themeName;

  while (current && !visited.has(current)) {
    visited.add(current);
    const dir = path.join(THEMES_DIR, current);
    if (fs.existsSync(dir)) {
      paths.push(dir);
    }
    const config = getThemeConfig(current);
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
 * List all available themes by scanning the themes directory.
 */
export function getAvailableThemes() {
  try {
    const entries = fs.readdirSync(THEMES_DIR, { withFileTypes: true });
    const themes = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const config = getThemeConfig(entry.name);
        if (config) {
          themes.push({
            slug: config.slug || entry.name,
            name: config.name || entry.name,
            version: config.version || '1.0.0',
            description: config.description || '',
            inherits: config.inherits || null
          });
        }
      }
    }

    return themes;
  } catch {
    return [];
  }
}

/**
 * Get the CSS and JS asset URLs for a theme, resolving inheritance.
 * Returns URL paths like /themes/default/assets/css/theme.css
 */
export function getThemeAssets(themeName) {
  const css = [];
  const js = [];

  // Collect assets in reverse inheritance order (parent first, child last)
  // so child theme CSS overrides parent
  const chain = [];
  const visited = new Set();
  let current = themeName;

  while (current && !visited.has(current)) {
    visited.add(current);
    const config = getThemeConfig(current);
    if (config) {
      chain.unshift({ slug: current, config });
    }
    current = config?.inherits || null;
  }

  // Ensure default is in chain
  if (!visited.has('default')) {
    const defaultConfig = getThemeConfig('default');
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
    // Simple HTML escape to prevent XSS when using | safe
    const escaped = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
    // We return a string with <br> tags. The template uses | safe to render the <br>.
    // Since we escaped the rest, it is safe.
    return escaped.replace(/(?:\r\n|\r|\n)/g, '<br>');
  });

  // Register template extensions (product embeds, etc.)
  registerTemplateExtensions(env, query);
}

/**
 * Get or create a cached Nunjucks Environment for a given theme.
 * Environments are cached by theme slug — multiple tenants using
 * the same theme share the same environment.
 */
export function getNunjucksEnv(themeName) {
  // Validate theme exists, fall back to default
  const config = getThemeConfig(themeName);
  if (!config) {
    themeName = 'default';
  }

  if (envCache.has(themeName)) {
    return envCache.get(themeName);
  }

  const searchPaths = getThemeSearchPaths(themeName);
  
  // 1. Filesystem Loader
  const fsLoader = new nunjucks.FileSystemLoader(searchPaths, {
    watch: process.env.NODE_ENV === 'development',
    noCache: process.env.NODE_ENV === 'development'
  });

  // 2. DB Loader (Only for active theme or default)
  const dbLoader = new DbLoader(themeName);
  dbLoaderCache.set(themeName, dbLoader);

  // Combined loaders (DB takes precedence)
  const env = new nunjucks.Environment([dbLoader, fsLoader], { autoescape: true });

  applyNunjucksCustomizations(env);

  envCache.set(themeName, env);
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
