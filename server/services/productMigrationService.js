import prisma from '../lib/prisma.js';
import slugify from 'slugify';
import { generateUniqueSlug } from '../lib/slugify.js';
import { getCurrentDbName } from '../lib/tenantContext.js';
import { info, error as logError } from '../lib/logger.js';
import { generateSearchIndex } from '../lib/searchIndexer.js';
import { downloadImage } from './mediaService.js';

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
    
    // Check if product with THIS EXACT TITLE already exists
    const existingContent = await prisma.content.findFirst({
      where: { module: 'products', title: title }
    });

    // ── LOCALISE IMAGES ──
    const localImages = [];
    if (meta.images && Array.isArray(meta.images)) {
      for (const imgUrl of meta.images) {
        if (imgUrl && typeof imgUrl === 'string') {
          const localImg = await downloadImage(imgUrl, title);
          localImages.push(localImg);
        }
      }
    }

    const contentData = { description: meta.description || '', images: localImages };

    if (existingContent) {
      // 1. Update base product content if needed
      await prisma.content.update({
        where: { id: existingContent.id },
        data: {
          data: JSON.stringify(contentData),
          search_index: generateSearchIndex(title, contentData)
        }
      });
      
      const product = await prisma.products.findFirst({ 
        where: { content_id: existingContent.id },
        include: { product_variants: true }
      });

      if (product) {
        // 2. SMART VARIANT MERGE
        if (meta.variants && meta.variants.length > 0) {
          const optionNames = meta.options?.map(o => o.name) || [];
          
          for (const v of meta.variants) {
            // Check if this specific variant already exists (by SKU or Option values)
            const exists = product.product_variants.find(pv => 
              (v.sku && pv.sku === v.sku) || 
              (pv.option1_value === v.option1 && pv.option2_value === v.option2 && pv.option3_value === v.option3)
            );

            if (!exists) {
              const localVariantImg = v.image ? await downloadImage(v.image, v.title || title) : null;
              
              const variantData = {
                product_id: product.id,
                title: v.title || title,
                sku: v.sku || null,
                price: parseFloat(v.price) || product.price,
                compare_at_price: v.compare_at_price ? parseFloat(v.compare_at_price) : null,
                inventory_quantity: v.inventory_quantity || 0,
                image: localVariantImg,
                position: v.position || (product.product_variants.length + 1)
              };
              if (optionNames[0] && v.option1) { variantData.option1_name = optionNames[0]; variantData.option1_value = v.option1; }
              if (optionNames[1] && v.option2) { variantData.option2_name = optionNames[1]; variantData.option2_value = v.option2; }
              if (optionNames[2] && v.option3) { variantData.option3_name = optionNames[2]; variantData.option3_value = v.option3; }
              
              await prisma.product_variants.create({ data: variantData });
              info(dbName, 'PRODUCT_VARIANT_ADDED', `Added new variant "${v.title}" to existing product "${title}"`);
            }
          }
        }
      }

      await prisma.imported_pages.update({ where: { id: importedPageId }, data: { status: 'migrated' } });
      return product;
    }

    const skuBase = slugify(title, { lower: false, strict: true }).toUpperCase().replace(/-/g, '-');
    const sku = meta.sku || `${skuBase}-001`;
    const price = parseFloat(meta.price) || 0.00;
    
    // Generate clean unique slug
    const productSlug = await generateUniqueSlug(title, 'products');

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

    // Create variants from feed data (Shopify etc.)
    if (meta.variants && meta.variants.length > 0 && meta.options) {
      const optionNames = meta.options.map(o => o.name);
      for (const v of meta.variants) {
        const localVariantImg = v.image ? await downloadImage(v.image, v.title || title) : null;

        const variantData = {
          product_id: product.id,
          title: v.title || title,
          sku: v.sku || null,
          price: parseFloat(v.price) || price,
          compare_at_price: v.compare_at_price ? parseFloat(v.compare_at_price) : null,
          inventory_quantity: v.inventory_quantity || 0,
          image: localVariantImg,
          position: v.position || 1
        };
        if (optionNames[0] && v.option1) { variantData.option1_name = optionNames[0]; variantData.option1_value = v.option1; }
        if (optionNames[1] && v.option2) { variantData.option2_name = optionNames[1]; variantData.option2_value = v.option2; }
        if (optionNames[2] && v.option3) { variantData.option3_name = optionNames[2]; variantData.option3_value = v.option3; }
        try {
          await prisma.product_variants.create({ data: variantData });
        } catch (err) {
          console.warn(`[PRODUCT_MIGRATE] Variant "${v.title}" skipped: ${err.message}`);
        }
      }
    }

    await prisma.imported_pages.update({ where: { id: importedPageId }, data: { status: 'migrated' } });
    return product;
  } catch (err) {
    logError(dbName, err, 'PRODUCT_MIGRATION_FAILED');
    throw err;
  }
}

export async function bulkMigrateProducts(siteId, templateId, productIds = null) {
  const dbName = getCurrentDbName();
  const whereClause = { site_id: siteId };
  if (productIds && Array.isArray(productIds)) {
    whereClause.id = { in: productIds };
  } else {
    whereClause.status = { in: ['completed', 'migrated'] };
  }

  const pages = await prisma.imported_pages.findMany({ 
    where: whereClause
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
