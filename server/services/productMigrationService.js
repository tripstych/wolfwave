import prisma from '../lib/prisma.js';
import slugify from 'slugify';
import { getCurrentDbName } from '../lib/tenantContext.js';
import { info, error as logError } from '../lib/logger.js';
import { generateSearchIndex } from '../lib/searchIndexer.js';

export async function migrateProduct(importedPageId, templateId) {
  const dbName = getCurrentDbName();
  try {
    const importedPage = await prisma.imported_pages.findUnique({ where: { id: importedPageId } });
    if (!importedPage) throw new Error('Not found');
    const meta = typeof importedPage.metadata === 'string' ? JSON.parse(importedPage.metadata) : importedPage.metadata;
    if (!meta || meta.type !== 'product') {
      console.log(`[PRODUCT_MIGRATE] Skipping ${importedPage.url} - Not identified as product.`);
      throw new Error('Not a product');
    }

    const title = meta.title || importedPage.title || 'Product';
    const skuBase = slugify(title, { lower: false, strict: true }).toUpperCase().replace(/-/g, '-');
    const sku = meta.sku || `${skuBase}-001`;
    const price = parseFloat(meta.price) || 0.00;
    
    // Generate clean slug with system prefix
    let cleanSlug = slugify(title, { lower: true, strict: true }) || 'imported-product-' + Date.now();
    const productSlug = '/products/' + cleanSlug.replace(/^\/+/, '');

    const contentData = { description: meta.description || '', images: meta.images || [] };
    const content = await prisma.content.create({
      data: { 
        module: 'products', 
        title, 
        slug: productSlug, 
        data: JSON.stringify(contentData), 
        search_index: generateSearchIndex(title, contentData) 
      }
    });

    const product = await prisma.products.create({
      data: { content_id: content.id, template_id: templateId, title, sku, price, status: 'active' }
    });

    await prisma.imported_pages.update({ where: { id: importedPageId }, data: { status: 'migrated' } });
    return product;
  } catch (err) {
    logError(dbName, err, 'PRODUCT_MIGRATION_FAILED');
    throw err;
  }
}

export async function bulkMigrateProducts(siteId, templateId) {
  const dbName = getCurrentDbName();
  const pages = await prisma.imported_pages.findMany({ 
    where: { 
      site_id: siteId, 
      status: { in: ['completed', 'migrated'] } 
    } 
  });

  const productPages = pages.filter(p => {
    const meta = typeof p.metadata === 'string' ? JSON.parse(p.metadata) : p.metadata;
    return meta && meta.type === 'product';
  });

  console.log(`[PRODUCT_MIGRATE] Site ${siteId}: Found ${productPages.length} products to migrate out of ${pages.length} total pages.`);

  const results = [];
  for (const page of productPages) {
    try {
      const product = await migrateProduct(page.id, templateId);
      results.push({ id: page.id, success: true, productId: product.id });
    } catch (err) {
      console.error(`[PRODUCT_MIGRATE] Failed for ${page.url}:`, err.message);
      results.push({ id: page.id, success: false, error: err.message });
    }
  }
  return results;
}
