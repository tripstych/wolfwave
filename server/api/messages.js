import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { downloadMedia } from '../services/mediaService.js';

const router = Router();

/**
 * Subscriber: List all my conversations
 */
router.get('/conversations', requireAuth, async (req, res) => {
  try {
    const customer = await prisma.customers.findFirst({
      where: { user_id: req.user.id }
    });

    if (!customer) return res.status(403).json({ error: 'Customer profile not found' });

    const conversations = await prisma.conversations.findMany({
      where: {
        OR: [
          { buyer_id: customer.id },
          { seller_id: customer.id }
        ]
      },
      include: {
        ad: {
          select: { title: true, image: true, slug: true }
        },
        buyer: {
          select: { first_name: true, last_name: true }
        },
        seller: {
          select: { first_name: true, last_name: true }
        },
        messages: {
          orderBy: { created_at: 'desc' },
          take: 1
        },
        _count: {
          select: {
            messages: {
              where: {
                is_read: false,
                sender_id: { not: customer.id }
              }
            }
          }
        }
      },
      orderBy: { updated_at: 'desc' }
    });

    res.json(conversations);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Subscriber: Get messages for a specific conversation
 */
router.get('/conversations/:id', requireAuth, async (req, res) => {
  try {
    const customer = await prisma.customers.findFirst({
      where: { user_id: req.user.id }
    });

    const conversationId = parseInt(req.params.id);
    const conversation = await prisma.conversations.findUnique({
      where: { id: conversationId },
      include: {
        ad: true,
        buyer: true,
        seller: true
      }
    });

    if (!conversation || (conversation.buyer_id !== customer.id && conversation.seller_id !== customer.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const messages = await prisma.messages.findMany({
      where: { conversation_id: conversationId },
      orderBy: { created_at: 'asc' },
      include: {
        sender: {
          select: { first_name: true, last_name: true }
        }
      }
    });

    // Mark messages from other person as read
    await prisma.messages.updateMany({
      where: {
        conversation_id: conversationId,
        sender_id: { not: customer.id },
        is_read: false
      },
      data: {
        is_read: true,
        read_at: new Date()
      }
    });

    res.json({ conversation, messages });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Subscriber: Send a message (Reply to Ad or ongoing conversation)
 */
router.post('/send', requireAuth, async (req, res) => {
  try {
    const customer = await prisma.customers.findFirst({
      where: { user_id: req.user.id }
    });

    const { ad_id, conversation_id, content, image } = req.body;
    let targetConversationId = conversation_id;

    // 1. If starting a NEW conversation from an AD
    if (!targetConversationId && ad_id) {
      const ad = await prisma.classified_ads.findUnique({ where: { id: parseInt(ad_id) } });
      if (!ad) return res.status(404).json({ error: 'Ad not found' });
      if (ad.customer_id === customer.id) return res.status(400).json({ error: 'Cannot message yourself' });

      // Check if conversation already exists between this buyer and seller for this ad
      const existing = await prisma.conversations.findFirst({
        where: {
          ad_id: ad.id,
          buyer_id: customer.id
        }
      });

      if (existing) {
        targetConversationId = existing.id;
      } else {
        const newConv = await prisma.conversations.create({
          data: {
            ad_id: ad.id,
            buyer_id: customer.id,
            seller_id: ad.customer_id
          }
        });
        targetConversationId = newConv.id;
      }
    }

    if (!targetConversationId) return res.status(400).json({ error: 'Conversation or Ad ID required' });

    // 2. Localize image if provided
    let localImageUrl = null;
    if (image) {
      localImageUrl = await downloadMedia(image, `Message Image`, req.user.id);
    }

    // 3. Create message
    const message = await prisma.messages.create({
      data: {
        conversation_id: targetConversationId,
        sender_id: customer.id,
        content,
        image_url: localImageUrl
      }
    });

    // 4. Update conversation timestamp and last message preview
    await prisma.conversations.update({
      where: { id: targetConversationId },
      data: {
        updated_at: new Date(),
        last_message: content || 'Sent an image'
      }
    });

    res.status(201).json(message);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
