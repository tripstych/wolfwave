import { Router } from 'express';
import slugify from 'slugify';
import { requireAuth, requireEditor } from '../middleware/auth.js';
import prisma from '../lib/prisma.js';
import { generateSearchIndex } from '../lib/searchIndexer.js';
import { updateContent } from '../services/contentService.js';

const router = Router();

// List all posts
router.get('/', requireAuth, async (req, res) => {
  try {
    const { status, template_id, search, limit = 50, offset = 0 } = req.query;
    const content_type = 'posts';

    // Validate pagination parameters
    const pageLimit = Math.max(1, Math.min(500, parseInt(limit) || 50));
    const pageOffset = Math.max(0, parseInt(offset) || 0);

    // Build filters
    const where = { content_type };
    if (status) where.status = status;
    if (template_id) where.template_id = parseInt(template_id);

    if (search) {
      where.OR = [
        { title: { contains: search } },
        { content: { slug: { contains: search } } }
      ];
    }

    // Fetch posts with content and template
    const posts = await prisma.pages.findMany({
      where,
      include: {
        content: true,
        templates: {
          select: {
            id: true,
            name: true,
            filename: true,
            regions: true
          }
        }
      },
      orderBy: { updated_at: 'desc' },
      take: pageLimit,
      skip: pageOffset
    });

    // Count total
    const total = await prisma.pages.count({ where });

    // Transform response
    const transformedPosts = posts.map(post => {
      try {
        return {
          ...post,
          template_name: post.templates?.name,
          template_filename: post.templates?.filename,
          template_regions: post.templates?.regions || [],
          content: post.content?.data || {},
          access_rules: post.access_rules ? (typeof post.access_rules === 'string' ? JSON.parse(post.access_rules) : post.access_rules) : null,
          title: post.content?.title || post.title,
          slug: post.content?.slug || ''
        };
      } catch (parseErr) {
        console.error('JSON parse error for post:', post.id, {
          regions: post.templates?.regions,
          contentData: post.content?.data,
          error: parseErr.message
        });
        return {
          ...post,
          template_name: post.templates?.name,
          template_filename: post.templates?.filename,
          template_regions: post.templates?.regions || [],
          content: {},
          title: post.content?.title || post.title,
          slug: post.content?.slug || post.slug
        };
      }
    });

    res.json({
      data: transformedPosts,
      pagination: { total, limit: pageLimit, offset: pageOffset }
    });
  } catch (err) {
    console.error('List posts error:', err);
    res.status(500).json({ error: 'Failed to list posts' });
  }
});

// Get single post
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const postId = parseInt(req.params.id);

    const post = await prisma.pages.findUnique({
      where: { id: postId },
      include: {
        content: true,
        templates: {
          select: {
            id: true,
            name: true,
            filename: true,
            regions: true
          }
        }
      }
    });

    if (!post || post.content_type !== 'posts') {
      return res.status(404).json({ error: 'Post not found' });
    }

    res.json({
      ...post,
      template_name: post.templates?.name,
      template_filename: post.templates?.filename,
      template_regions: post.templates?.regions ? (typeof post.templates.regions === 'string' ? JSON.parse(post.templates.regions) : post.templates.regions) : [],
      content: post.content?.data || {},
      access_rules: post.access_rules ? (typeof post.access_rules === 'string' ? JSON.parse(post.access_rules) : post.access_rules) : null,
      title: post.content?.title || post.title,
      slug: post.content?.slug || ''
    });
  } catch (err) {
    console.error('Get post error:', err);
    res.status(500).json({ error: 'Failed to get post' });
  }
});

// Create post
router.post('/', requireAuth, requireEditor, async (req, res) => {
  try {
    const {
      template_id,
      title,
      providedSlug,
      content,
      status = 'draft',
      meta_title,
      meta_description,
      og_title,
      og_description,
      og_image,
      canonical_url,
      robots,
      schema_markup,
      access_rules
    } = req.body;

    const content_type = 'posts';

    if (!template_id || !title) {
      return res.status(400).json({ error: 'Template and title required' });
    }

    // Validate template exists and belongs to correct content type
    const template = await prisma.templates.findUnique({
      where: { id: parseInt(template_id) }
    });

    if (!template) {
      return res.status(400).json({ error: 'Template not found' });
    }

    if (template.content_type !== content_type) {
      return res.status(400).json({
        error: `Template belongs to "${template.content_type}" content type, not "${content_type}"`
      });
    }

    // Generate slug
    let slug = providedSlug || slugify(title, { lower: true, strict: true });
    if (!slug.startsWith(`/${content_type}/`)) {
      slug = slug.replace(/^\/+/, '');
      slug = `/${content_type}/` + slug;
    }

    // Use transaction to ensure both records are created
    const result = await prisma.$transaction(async (tx) => {
      // Create content record first
      const contentRecord = await tx.content.create({
        data: {
          module: content_type,
          title,
          slug,
          data: content || {},
          search_index: generateSearchIndex(title, content)
        }
      });

      // Create post (using pages table)
      const pageRecord = await tx.pages.create({
        data: {
          template_id: parseInt(template_id),
          content_id: contentRecord.id,
          title,
          content_type,
          status,
          meta_title: meta_title || title,
          meta_description: meta_description || '',
          og_title: og_title || '',
          og_description: og_description || '',
          og_image: og_image || '',
          canonical_url: canonical_url || '',
          robots: robots || 'index, follow',
          schema_markup: schema_markup ? JSON.stringify(schema_markup) : null,
          access_rules: access_rules || null,
          created_by: req.user?.id || null,
          updated_by: req.user?.id || null
        }
      });

      return { post: pageRecord, content: contentRecord };
    });

    res.status(201).json({ id: result.post.id, slug: result.content.slug });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(400).json({ error: 'Slug already exists' });
    }
    console.error('Create post error:', err);
    res.status(500).json({ error: 'Failed to create post' });
  }
});

// Update post
router.put('/:id', requireAuth, requireEditor, async (req, res) => {
  try {
    const postId = parseInt(req.params.id);
    const {
      template_id,
      title,
      slug,
      content,
      status,
      meta_title,
      meta_description,
      og_title,
      og_description,
      og_image,
      canonical_url,
      robots,
      schema_markup,
      access_rules
    } = req.body;

    // Get existing post
    const existingPost = await prisma.pages.findUnique({
      where: { id: postId }
    });

    if (!existingPost || existingPost.content_type !== 'posts') {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Validate template if changing
    if (template_id && template_id !== existingPost.template_id) {
      const template = await prisma.templates.findUnique({
        where: { id: parseInt(template_id) }
      });
      if (!template || template.content_type !== 'posts') {
        return res.status(400).json({ error: 'Template not found or invalid' });
      }
    }

    // Update post
    const updateData = {};
    if (template_id !== undefined) updateData.template_id = parseInt(template_id);
    if (title !== undefined) updateData.title = title;
    if (status !== undefined) updateData.status = status;
    if (meta_title !== undefined) updateData.meta_title = meta_title;
    if (meta_description !== undefined) updateData.meta_description = meta_description;
    if (og_title !== undefined) updateData.og_title = og_title;
    if (og_description !== undefined) updateData.og_description = og_description;
    if (og_image !== undefined) updateData.og_image = og_image;
    if (canonical_url !== undefined) updateData.canonical_url = canonical_url;
    if (robots !== undefined) updateData.robots = robots;
    if (schema_markup !== undefined) updateData.schema_markup = schema_markup ? JSON.stringify(schema_markup) : null;
    if (access_rules !== undefined) updateData.access_rules = access_rules || null;
    if (status === 'published') updateData.published_at = new Date();
    updateData.updated_by = req.user?.id || null;

    await prisma.pages.update({
      where: { id: postId },
      data: updateData
    });

    // Update content record if provided
    if (content || title || slug) {
      if (existingPost.content_id) {
        let mergedContent = content;
        if (content) {
          const existing = await prisma.content.findUnique({ where: { id: existingPost.content_id } });
          if (existing && existing.data) {
            const existingData = typeof existing.data === 'string' ? JSON.parse(existing.data) : existing.data;
            mergedContent = { ...existingData, ...content };
          }
        }

        const contentUpdates = {
          ...(mergedContent && { data: mergedContent }),
          ...(title && { title }),
          ...(slug && { slug }),
          search_index: generateSearchIndex(title || existingPost.title, mergedContent)
        };

        await updateContent(existingPost.content_id, contentUpdates);
      }
    }

    res.json({ success: true });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(400).json({ error: 'Slug already exists' });
    }
    console.error('Update post error:', err);
    res.status(500).json({ error: 'Failed to update post' });
  }
});

// Delete post
router.delete('/:id', requireAuth, requireEditor, async (req, res) => {
  try {
    const postId = parseInt(req.params.id);

    const post = await prisma.pages.findUnique({
      where: { id: postId }
    });

    if (!post || post.content_type !== 'posts') {
      return res.status(404).json({ error: 'Post not found' });
    }

    await prisma.pages.delete({
      where: { id: postId }
    });

    if (post.content_id) {
      await prisma.content.deleteMany({
        where: { id: post.content_id }
      });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Delete post error:', err);
    res.status(500).json({ error: 'Failed to delete post' });
  }
});

// Bulk delete
router.delete('/bulk', requireAuth, requireEditor, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || (Array.isArray(ids) && ids.length === 0)) {
      return res.json({ success: true, count: 0 });
    }

    const where = {
      content_type: 'posts',
      id: ids === 'all' ? undefined : { in: ids.map(id => parseInt(id)) }
    };

    const posts = await prisma.pages.findMany({
      where,
      select: { content_id: true }
    });
    const contentIds = posts.map(p => p.content_id).filter(Boolean);

    const { count } = await prisma.pages.deleteMany({ where });

    if (contentIds.length > 0) {
      await prisma.content.deleteMany({
        where: { id: { in: contentIds } }
      });
    }

    res.json({ success: true, count });
  } catch (err) {
    console.error('Bulk delete posts error:', err);
    res.status(500).json({ error: 'Failed to delete posts' });
  }
});

// Duplicate post
router.post('/:id/duplicate', requireAuth, requireEditor, async (req, res) => {
  try {
    const postId = parseInt(req.params.id);

    const originalPost = await prisma.pages.findUnique({
      where: { id: postId },
      include: { content: true }
    });

    if (!originalPost || originalPost.content_type !== 'posts') {
      return res.status(404).json({ error: 'Post not found' });
    }

    const newSlug = `${originalPost.content?.slug || '/'}-${Date.now()}`;

    const newContent = await prisma.content.create({
      data: {
        module: 'posts',
        title: `${originalPost.content?.title || originalPost.title} (Copy)`,
        slug: newSlug,
        data: originalPost.content?.data || '{}'
      }
    });

    const duplicatedPost = await prisma.pages.create({
      data: {
        template_id: originalPost.template_id,
        content_id: newContent.id,
        title: `${originalPost.title} (Copy)`,
        content_type: 'posts',
        status: 'draft',
        meta_title: originalPost.meta_title,
        meta_description: originalPost.meta_description,
        og_title: originalPost.og_title,
        og_description: originalPost.og_description,
        og_image: originalPost.og_image,
        canonical_url: originalPost.canonical_url,
        robots: originalPost.robots,
        schema_markup: originalPost.schema_markup,
        created_by: req.user?.id || null,
        updated_by: req.user?.id || null
      }
    });

    res.status(201).json({ id: duplicatedPost.id, slug: newSlug });
  } catch (err) {
    console.error('Duplicate post error:', err);
    res.status(500).json({ error: 'Failed to duplicate post' });
  }
});

export default router;
