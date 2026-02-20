import { getNunjucksEnv, getThemeAssets } from '../services/themeResolver.js';
import fs from 'fs';
import path from 'path';
import { error as logError } from './logger.js';

function logRenderError(req, templateFilename, err) {
  logError(req, err, `RENDER:${templateFilename}`);
}

export function setupRenderBlock(env, blocksData) {
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

  env.addGlobal('renderBlock', (slug) => {
    const block = blocksData.find(b => b.slug === slug && b.content_type === 'blocks');
    if (!block) {
      console.warn(`Block not found: ${slug}`);
      return '';
    }

    try {
      const blockContent = parseJsonField(block.content) || {};
      const html = env.render(block.template_filename, {
        content: blockContent,
        block,
        site: env.opts.site // pass site settings
      });
      return html;
    } catch (err) {
      console.error(`Error rendering block ${slug}:`, err);
      return '';
    }
  });

  env.addGlobal('renderWidget', (slug) => {
    const widget = blocksData.find(b => b.slug === slug && b.content_type === 'widgets');
    if (!widget) {
      console.warn(`Widget not found: ${slug}`);
      return `<!-- Widget not found: ${slug} -->`;
    }

    try {
      const widgetContent = parseJsonField(widget.content) || {};
      const html = env.render(widget.template_filename, {
        content: widgetContent,
        widget,
        site: env.opts.site,
        blocks: blocksData
      });
      return html;
    } catch (err) {
      console.error(`Error rendering widget ${slug}:`, err);
      return `<!-- Error rendering widget ${slug}: ${err.message} -->`;
    }
  });
}

export function processShortcodes(html, env, blocksData) {
  if (!html) return html;
  
  // Replace [[widget:slug]] with rendered widget
  return html.replace(/\[\[widget:([a-zA-Z0-9_-]+)\]\]/g, (match, slug) => {
    const widget = blocksData.find(b => b.slug === slug && b.content_type === 'widgets');
    if (!widget) return `<!-- Widget not found: ${slug} -->`;

    try {
      const widgetContent = typeof widget.content === 'string' ? JSON.parse(widget.content) : widget.content;
      return env.render(widget.template_filename, {
        content: widgetContent || {},
        widget,
        site: env.opts.site,
        blocks: blocksData // pass all blocks context
      });
    } catch (err) {
      console.error(`Error rendering shortcode widget ${slug}:`, err);
      return `<!-- Error rendering widget ${slug}: ${err.message} -->`;
    }
  });
}

export function themeRender(req, res, templateFilename, context = {}) {
  const site = res.locals.site || {};
  const blocks = res.locals.blocks || [];
  
  const themeName = site.active_theme || 'default';
  const env = getNunjucksEnv(themeName);
  const assets = getThemeAssets(themeName);

  // Store site in env for access in globals
  env.opts.site = site;

  setupRenderBlock(env, blocks);

  const fullContext = {
    ...res.locals, // site, menus, customer, blocks
    ...context,
    theme_css: assets.css,
    theme_js: assets.js
  };

  // Inject user if admin/editor (for edit-in-place)
  if (req.user && ['admin', 'editor'].includes(req.user.role)) {
    fullContext.user = req.user;
  }

  try {
    let html = env.render(templateFilename, fullContext);
    
    // Process shortcodes in the final output
    html = processShortcodes(html, env, blocks);
    
    res.send(html);
  } catch (err) {
    logRenderError(req, templateFilename, err);
    // If it's a 404/500 template error, we might recurse, so be careful.
    if (templateFilename !== 'pages/500.njk' && templateFilename !== 'pages/404.njk') {
        renderError(req, res, 500, { error: err.message });
    } else {
        res.status(500).send('Critical Server Error: ' + err.message);
    }
  }
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
