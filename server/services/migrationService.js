import * as cheerio from 'cheerio';
import prisma from '../lib/prisma.js';
import { generateUniqueSlug } from '../lib/slugify.js';
import { getCurrentDbName } from '../lib/tenantContext.js';
import { info, error as logError } from '../lib/logger.js';
import { generateSearchIndex } from '../lib/searchIndexer.js';
import { automaticallyDetectContent } from './scraperService.js';
import { processHtmlImages } from './mediaService.js';
import { updateContent } from './contentService.js';
import { structuredScrape } from './aiService.js';

export async function migratePage(importedPageId, templateId, selectorMap = { 'main': 'body' }, useAI = false) {
  const dbName = getCurrentDbName();
  try {
    const importedPage = await prisma.imported_pages.findUnique({ where: { id: importedPageId } });
    if (!importedPage || !importedPage.raw_html) throw new Error('Invalid page');

    let extractedData = {};

    if (useAI) {
      info(dbName, 'PAGE_MIGRATE_AI', `Using AI Smart Mapping for page ${importedPageId}`);
      const template = await prisma.templates.findUnique({ where: { id: templateId } });
      const fields = template?.regions || [{ name: 'main', label: 'Main Content', type: 'richtext' }];
      
      try {
        extractedData = await structuredScrape(fields, importedPage.raw_html);
      } catch (aiErr) {
        console.warn(`[MigrationService] AI Smart Mapping failed, falling back to selector map:`, aiErr.message);
        useAI = false; // Trigger fallback
      }
    }

    if (!useAI) {
      const $ = cheerio.load(importedPage.raw_html);
      for (const [key, selector] of Object.entries(selectorMap)) {
        // If the user hasn't specified a specific class (defaulting to body or main), use auto-detect
        if (key === 'main' && (selector === 'body' || selector === 'main' || !selector)) {
          extractedData[key] = automaticallyDetectContent($);
        } else {
          const $el = $(selector);
          if ($el.length > 0) {
            const tagName = $el.get(0).tagName.toLowerCase();
            if (tagName === 'img') {
              extractedData[key] = $el.attr('src') || $el.attr('data-src') || $el.attr('srcset');
            } else {
              extractedData[key] = $el.html().trim();
            }
          }
        }
      }
    }

    // Fallback if still empty
    if (!extractedData.main && !extractedData.main_content) {
      const $ = cheerio.load(importedPage.raw_html);
      extractedData.main = automaticallyDetectContent($) || $('body').html();
    }

    // ── LOCALISE IMAGES ──
    for (const key in extractedData) {
      if (extractedData[key] && typeof extractedData[key] === 'string') {
        try {
          extractedData[key] = await processHtmlImages(extractedData[key]);
        } catch (imgErr) {
          console.error(`[WebWolf:migrationService] Image localization failed for field ${key}:`, imgErr.message);
        }
      }
    }

    const title = (importedPage.title || $('title').text() || '').trim() || 
                  (() => { try { return new URL(importedPage.url).pathname; } catch { return 'Imported Page'; } })();

    // Check if a page with THIS EXACT TITLE already exists to avoid duplication
    // We only merge if the content is significantly longer/better
    const existingContent = await prisma.content.findFirst({
      where: { module: 'pages', title: title }
    });

    if (existingContent) {
      const existingData = JSON.parse(existingContent.data || '{}');
      const existingLen = (existingData.main || '').length;
      const newLen = (extractedData.main || '').length;

      // Only overwrite if the new content seems significantly better/longer
      if (newLen > existingLen) {
        await updateContent(existingContent.id, {
          data: extractedData,
          search_index: generateSearchIndex(title, extractedData)
        });
        info(dbName, 'PAGE_MERGE_UPDATE', `Updated existing page "${title}" with better content (${newLen} chars vs ${existingLen})`);
      } else {
        info(dbName, 'PAGE_MERGE_SKIP', `Preserved existing page "${title}" (existing content was better)`);
      }
      
      // Mark as migrated regardless so it stops showing up in the importer
      await prisma.imported_pages.update({ where: { id: importedPageId }, data: { status: 'migrated' } });
      
      return await prisma.pages.findFirst({ where: { content_id: existingContent.id } });
    }

    const pageSlug = await generateUniqueSlug(title, 'pages');

    const content = await prisma.content.create({
      data: {
        module: 'pages',
        title: title,
        slug: pageSlug,
        data: JSON.stringify(extractedData),
        search_index: generateSearchIndex(title, extractedData),
        source_url: importedPage.url
      }
    });

    const page = await prisma.pages.create({
      data: { template_id: templateId, content_id: content.id, title: title, status: 'draft' }
    });

    await prisma.imported_pages.update({ where: { id: importedPageId }, data: { status: 'migrated' } });
    return page;
  } catch (err) {
    logError(dbName, err, 'PAGE_MIGRATION_FAILED');
    throw err;
  }
}

export async function bulkMigrate(siteId, structuralHash, templateId, selectorMap, useAI = false) {
  const pages = await prisma.imported_pages.findMany({
    where: { site_id: siteId, structural_hash: structuralHash, status: 'completed' }
  });
  const results = [];
  for (const page of pages) {
    try {
      const migrated = await migratePage(page.id, templateId, selectorMap, useAI);
      results.push({ id: page.id, success: true, pageId: migrated.id });
    } catch (err) {
      results.push({ id: page.id, success: false, error: err.message });
    }
  }
  return results;
}

export async function bulkMigrateAll(siteId, templateId, selectorMap, pageIds = null, useAI = false) {
  const whereClause = { site_id: siteId };
  if (pageIds && Array.isArray(pageIds)) {
    // Ensure all IDs are integers for Prisma
    const intIds = pageIds.map(id => parseInt(id)).filter(id => !isNaN(id));
    whereClause.id = { in: intIds };
  } else {
    whereClause.status = 'completed';
  }

  const pages = await prisma.imported_pages.findMany({
    where: whereClause
  });
  const results = [];
  for (const page of pages) {
    try {
      const migrated = await migratePage(page.id, templateId, selectorMap, useAI);
      results.push({ id: page.id, success: true, pageId: migrated.id });
    } catch (err) {
      results.push({ id: page.id, success: false, error: err.message });
    }
  }
  return results;
}
