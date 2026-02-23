import prisma from '../lib/prisma.js';

/**
 * Update content and save history
 * @param {number} contentId - ID of the content to update
 * @param {object} data - New content data
 */
export async function updateContent(contentId, data) {
  return await prisma.$transaction(async (tx) => {
    // 1. Fetch CURRENT state
    const current = await tx.content.findUnique({
      where: { id: contentId },
      include: {
        _count: {
          select: { history: true }
        }
      }
    });

    if (!current) throw new Error(`Content record ${contentId} not found`);

    // 2. Save current state to HISTORY
    await tx.content_history.create({
      data: {
        content_id: current.id,
        version_number: current._count.history + 1,
        data: current.data,
        title: current.title,
        slug: current.slug,
        created_at: new Date()
      }
    });

    // 3. Update the MAIN record
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
