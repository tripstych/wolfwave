import prisma from '../lib/prisma.js';

/**
 * Update content and save history
 * @param {number} contentId - ID of the content to update
 * @param {object} data - New content data
 */
export async function updateContent(contentId, data) {
  return await prisma.$transaction(async (tx) => {
    // 1. Fetch CURRENT state including module-specific data
    const current = await tx.content.findUnique({
      where: { id: contentId },
      include: {
        _count: {
          select: { history: true }
        },
        products: true,
        pages: true
      }
    });

    if (!current) throw new Error(`Content record ${contentId} not found`);

    // 2. Prepare history data blob with mixed-in module data
    let historyData = current.data ? (typeof current.data === 'string' ? JSON.parse(current.data) : current.data) : {};
    
    if (current.module === 'products' && current.products?.[0]) {
      const p = current.products[0];
      historyData.__product = {
        sku: p.sku,
        price: p.price,
        compare_at_price: p.compare_at_price,
        cost: p.cost,
        inventory_quantity: p.inventory_quantity,
        inventory_tracking: p.inventory_tracking,
        allow_backorder: p.allow_backorder,
        weight: p.weight,
        weight_unit: p.weight_unit,
        requires_shipping: p.requires_shipping,
        taxable: p.taxable,
        status: p.status,
        image: p.image
      };
    } else if (current.module === 'pages' && current.pages?.[0]) {
      const pg = current.pages[0];
      historyData.__page = {
        status: pg.status,
        meta_title: pg.meta_title,
        meta_description: pg.meta_description,
        og_title: pg.og_title,
        og_description: pg.og_description,
        og_image: pg.og_image,
        canonical_url: pg.canonical_url,
        robots: pg.robots,
        access_rules: pg.access_rules
      };
    }

    // 3. Save current state to HISTORY
    await tx.content_history.create({
      data: {
        content_id: current.id,
        version_number: current._count.history + 1,
        data: historyData,
        title: current.title,
        slug: current.slug,
        created_at: new Date()
      }
    });

    // 4. Check for extended data in the incoming update (for restoration)
    const incomingData = data.data ? (typeof data.data === 'string' ? JSON.parse(data.data) : data.data) : null;
    
    if (incomingData) {
      if (incomingData.__product && current.module === 'products') {
        await tx.products.updateMany({
          where: { content_id: contentId },
          data: incomingData.__product
        });
      }
      if (incomingData.__page && current.module === 'pages') {
        await tx.pages.updateMany({
          where: { content_id: contentId },
          data: incomingData.__page
        });
      }
    }

    // 5. Update the MAIN record
    const updated = await tx.content.update({
      where: { id: contentId },
      data: {
        ...data,
        updated_at: new Date()
      }
    });

    return updated;
  });
}

export default { updateContent };
