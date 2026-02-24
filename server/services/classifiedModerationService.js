import { generateText } from './aiService.js';
import prisma from '../lib/prisma.js';
import { query } from '../db/connection.js';

/**
 * Load moderation rules from DB
 */
async function getModerationRules() {
  return prisma.classified_moderation_rules.findMany({
    where: { enabled: true },
    orderBy: { id: 'asc' },
  });
}

/**
 * Check if AI moderation is enabled
 */
async function isAiModerationEnabled() {
  const rows = await query(
    "SELECT setting_value FROM settings WHERE setting_key = 'classifieds_ai_moderation'"
  );
  return rows[0]?.setting_value === 'true';
}

/**
 * Moderate a classified ad using AI
 * @param {object} ad - { title, description, price, condition, category, images, location }
 * @returns {{ approved: boolean, reason?: string, flags: string[] }}
 */
export async function moderateAd(ad) {
  const enabled = await isAiModerationEnabled();
  if (!enabled) {
    // Check auto-approve setting
    const rows = await query(
      "SELECT setting_value FROM settings WHERE setting_key = 'classifieds_auto_approve'"
    );
    if (rows[0]?.setting_value === 'true') {
      return { approved: true, reason: null, flags: [] };
    }
    // No AI, no auto-approve → queue for manual review
    return { approved: false, reason: 'Queued for manual review', flags: ['manual_review'] };
  }

  const rules = await getModerationRules();
  if (!rules.length) {
    return { approved: true, reason: null, flags: [] };
  }

  // Build rules description for the AI
  const rulesText = rules.map(r => {
    const action = r.rule_type === 'allow' ? 'ALLOWED' : 'BLOCKED';
    return `- ${r.name}: ${action}${r.description ? ` (${r.description})` : ''}`;
  }).join('\n');

  const systemPrompt = `You are a classified ad content moderator. Review the ad below against the moderation rules and decide whether to approve or reject it.

MODERATION RULES:
${rulesText}

Respond with a JSON object:
{
  "approved": true/false,
  "reason": "brief explanation if rejected, null if approved",
  "flags": ["array", "of", "flagged", "issues"]
}

Be reasonable — only reject ads that clearly violate a BLOCKED rule. Minor issues should be flagged but still approved.`;

  const adContent = [
    `Title: ${ad.title}`,
    `Description: ${ad.description || '(none)'}`,
    ad.price != null ? `Price: ${ad.price}` : null,
    ad.condition ? `Condition: ${ad.condition}` : null,
    ad.category ? `Category: ${ad.category}` : null,
    ad.location ? `Location: ${ad.location}` : null,
    ad.images?.length ? `Images: ${ad.images.length} image(s) attached` : 'No images',
  ].filter(Boolean).join('\n');

  try {
    const result = await generateText(systemPrompt, adContent);
    return {
      approved: !!result.approved,
      reason: result.reason || null,
      flags: Array.isArray(result.flags) ? result.flags : [],
    };
  } catch (err) {
    console.error('[ClassifiedModeration] AI moderation failed:', err.message);
    // On AI failure, queue for manual review rather than auto-approving
    return { approved: false, reason: 'AI moderation unavailable — queued for manual review', flags: ['ai_error'] };
  }
}
