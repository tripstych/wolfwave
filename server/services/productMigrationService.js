import * as cheerio from 'cheerio';
import prisma from '../lib/prisma.js';
import slugify from 'slugify';
import { generateUniqueSlug } from '../lib/slugify.js';
import { getCurrentDbName } from '../lib/tenantContext.js';
import { info, error as logError } from '../lib/logger.js';
import { generateSearchIndex } from '../lib/searchIndexer.js';
import { downloadMedia } from './mediaService.js';
import { updateContent } from './contentService.js';
import { structuredScrape } from './aiService.js';

export async function migrateProduct(importedPageId, templateId, selectorMap = {}, useAI = false, ruleId = null) {
  const dbName = getCurrentDbName();
  try {
    const importedPage = await prisma.staged_items.findUnique({ where: { id: importedPageId } });
    if (!importedPage) throw new Error('Not found');
    
    let meta = typeof importedPage.metadata === 'string' ? JSON.parse(importedPage.metadata) : (importedPage.metadata || {});
    
    // If not identified as product during crawl, but we're here via a product rule, force it
    if (meta.type !== 'product' && !ruleId) {
      console.log(`[PRODUCT_MIGRATE] Skipping ${importedPage.url} - Not identified as product.`);
      throw new Error('Not a product');
    }

    let extractedData = {};

    // 1. EXTRACT FROM RAW HTML IF AVAILABLE
    if (importedPage.raw_html) {
      if (useAI) {
        info(dbName, 'PRODUCT_MIGRATE_AI', `Using AI Smart Mapping for product ${importedPageId}`);
        const fields = [
          { name: 'title', label: 'Product Title', type: 'text' },
          { name: 'description', label: 'Description', type: 'richtext' },
          { name: 'price', label: 'Price', type: 'text' },
          { name: 'sku', label: 'SKU', type: 'text' },
          { name: 'images', label: 'Images', type: 'image' }
        ];
        try {
          extractedData = await structuredScrape(fields, importedPage.raw_html);
        } catch (aiErr) {
          console.warn(`[ProductMigration] AI Smart Mapping failed, falling back to selectors:`, aiErr.message);
          useAI = false;
        }
      }

      if (!useAI && selectorMap && Object.keys(selectorMap).length > 0) {
        const $ = cheerio.load(importedPage.raw_html);
        for (const [key, selector] of Object.entries(selectorMap)) {
          const $el = $(selector);
          if ($el.length > 0) {
            const tagName = $el.get(0).tagName.toLowerCase();
            if (tagName === 'img') {
              extractedData[key] = $el.map((i, el) => $(el).attr('src') || $(el).attr('data-src') || $(el).attr('srcset')).get().filter(Boolean);
            } else if (key === 'images') {
               // If it's the images field but not targeting an img tag directly, find imgs within
               extractedData[key] = $el.find('img').map((i, el) => $(el).attr('src') || $(el).attr('data-src') || $(el).attr('srcset')).get().filter(Boolean);
            } else {
              extractedData[key] = $el.html()?.trim() || $el.text().trim();
            }
          }
        }
      }
    }

    // Merge extracted data into meta (extracted takes priority)
    if (extractedData.title) meta.title = String(extractedData.title).trim();
    if (extractedData.description) meta.description = extractedData.description;
    if (extractedData.price) {
      const cleanedPrice = String(extractedData.price).replace(/[^\d.]/g, '');
      meta.price = cleanedPrice ? parseFloat(cleanedPrice) : meta.price;
    }
    if (extractedData.sku) meta.sku = String(extractedData.sku).trim();
    if (extractedData.images) {
      let newImages = Array.isArray(extractedData.images) ? extractedData.images : [extractedData.images];
      newImages = newImages.filter(img => typeof img === 'string' && img.length > 0);
      if (newImages.length > 0) meta.images = newImages;
    }

    const title = (meta.title || importedPage.title || 'Product').trim();
    
    // Check if product with THIS EXACT TITLE already exists
    const existingContent = await prisma.content.findFirst({
      where: { module: 'products', title: title }
    });

    // ── LOCALISE MEDIA ──
    const localImages = [];
    if (meta.images && Array.isArray(meta.images)) {
      for (const imgUrl of meta.images) {
        if (imgUrl && typeof imgUrl === 'string') {
          try {
            const localImg = await downloadMedia(imgUrl, title);
            localImages.push(localImg);
          } catch (e) { console.warn(`[PRODUCT_MIGRATE] Failed to download image ${imgUrl}:`, e.message); }
        }
      }
    }

    const localVideos = [];
    if (meta.videos && Array.isArray(meta.videos)) {
      for (const vidUrl of meta.videos) {
        if (vidUrl && typeof vidUrl === 'string') {
          try {
            const localVid = await downloadMedia(vidUrl, title);
            localVideos.push(localVid);
          } catch (e) { console.warn(`[PRODUCT_MIGRATE] Failed to download video ${vidUrl}:`, e.message); }
        }
      }
    }

    const contentData = { 
      description: meta.description || '', 
      images: localImages,
      videos: localVideos 
    };

    if (existingContent) {
      // 1. Update base product content if needed
      await updateContent(existingContent.id, {
        data: contentData,
        search_index: generateSearchIndex(title, contentData),
        source_url: importedPage.url
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
              const localVariantImg = v.image ? await downloadMedia(v.image, v.title || title) : null;
              
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

      // Update metadata with rule ID if provided
      const currentMeta = typeof importedPage.metadata === 'string' ? JSON.parse(importedPage.metadata) : (importedPage.metadata || {});
      if (ruleId) currentMeta.migration_rule_id = ruleId;

      await prisma.staged_items.update({ where: { id: importedPageId }, data: { status: 'migrated', metadata: currentMeta } });
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
        search_index: generateSearchIndex(title, contentData),
        source_url: importedPage.url
      }
    });

    const product = await prisma.products.create({
      data: { content_id: content.id, template_id: templateId, title, sku, price, status: 'active' }
    });

    // Create variants from feed data (Shopify etc.)
    if (meta.variants && meta.variants.length > 0 && meta.options) {
      const optionNames = meta.options.map(o => o.name);
      for (const v of meta.variants) {
        const localVariantImg = v.image ? await downloadMedia(v.image, v.title || title) : null;

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

    // Update metadata with rule ID if provided
    const currentMeta = typeof importedPage.metadata === 'string' ? JSON.parse(importedPage.metadata) : (importedPage.metadata || {});
    if (ruleId) currentMeta.migration_rule_id = ruleId;

    await prisma.staged_items.update({ where: { id: importedPageId }, data: { status: 'migrated', metadata: currentMeta } });
    return product;
  } catch (err) {
    logError(dbName, err, 'PRODUCT_MIGRATION_FAILED');
    throw err;
  }
}

export async function bulkMigrateProducts(siteId, templateId, productIds = null, selectorMap = {}, useAI = false, ruleId = null) {
  const dbName = getCurrentDbName();
  const whereClause = { site_id: siteId };
  if (productIds && Array.isArray(productIds)) {
    const intIds = productIds.map(id => parseInt(id)).filter(id => !isNaN(id));
    whereClause.id = { in: intIds };
  } else {
    whereClause.status = { in: ['completed', 'migrated'] };
  }

  const pages = await prisma.staged_items.findMany({ 
    where: whereClause
  });

  const productPages = pages.filter(p => {
    const meta = typeof p.metadata === 'string' ? JSON.parse(p.metadata) : p.metadata;
    // Allow migration if it's explicitly identified as product, or if we have a rule targeting it
    return (meta && meta.type === 'product') || ruleId;
  });

  console.log(`[PRODUCT_MIGRATE] Site ${siteId}: Found ${productPages.length} products to migrate out of ${pages.length} total pages.`);

  const results = [];
  for (const page of productPages) {
    try {
      const product = await migrateProduct(page.id, templateId, selectorMap, useAI, ruleId);
      results.push({ id: page.id, success: true, productId: product.id });
    } catch (err) {
      console.error(`[PRODUCT_MIGRATE] Failed for ${page.url}:`, err.message);
      results.push({ id: page.id, success: false, error: err.message });
    }
  }
  return results;
}
