import slugify from 'slugify';
import prisma from './prisma.js';

/**
 * Generates a unique slug for a given title and module.
 * If the slug exists, appends a counter (e.g., -1, -2).
 */
export async function generateUniqueSlug(title, module, existingId = null) {
  const baseSlug = slugify(title, { lower: true, strict: true }) || 'untitled';
  const prefix = module === 'products' ? '/products/' : '/pages/';
  let slug = prefix + baseSlug.replace(/^\/+/, '');
  
  let counter = 1;
  let isUnique = false;
  
  while (!isUnique) {
    const where = { slug: slug };
    // If updating, ignore the current record
    const existing = await prisma.content.findUnique({
      where: where,
      select: { id: true }
    });
    
    if (!existing || existing.id === existingId) {
      isUnique = true;
    } else {
      slug = `${prefix}${baseSlug}-${counter}`;
      counter++;
    }
  }
  
  return slug;
}
