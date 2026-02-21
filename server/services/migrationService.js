import * as cheerio from 'cheerio';
import prisma from '../lib/prisma.js';
import slugify from 'slugify';
import { getCurrentDbName } from '../lib/tenantContext.js';
import { info, error as logError } from '../lib/logger.js';
import { generateSearchIndex } from '../lib/searchIndexer.js';
import { automaticallyDetectContent } from './scraperService.js';

export async function migratePage(importedPageId, templateId, selectorMap = { 'main': 'body' }) {
  const dbName = getCurrentDbName();
  try {
    const importedPage = await prisma.imported_pages.findUnique({ where: { id: importedPageId } });
    if (!importedPage || !importedPage.raw_html) throw new Error('Invalid page');

    const $ = cheerio.load(importedPage.raw_html);
    const extractedData = {};
    
    for (const [key, selector] of Object.entries(selectorMap)) {
      // If the user hasn't specified a specific class (defaulting to body or main), use auto-detect
      if (key === 'main' && (selector === 'body' || selector === 'main' || !selector)) {
        extractedData[key] = automaticallyDetectContent($);
      } else {
        const $el = $(selector);
        if ($el.length > 0) extractedData[key] = $el.html().trim();
      }
    }

    // Fallback if still empty
    if (!extractedData.main) extractedData.main = $('body').html();
    let cleanSlug = slugify(title, { lower: true, strict: true }) || 'imported-page-' + Date.now();
    const pageSlug = '/pages/' + cleanSlug.replace(/^\/+/, '');

    const content = await prisma.content.create({
      data: {
        module: 'pages',
        title: title,
        slug: pageSlug,
        data: JSON.stringify(extractedData),
        search_index: generateSearchIndex(title, extractedData)
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

export async function bulkMigrate(siteId, structuralHash, templateId, selectorMap) {
  const pages = await prisma.imported_pages.findMany({
    where: { site_id: siteId, structural_hash: structuralHash, status: 'completed' }
  });
  const results = [];
  for (const page of pages) {
    try {
      const migrated = await migratePage(page.id, templateId, selectorMap);
      results.push({ id: page.id, success: true, pageId: migrated.id });
    } catch (err) {
      results.push({ id: page.id, success: false, error: err.message });
    }
  }
  return results;
}

export async function bulkMigrateAll(siteId, templateId, selectorMap) {
  const pages = await prisma.imported_pages.findMany({
    where: { site_id: siteId, status: 'completed' }
  });
  const results = [];
  for (const page of pages) {
    try {
      const migrated = await migratePage(page.id, templateId, selectorMap);
      results.push({ id: page.id, success: true, pageId: migrated.id });
    } catch (err) {
      results.push({ id: page.id, success: false, error: err.message });
    }
  }
  return results;
}
