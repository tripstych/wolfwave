import * as cheerio from 'cheerio';
import prisma from '../lib/prisma.js';
import path from 'path';
import fs from 'fs/promises';
import { getCurrentDbName } from '../lib/tenantContext.js';
import { info, error as logError } from '../lib/logger.js';

export async function generateTemplateFromGroup(siteId, structuralHash, templateName) {
  const dbName = getCurrentDbName();
  try {
    const pages = await prisma.staged_items.findMany({
      where: { site_id: siteId, structural_hash: structuralHash, status: 'completed' },
      take: 1
    });
    if (pages.length === 0) throw new Error('No pages found');

    const firstDOM = cheerio.load(pages[0].raw_html);
    let templateHtml = firstDOM.html();
    
    // Heuristic: wrap body content
    const body = firstDOM('body');
    body.prepend('{% block content %}');
    body.append('{% endblock %}');
    templateHtml = firstDOM.html();

    const filename = `imported-${siteId}-${structuralHash.substring(0, 8)}.njk`;
    const template = await prisma.templates.create({
      data: {
        name: templateName || `Imported ${structuralHash.substring(0, 8)}`,
        filename: filename,
        content_type: 'pages',
        regions: JSON.stringify(['main']),
        blueprint: JSON.stringify({ main: { type: 'richtext', label: 'Main Content' } })
      }
    });

    const templatePath = path.join(process.cwd(), 'templates', 'pages', filename);
    await fs.writeFile(templatePath, templateHtml);
    return template;
  } catch (err) {
    logError(dbName, err, 'TEMPLATE_GEN_FAILED');
    throw err;
  }
}

export async function analyzeSiteGroups(siteId) {
  const dbName = getCurrentDbName();
  
  const groups = await prisma.staged_items.groupBy({
    by: ['structural_hash'],
    where: { site_id: siteId, status: 'completed' },
    _count: { id: true }
  });

  return Promise.all(groups.map(async (group) => {
    // 1. Get all pages in this group to determine the dominant type
    const pages = await prisma.staged_items.findMany({
      where: { site_id: siteId, structural_hash: group.structural_hash, status: 'completed' },
      select: { url: true, title: true, metadata: true }
    });

    let productCount = 0;
    let samplePage = null;

    pages.forEach(p => {
      const meta = typeof p.metadata === 'string' ? JSON.parse(p.metadata) : p.metadata;
      if (meta && meta.type === 'product') {
        productCount++;
      } else if (!samplePage) {
        // First non-product is our ideal sample
        samplePage = p;
      }
    });

    // If no non-product pages found, use the first page available
    if (!samplePage && pages.length > 0) {
      samplePage = pages[0];
    }

    const isProductGroup = productCount > (pages.length / 2);

    return {
      structural_hash: group.structural_hash,
      count: group._count.id,
      sample_url: samplePage?.url,
      sample_title: samplePage?.title,
      type: isProductGroup ? 'product' : 'page',
      product_count: productCount
    };
  }));
}
