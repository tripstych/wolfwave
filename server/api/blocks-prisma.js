import { Router } from 'express';
import slugify from 'slugify';
import { requireAuth, requireEditor } from '../middleware/auth.js';
import prisma from '../lib/prisma.js';
import { generateSearchIndex } from '../lib/searchIndexer.js';
import { updateContent } from '../services/contentService.js';

const router = Router();

// List all blocks
router.get('/', requireAuth, async (req, res) => {
  try {
    const { content_type, search, limit = 50, offset = 0 } = req.query;

    const pageLimit = Math.max(1, Math.min(500, parseInt(limit) || 50));
    const pageOffset = Math.max(0, parseInt(offset) || 0);

    const where = {};
    if (content_type) where.content_type = content_type;

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { slug: { contains: search } }
      ];
    }

    const blocks = await prisma.blocks.findMany({
      where,
      include: {
        content: true
      },
      orderBy: { created_at: 'desc' },
      take: pageLimit,
      skip: pageOffset
    });

    const total = await prisma.blocks.count({ where });

    const transformedBlocks = blocks.map(block => {
      const data = block.content?.data || {};
      const contentData = typeof data === 'string' ? JSON.parse(data) : data;
      return {
        ...block,
        source: contentData.source || '',
        content: contentData,
        title: block.content?.title || block.name
      };
    });

    res.json({
      data: transformedBlocks,
      pagination: { total, limit: pageLimit, offset: pageOffset }
    });
  } catch (err) {
    console.error('List blocks error:', err);
    res.status(500).json({ error: 'Failed to list blocks' });
  }
});

// Get single block
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const blockId = parseInt(req.params.id);

    const block = await prisma.blocks.findUnique({
      where: { id: blockId },
      include: {
        content: true
      }
    });

    if (!block) {
      return res.status(404).json({ error: 'Block not found' });
    }

    const data = block.content?.data || {};
    const contentData = typeof data === 'string' ? JSON.parse(data) : data;

    res.json({
      ...block,
      source: contentData.source || '',
      content: contentData,
      access_rules: block.access_rules ? (typeof block.access_rules === 'string' ? JSON.parse(block.access_rules) : block.access_rules) : null,
      title: block.content?.title || block.name
    });
  } catch (err) {
    console.error('Get block error:', err);
    res.status(500).json({ error: 'Failed to get block' });
  }
});

// Create block
router.post('/', requireAuth, requireEditor, async (req, res) => {
  try {
    const {
      name,
      description,
      source = '',
      content_type = 'blocks',
      access_rules
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const slug = slugify(name, { lower: true, strict: true });

    // Create content record with source
    const contentRecord = await prisma.content.create({
      data: {
        module: content_type,
        title: name,
        slug,
        data: { source },
        search_index: generateSearchIndex(name, { source })
      }
    });

    // Create block (no template_id needed)
    const block = await prisma.blocks.create({
      data: {
        content_id: contentRecord.id,
        name,
        slug,
        description,
        content_type,
        access_rules: access_rules || null,
        created_by: req.user?.id || null,
        updated_by: req.user?.id || null
      }
    });

    res.status(201).json({ id: block.id, slug: block.slug, content_id: contentRecord.id });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(400).json({ error: 'Slug already exists' });
    }
    console.error('Create block error:', err);
    res.status(500).json({ error: 'Failed to create block' });
  }
});

// Update block
router.put('/:id', requireAuth, requireEditor, async (req, res) => {
  try {
    const blockId = parseInt(req.params.id);
    const {
      name,
      slug,
      description,
      source,
      content_type,
      access_rules
    } = req.body;

    const existingBlock = await prisma.blocks.findUnique({
      where: { id: blockId }
    });

    if (!existingBlock) {
      return res.status(404).json({ error: 'Block not found' });
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (slug !== undefined) updateData.slug = slug;
    if (description !== undefined) updateData.description = description;
    if (content_type !== undefined) updateData.content_type = content_type;
    if (access_rules !== undefined) updateData.access_rules = access_rules || null;
    updateData.updated_by = req.user?.id || null;

    await prisma.blocks.update({
      where: { id: blockId },
      data: updateData
    });

    if (source !== undefined || name) {
      if (existingBlock.content_id) {
        const contentUpdates = {};

        if (source !== undefined) {
          contentUpdates.data = { source };
        }
        if (name) contentUpdates.title = name;
        if (content_type) contentUpdates.module = content_type;
        contentUpdates.search_index = generateSearchIndex(name || existingBlock.name, { source });

        await updateContent(existingBlock.content_id, contentUpdates);
      }
    }

    res.json({ success: true });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(400).json({ error: 'Slug already exists' });
    }
    console.error('Update block error:', err);
    res.status(500).json({ error: 'Failed to update block' });
  }
});

// Delete block
router.delete('/bulk', requireAuth, requireEditor, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || (Array.isArray(ids) && ids.length === 0)) {
      return res.json({ success: true, count: 0 });
    }

    const where = {};
    if (ids !== 'all') {
      where.id = { in: ids.map(id => parseInt(id)) };
    }

    // Get content_ids to delete orphaned content
    const blocks = await prisma.blocks.findMany({
      where,
      select: { content_id: true }
    });
    const contentIds = blocks.map(b => b.content_id).filter(Boolean);

    // Delete blocks
    const { count } = await prisma.blocks.deleteMany({ where });

    // Delete orphaned content
    if (contentIds.length > 0) {
      await prisma.content.deleteMany({
        where: { id: { in: contentIds } }
      });
    }

    res.json({ success: true, count });
  } catch (err) {
    console.error('Bulk delete blocks error:', err);
    res.status(500).json({ error: 'Failed to delete some blocks' });
  }
});

// Delete block
router.delete('/:id', requireAuth, requireEditor, async (req, res) => {
  try {
    const blockId = parseInt(req.params.id);

    const block = await prisma.blocks.findUnique({
      where: { id: blockId }
    });

    if (!block) {
      return res.status(404).json({ error: 'Block not found' });
    }

    await prisma.blocks.delete({
      where: { id: blockId }
    });

    if (block.content_id) {
      await prisma.content.deleteMany({
        where: { id: block.content_id }
      });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Delete block error:', err);
    res.status(500).json({ error: 'Failed to delete block' });
  }
});

export default router;
