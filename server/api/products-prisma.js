import { Router } from 'express';
import slugify from 'slugify';
import { requireAuth, requireEditor } from '../middleware/auth.js';
import prisma from '../lib/prisma.js';
import { generateSearchIndex } from '../lib/searchIndexer.js';
import { updateContent } from '../services/contentService.js';
import { downloadImage, processHtmlMedia } from '../services/mediaService.js';

const router = Router();

// List all products
router.get('/', requireAuth, async (req, res) => {
  try {
    const {
      status, 
      search, 
      sku, 
      min_price, 
      max_price, 
      sort_by = 'created_at',
      order = 'desc',
      limit = 50, 
      offset = 0 
    } = req.query;

    const pageLimit = Math.max(1, Math.min(500, parseInt(limit) || 50));
    const pageOffset = Math.max(0, parseInt(offset) || 0);

    // Build where clause
    const where = {};
    if (status) where.status = status;
    if (sku) where.sku = sku;
    
    // Price range
    if (min_price || max_price) {
      where.price = {};
      if (min_price) where.price.gte = parseFloat(min_price);
      if (max_price) where.price.lte = parseFloat(max_price);
    }

    if (search) {
      // Find content IDs matching search term first
      const contentMatches = await prisma.content.findMany({
        where: {
          title: { contains: search }
        },
        select: { id: true }
      });
      const contentIds = contentMatches.map(c => c.id);
      where.OR = [
        { sku: { contains: search } },
        { content_id: { in: contentIds } }
      ];
    }

    // Dynamic sorting
    let orderBy = {};
    // Note: title sorting across tables without relation is tricky in Prisma,
    // we'll default to created_at if sorting by title for now, or could implement custom sort.
    orderBy = { [sort_by === 'title' ? 'created_at' : sort_by]: order.toLowerCase() === 'asc' ? 'asc' : 'desc' };

    const products = await prisma.products.findMany({
      where,
      include: {
        product_images: {
          orderBy: { position: 'asc' }
        },
        product_variants: {
          orderBy: { position: 'asc' }
        }
      },
      orderBy,
      take: pageLimit,
      skip: pageOffset
    });

    // Fetch content for these products manually
    const contentIds = products.map(p => p.content_id).filter(Boolean);
    const contents = await prisma.content.findMany({
      where: { id: { in: contentIds } }
    });
    const contentMap = Object.fromEntries(contents.map(c => [c.id, c]));

    const total = await prisma.products.count({ where });

    // Transform response
    const transformed = products.map(p => {
      const productContent = contentMap[p.content_id];
      return {
        ...p,
        title: productContent?.title || 'Untitled',
        content: productContent?.data || {},
        image: p.image || p.product_images?.[0]?.url || '',
        images: p.product_images,
        variants: p.product_variants
      };
    });

    res.json({
      data: transformed,
      pagination: { total, limit: pageLimit, offset: pageOffset }
    });
  } catch (err) {
    console.error('List products error:', err);
    res.status(500).json({ error: 'Failed to list products' });
  }
});

// Get single product with variants
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const productId = parseInt(req.params.id);

    const product = await prisma.products.findUnique({
      where: { id: productId },
      include: {
        product_images: {
          orderBy: { position: 'asc' }
        },
        product_variants: {
          orderBy: { position: 'asc' }
        }
      }
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Fetch content manually
    let productContent = null;
    if (product.content_id) {
      productContent = await prisma.content.findUnique({
        where: { id: product.content_id }
      });
    }

    const contentData = productContent?.data || {};
    res.json({
      ...product,
      title: productContent?.title || 'Untitled',
      slug: productContent?.slug || '',
      image: product.image || product.product_images?.[0]?.url || '',
      images: product.product_images,
      content: contentData,
      access_rules: product.access_rules ? (typeof product.access_rules === 'string' ? JSON.parse(product.access_rules) : product.access_rules) : null,
      variants: product.product_variants
    });
  } catch (err) {
    console.error('Get product error:', err);
    res.status(500).json({ error: 'Failed to get product' });
  }
});

// Create product
router.post('/', requireAuth, requireEditor, async (req, res) => {
  try {
    const {
      template_id,
      title,
      slug: providedSlug,
      content,
      image,
      images,
      sku,
      price,
      compare_at_price,
      cost,
      inventory_quantity,
      inventory_tracking,
      allow_backorder,
      weight,
      weight_unit,
      requires_shipping,
      taxable,
      status,
      variants,
      access_rules
    } = req.body;

    // Validate required fields
    if (!template_id || !title || !sku || price === undefined) {
      return res.status(400).json({
        error: 'Template, title, SKU, and price are required'
      });
    }

    // Check SKU uniqueness
    const existingSku = await prisma.products.findUnique({
      where: { sku }
    });
    if (existingSku) {
      return res.status(400).json({ error: `SKU "${sku}" already exists` });
    }

    // Generate slug
    let productSlug = providedSlug || slugify(title, { lower: true, strict: true });
    if (!productSlug.startsWith('/products/')) {
      productSlug = productSlug.replace(/^\/+/, '');
      productSlug = '/products/' + productSlug;
    }

    // Process images and content for local storage
    const userId = req.user?.id;
    const processedImage = image ? await downloadImage(image, title, userId) : null;
    const processedImages = images ? await Promise.all(images.map(img => downloadImage(img.url || img, title, userId).then(url => ({ url, alt: img.alt || '', position: img.position })))) : [];
    const processedVariants = variants ? await Promise.all(variants.map(async v => ({ ...v, image: v.image ? await downloadImage(v.image, v.title, userId) : null }))) : [];
    
    // Process HTML content for images
    const processedContent = content || {};
    if (processedContent.description) {
      processedContent.description = await processHtmlMedia(processedContent.description, userId);
    }

    // Create content record first
      const contentRecord = await prisma.content.create({
        data: {
          module: 'products',
          title,
          slug: productSlug,
          data: processedContent,
          search_index: generateSearchIndex(title, processedContent)
        }
      });

    // Create product with variants in transaction
    const product = await prisma.products.create({
      data: {
        template_id,
        content_id: contentRecord.id,
        image: processedImage,
        sku,
        price,
        compare_at_price: compare_at_price || null,
        cost: cost || null,
        inventory_quantity: inventory_quantity || 0,
        inventory_tracking: inventory_tracking !== false,
        allow_backorder: allow_backorder || false,
        weight: weight || null,
        weight_unit: weight_unit || 'lb',
        requires_shipping: requires_shipping !== false,
        taxable: taxable !== false,
        status: status || 'draft',
        access_rules: access_rules || null,
        product_images: {
          createMany: {
            data: processedImages.map((img, i) => ({
              url: img.url,
              alt: img.alt || '',
              position: img.position !== undefined ? img.position : i
            }))
          }
        },
        product_variants: {
          createMany: {
            data: processedVariants.map((v, i) => ({
              title: v.title || '',
              sku: v.sku || null,
              price: v.price !== undefined ? v.price : null,
              compare_at_price: v.compare_at_price || null,
              inventory_quantity: v.inventory_quantity || 0,
              option1_name: v.option1_name || null,
              option1_value: v.option1_value || null,
              option2_name: v.option2_name || null,
              option2_value: v.option2_value || null,
              option3_name: v.option3_name || null,
              option3_value: v.option3_value || null,
              image: v.image,
              position: i
            }))
          }
        }
      },
      include: {
        content: true,
        product_variants: true
      }
    });

    res.status(201).json({
      ...product,
      title: product.content?.title || 'Untitled',
      slug: product.content?.slug || '',
      content: product.content?.data || {},
      images: product.product_images,
      variants: product.product_variants
    });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(400).json({ error: 'SKU already exists' });
    }
    console.error('Create product error:', err);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

// Update product
router.put('/:id', requireAuth, requireEditor, async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    const {
      template_id,
      title,
      slug: providedSlug,
      content,
      image,
      images,
      sku,
      price,
      compare_at_price,
      cost,
      inventory_quantity,
      inventory_tracking,
      allow_backorder,
      weight,
      weight_unit,
      requires_shipping,
      taxable,
      status,
      variants,
      access_rules
    } = req.body;

    // Get existing product
    const existing = await prisma.products.findUnique({
      where: { id: productId },
      include: { content: true }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Check SKU uniqueness (excluding current product)
    if (sku && sku !== existing.sku) {
      const duplicate = await prisma.products.findUnique({
        where: { sku }
      });
      if (duplicate) {
        return res.status(400).json({ error: `SKU "${sku}" already exists` });
      }
    }

    const userId = req.user?.id;
    
    // Prepare product updates
    const productUpdates = {};
    if (template_id !== undefined) productUpdates.template_id = template_id;
    if (sku !== undefined) productUpdates.sku = sku;
    if (price !== undefined) productUpdates.price = price;
    if (compare_at_price !== undefined) productUpdates.compare_at_price = compare_at_price;
    if (cost !== undefined) productUpdates.cost = cost;
    if (inventory_quantity !== undefined) productUpdates.inventory_quantity = inventory_quantity;
    if (inventory_tracking !== undefined) productUpdates.inventory_tracking = inventory_tracking;
    if (allow_backorder !== undefined) productUpdates.allow_backorder = allow_backorder;
    if (weight !== undefined) productUpdates.weight = weight;
    if (weight_unit !== undefined) productUpdates.weight_unit = weight_unit;
    if (requires_shipping !== undefined) productUpdates.requires_shipping = requires_shipping;
    if (taxable !== undefined) productUpdates.taxable = taxable;
    if (status !== undefined) productUpdates.status = status;
    if (image !== undefined) {
      productUpdates.image = image ? await downloadImage(image, title || existing.title, userId) : null;
    }
    if (access_rules !== undefined) productUpdates.access_rules = access_rules || null;

    // Update content if provided
    let existingContent = null;
    if (existing.content_id) {
      existingContent = await prisma.content.findUnique({ where: { id: existing.content_id } });
    }

    if (existing.content_id && (content !== undefined || title !== undefined || providedSlug !== undefined)) {
      let contentData = existingContent?.data || {};

      const contentUpdates = {};
      if (title !== undefined) contentUpdates.title = title;
      if (providedSlug !== undefined) {
        let slug = providedSlug;
        if (!slug.startsWith('/products/')) {
          slug = slug.replace(/^\/+/, '');
          slug = '/products/' + slug;
        }
        contentUpdates.slug = slug;
      }
      if (content !== undefined) {
        contentData = { ...contentData, ...content };
        // Process images in description
        if (contentData.description) {
          contentData.description = await processHtmlMedia(contentData.description, userId);
        }
      }
      if (content !== undefined) {
        contentUpdates.data = contentData;
      }

      if (Object.keys(contentUpdates).length > 0) {
        // Update search index if content or title changed
        contentUpdates.search_index = generateSearchIndex(
          title || existingContent?.title || existing.title, 
          contentData
        );

        await updateContent(existing.content_id, contentUpdates);
      }
    }

    // Update product
    const updated = await prisma.products.update({
      where: { id: productId },
      data: productUpdates,
      include: {
        product_variants: true
      }
    });

    // Handle images update
    if (images !== undefined) {
      // Download any external images first
      const processedImages = await Promise.all(images.map(img => 
        downloadImage(img.url || img, title || existing.title, userId).then(url => ({ 
          url, 
          alt: img.alt || '', 
          position: img.position 
        }))
      ));

      // Delete existing images and recreate
      await prisma.product_images.deleteMany({
        where: { product_id: productId }
      });

      if (processedImages.length > 0) {
        await prisma.product_images.createMany({
          data: processedImages.map((img, i) => ({
            product_id: productId,
            url: img.url,
            alt: img.alt,
            position: img.position !== undefined ? img.position : i
          }))
        });
      }
    }

    // Handle variants update
    if (variants !== undefined) {
      // Get IDs of incoming variants
      const incomingIds = new Set(variants.filter(v => v.id).map(v => v.id));

      // Delete variants not in incoming list
      await prisma.product_variants.deleteMany({
        where: {
          product_id: productId,
          id: { notIn: Array.from(incomingIds) }
        }
      });

      // Update or create variants
      for (let i = 0; i < variants.length; i++) {
        const v = variants[i];
        const variantImage = v.image ? await downloadImage(v.image, v.title, userId) : null;
        
        if (v.id) {
          // Update existing
          await prisma.product_variants.update({
            where: { id: v.id },
            data: {
              title: v.title || '',
              sku: v.sku || null,
              price: v.price !== undefined ? v.price : null,
              compare_at_price: v.compare_at_price || null,
              inventory_quantity: v.inventory_quantity || 0,
              option1_name: v.option1_name || null,
              option1_value: v.option1_value || null,
              option2_name: v.option2_name || null,
              option2_value: v.option2_value || null,
              option3_name: v.option3_name || null,
              option3_value: v.option3_value || null,
              image: variantImage,
              position: i
            }
          });
        } else {
          // Create new
          await prisma.product_variants.create({
            data: {
              product_id: productId,
              title: v.title || '',
              sku: v.sku || null,
              price: v.price !== undefined ? v.price : null,
              compare_at_price: v.compare_at_price || null,
              inventory_quantity: v.inventory_quantity || 0,
              option1_name: v.option1_name || null,
              option1_value: v.option1_value || null,
              option2_name: v.option2_name || null,
              option2_value: v.option2_value || null,
              option3_name: v.option3_name || null,
              option3_value: v.option3_value || null,
              image: variantImage,
              position: i
            }
          });
        }
      }
    }

    // Fetch updated product with relations
    const finalProduct = await prisma.products.findUnique({
      where: { id: productId },
      include: {
        product_images: {
          orderBy: { position: 'asc' }
        },
        product_variants: {
          orderBy: { position: 'asc' }
        }
      }
    });

    const finalContent = finalProduct.content_id 
      ? await prisma.content.findUnique({ where: { id: finalProduct.content_id } })
      : null;

    res.json({
      ...finalProduct,
      title: finalContent?.title || 'Untitled',
      slug: finalContent?.slug || '',
      image: finalProduct.image || finalProduct.product_images?.[0]?.url || '',
      images: finalProduct.product_images,
      content: finalContent?.data || {},
      variants: finalProduct.product_variants
    });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(400).json({ error: 'SKU already exists' });
    }
    console.error('Update product error:', err);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// Delete product
router.delete('/bulk', requireAuth, requireEditor, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || (Array.isArray(ids) && ids.length === 0)) {
      return res.json({ success: true, count: 0 });
    }

    if (!Array.isArray(ids) && ids !== 'all') {
      return res.status(400).json({ error: 'IDs required for bulk delete' });
    }

    const where = {};
    if (ids !== 'all') {
      where.id = { in: ids.map(id => parseInt(id)) };
    }

    // Get content_ids to delete orphaned content
    const products = await prisma.products.findMany({
      where,
      select: { content_id: true }
    });
    const contentIds = products.map(p => p.content_id).filter(Boolean);

    // Delete products (cascade will delete variants)
    const { count } = await prisma.products.deleteMany({ where });

    // Delete orphaned content
    if (contentIds.length > 0) {
      await prisma.content.deleteMany({
        where: { id: { in: contentIds } }
      });
    }

    res.json({ success: true, count });
  } catch (err) {
    console.error('Bulk delete products error:', err);
    res.status(500).json({ error: 'Failed to delete some products' });
  }
});

// Delete product
router.delete('/:id', requireAuth, requireEditor, async (req, res) => {
  try {
    const productId = parseInt(req.params.id);

    const product = await prisma.products.findUnique({
      where: { id: productId }
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Delete product (cascade will delete variants)
    await prisma.products.delete({
      where: { id: productId }
    });

    // Delete orphaned content
    if (product.content_id) {
      await prisma.content.deleteMany({
        where: { id: product.content_id }
      });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Delete product error:', err);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

// Adjust inventory
router.post('/:id/inventory', requireAuth, requireEditor, async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    const { adjustment, variant_id } = req.body;

    if (adjustment === undefined) {
      return res.status(400).json({ error: 'Adjustment value required' });
    }

    // If variant_id provided, adjust variant inventory
    if (variant_id) {
      const variant = await prisma.product_variants.findUnique({
        where: { id: parseInt(variant_id) }
      });

      if (!variant) {
        return res.status(404).json({ error: 'Variant not found' });
      }

      const updated = await prisma.product_variants.update({
        where: { id: parseInt(variant_id) },
        data: {
          inventory_quantity: Math.max(0, (variant.inventory_quantity || 0) + adjustment)
        }
      });

      return res.json(updated);
    }

    // Otherwise adjust product inventory
    const product = await prisma.products.findUnique({
      where: { id: productId }
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const updated = await prisma.products.update({
      where: { id: productId },
      data: {
        inventory_quantity: Math.max(0, (product.inventory_quantity || 0) + adjustment)
      }
    });

    res.json(updated);
  } catch (err) {
    console.error('Adjust inventory error:', err);
    res.status(500).json({ error: 'Failed to adjust inventory' });
  }
});

export default router;
