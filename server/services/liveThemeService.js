import axios from 'axios';
import * as cheerio from 'cheerio';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { getCurrentDbName } from '../lib/tenantContext.js';
import { info, error as logError } from '../lib/logger.js';
import { generateRawText } from './aiService.js';
import { syncTemplatesToDb } from './templateParser.js';
import prisma from '../lib/prisma.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const THEMES_DIR = path.join(__dirname, '../../themes');

/**
 * Imports a theme from a live site by crawling its assets and using AI to structure templates.
 */
export async function importLiveTheme(url, options = {}) {
  const dbName = getCurrentDbName();
  const themeName = options.name || 'Imported Live Site';
  const themeSlug = themeName.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 50);
  const themePath = path.join(THEMES_DIR, themeSlug);

  try {
    info(dbName, 'LIVE_THEME_START', `Importing live theme from ${url} into themes/${themeSlug}`);

    // 1. Fetch Page
    const { data: html } = await axios.get(url, {
      headers: { 'User-Agent': 'WebWolf-LiveImporter/1.0' },
      timeout: 15000
    });
    const $ = cheerio.load(html);
    const origin = new URL(url).origin;

    // 2. Setup Directory Structure
    await fs.mkdir(themePath, { recursive: true });
    await fs.mkdir(path.join(themePath, 'layouts'), { recursive: true });
    await fs.mkdir(path.join(themePath, 'pages'), { recursive: true });
    await fs.mkdir(path.join(themePath, 'assets'), { recursive: true });

    const assets = { css: [], js: [] };

    // 3. Extract and Localize CSS
    const styleLinks = $('link[rel="stylesheet"]');
    for (let i = 0; i < styleLinks.length; i++) {
      const href = $(styleLinks[i]).attr('href');
      if (!href) continue;
      try {
        const assetUrl = new URL(href, url).toString();
        const urlPath = new URL(assetUrl).pathname;
        const filename = `${path.basename(urlPath) || `style-${i}`}`;
        const localPath = path.join(themePath, 'assets', filename);
        
        const { data: cssContent } = await axios.get(assetUrl, { timeout: 10000, responseType: 'text' });
        await fs.writeFile(localPath, cssContent);
        
        assets.css.push(`assets/${filename}`);
        $(styleLinks[i]).remove(); 
      } catch (e) {
        console.warn(`Failed to localize CSS: ${href}`, e.message);
      }
    }

    // 4. Extract and Localize Inline Styles
    const inlineStyles = $('style');
    let mergedInlineCss = '';
    inlineStyles.each((i, el) => {
      mergedInlineCss += $(el).html() + '
';
      $(el).remove();
    });
    if (mergedInlineCss) {
      await fs.writeFile(path.join(themePath, 'assets', 'inline-styles.css'), mergedInlineCss);
      assets.css.push('assets/inline-styles.css');
    }

    // 5. Extract and Localize JS
    const scriptTags = $('script[src]');
    for (let i = 0; i < scriptTags.length; i++) {
      const src = $(scriptTags[i]).attr('src');
      if (!src) continue;
      
      // Skip heavy tracking scripts
      if (src.includes('google-analytics') || src.includes('facebook') || src.includes('hotjar') || src.includes('pixel')) continue;

      try {
        const assetUrl = new URL(src, url).toString();
        const urlPath = new URL(assetUrl).pathname;
        const filename = `${path.basename(urlPath) || `script-${i}`}`;
        const localPath = path.join(themePath, 'assets', filename);
        
        const { data: jsContent } = await axios.get(assetUrl, { timeout: 10000, responseType: 'text' });
        await fs.writeFile(localPath, jsContent);
        
        assets.js.push(`assets/${filename}`);
        $(scriptTags[i]).remove();
      } catch (e) {
        console.warn(`Failed to localize JS: ${src}`, e.message);
      }
    }

    // 6. Fix internal image URLs in the remaining HTML
    $('img[src]').each((i, el) => {
      const src = $(el).attr('src');
      if (src && !src.startsWith('http') && !src.startsWith('data:')) {
        $(el).attr('src', new URL(src, url).toString());
      }
    });

    // 7. LLM: Analyze and Generate Layout
    const layoutInputHtml = $.html()
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .substring(0, 30000);

    const layoutPrompt = `You are a theme architect. Analyze this live site HTML and extract the layout (header and footer).
Return a WolfWave Nunjucks layout file (layouts/main.njk).

RULES:
- Wrap the main content area with '{% block content %}{% endblock %}'.
- Ensure all internal links point to origin '${origin}'.
- Include '{% block styles %}{% endblock %}' inside <head>.
- Include '{% block scripts %}{% endblock %}' at the end of <body>.
- Include standard WolfWave variables like {{ seo.title }}, {{ seo.description }}.
- Include CSS/JS blocks for theme assets:
  {% for style in theme_css %}<link rel="stylesheet" href="{{ style }}">{% endfor %}
  {% for script in theme_js %}<script src="{{ script }}"></script>{% endfor %}
- Return ONLY the Nunjucks code. No markdown fences.`;

    const layoutNjk = await generateRawText(layoutPrompt, layoutInputHtml);
    await fs.writeFile(path.join(themePath, 'layouts/main.njk'), layoutNjk.replace(/^```[a-z]*
/i, '').replace(/
```$/i, ''));

    // 8. LLM: Generate Homepage Template
    const templatePrompt = `Generate a homepage template (pages/home.njk) based on this HTML.
Use '{% extends "layouts/main.njk" %}' and wrap content in '{% block content %}'.
Identify logical sections and use 'data-cms-region' attributes for editable areas (e.g. hero_title, features, etc.).
Return ONLY Nunjucks code. No markdown fences.`;

    const homeNjk = await generateRawText(templatePrompt, layoutInputHtml);
    await fs.writeFile(path.join(themePath, 'pages/home.njk'), homeNjk.replace(/^```[a-z]*
/i, '').replace(/
```$/i, ''));

    // 9. Create theme.json
    const themeJson = {
      name: themeName,
      slug: themeSlug,
      description: `Imported from live site: ${url}`,
      version: "1.0.0",
      assets: assets
    };
    await fs.writeFile(path.join(themePath, 'theme.json'), JSON.stringify(themeJson, null, 2));

    // 10. Sync to DB
    await syncTemplatesToDb(prisma, themeSlug);

    info(dbName, 'LIVE_THEME_DONE', `Successfully imported live theme: ${themeSlug}`);
    return { success: true, theme: themeJson };

  } catch (err) {
    logError(dbName, err, 'LIVE_THEME_IMPORT_FAILED');
    throw err;
  }
}
