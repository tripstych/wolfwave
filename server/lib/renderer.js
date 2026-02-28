import { getNunjucksEnv, getThemeAssets } from '../services/themeResolver.js';
import fs from 'fs';
import path from 'path';
import { error as logError } from './logger.js';
import { canAccess } from '../middleware/permission.js';
import { resolveStyles } from './styleResolver.js';

function logRenderError(req, templateFilename, err) {
  logError(req, err, `RENDER:${templateFilename}`);
}

async function replaceAsync(str, regex, asyncFn) {
  const promises = [];
  str.replace(regex, (match, ...args) => {
    const promise = asyncFn(match, ...args);
    promises.push(promise);
  });
  const data = await Promise.all(promises);
  return str.replace(regex, () => data.shift());
}

export async function processShortcodes(html, env, blocksData, context = {}, depth = 0) {
  if (!html || depth > 5) return html;
  
  // Replace [[type:slug]] with rendered content (blocks or widgets)
  let result = await replaceAsync(html, /\[\[(widget|block):([a-zA-Z0-9_-]+)\]\]/g, async (match, type, slug) => {
    const contentType = type === 'block' ? 'blocks' : 'widgets';
    const item = blocksData.find(b => b.slug === slug && b.content_type === contentType);
    if (!item) return `<!-- ${type} not found: ${slug} -->`;

    // Permission Check
    const rules = typeof item.access_rules === 'string' ? JSON.parse(item.access_rules) : item.access_rules;
    if (!canAccess(rules, context)) return `<!-- Access denied: ${slug} -->`;

    try {
      const itemContent = typeof item.content === 'string' ? JSON.parse(item.content) : item.content;
      
      return new Promise((resolve) => {
        env.render(item.template_filename, {
          ...env.opts.site_locals, // global locals
          content: itemContent || {},
          [type]: item, // pass block or widget
          site: env.opts.site,
          blocks: blocksData // pass all blocks context for nested calls
        }, (err, rendered) => {
          if (err) {
            console.error(`Error rendering ${type} ${slug}:`, err);
            resolve(`<!-- Error rendering ${type} ${slug}: ${err.message} -->`);
          } else {
            resolve(rendered);
          }
        });
      });
    } catch (err) {
      console.error(`Error processing ${type} ${slug}:`, err);
      return `<!-- Error rendering ${type} ${slug}: ${err.message} -->`;
    }
  });

  // Recursion: Check if the rendered output contains more shortcodes
  if (result.includes('[[widget:') || result.includes('[[block:')) {
    return processShortcodes(result, env, blocksData, context, depth + 1);
  }

  return result;
}

export async function themeRender(req, res, templateFilename, context = {}) {
  const site = res.locals.site || {};
  const blocks = res.locals.blocks || [];
  const customer = res.locals.customer || null;
  const hasActiveSubscription = res.locals.hasActiveSubscription || false;

  const permissionContext = {
    isLoggedIn: !!customer,
    hasActiveSubscription,
    customer
  };
  
  const themeName = site.active_theme || 'default';
  const env = await getNunjucksEnv(themeName);
  const assets = getThemeAssets(themeName);

  // Store site and full context in env for access in globals and recursive shortcodes
  env.opts.site = site;
  env.opts.site_locals = res.locals;

  const parseJsonField = (value) => {
    if (value === null || value === undefined) return null;
    if (typeof value === 'object') return value;
    if (typeof value === 'string') {
      try { return JSON.parse(value); } catch { return null; }
    }
    return null;
  };

  const globalStyles = parseJsonField(site.global_styles) || {};
  const templateOverrides = parseJsonField(context.template?.options) || {};
  const mergedOptions = resolveStyles(globalStyles, templateOverrides);

  const fullContext = {
    ...res.locals, // site, menus, customer, blocks
    ...context,
    template: {
      ...context.template,
      options: mergedOptions
    },
    theme_css: assets.css,
    theme_js: assets.js,
    active_theme: themeName
  };

  // Inject user if admin/editor (for edit-in-place)
  if (req.user && ['admin', 'editor'].includes(req.user.role)) {
    fullContext.user = req.user;
  }

  // Use async render
  env.render(templateFilename, fullContext, async (err, html) => {
    if (err) {
      logRenderError(req, templateFilename, err);
      // If it's a 404/500 template error, we might recurse, so be careful.
      if (templateFilename !== 'pages/500.njk' && templateFilename !== 'pages/404.njk') {
        return renderError(req, res, 500, { error: err.message });
      } else {
        return res.status(500).send('Critical Server Error: ' + err.message);
      }
    }

    try {
      // Process shortcodes in the final output (now async)
      const finalHtml = await processShortcodes(html, env, blocks, permissionContext);
      res.send(finalHtml);
    } catch (shortcodeErr) {
      console.error('Error processing shortcodes:', shortcodeErr);
      res.send(html); // Send without shortcode processing if it fails
    }
  });
}

export function renderError(req, res, statusCode, context = {}) {
    const template = statusCode === 404 ? 'pages/404.njk' : 'pages/500.njk';
    res.status(statusCode);
    themeRender(req, res, template, {
        title: statusCode === 404 ? 'Page Not Found' : 'Server Error',
        page: { title: statusCode === 404 ? 'Page Not Found' : 'Error' },
        ...context
    });
}
