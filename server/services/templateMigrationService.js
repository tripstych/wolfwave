import prisma from '../lib/prisma.js';
import { generateText } from './aiService.js';
import { info, error as logError } from '../lib/logger.js';
import { getCurrentDbName } from '../lib/tenantContext.js';

/**
 * Uses LLM to remap JSON content from an old template structure to a new one.
 */
export async function remapContentWithAI(oldData, oldRegions, newRegions) {
  const systemPrompt = `You are a CMS migration expert. 
Your task is to remap a JSON data object from an old template structure to a new template structure.

You will receive:
1. Old Template Regions (list of {name, label, type})
2. New Template Regions (list of {name, label, type})
3. The actual JSON data from the old template.

Rules:
- Map old fields to the most appropriate new fields based on name, label, and type.
- Example: 'content' might map to 'main_content' or 'body'.
- Example: 'hero_img' might map to 'banner_image'.
- If a new field has no obvious source, omit it or use an empty string.
- Return ONLY a valid JSON object matching the new template's region names.
- Do not include explanation or markdown.
`;

  const userPrompt = `
Old Regions: ${JSON.stringify(oldRegions)}
New Regions: ${JSON.stringify(newRegions)}
Old Data: ${JSON.stringify(oldData)}
`;

  try {
    const remappedData = await generateText(systemPrompt, userPrompt);
    return remappedData;
  } catch (err) {
    console.error('[TemplateMigration] AI Remapping failed:', err.message);
    // Fallback: simple copy for exact matches
    const fallback = {};
    if (newRegions && Array.isArray(newRegions)) {
      newRegions.forEach(nr => {
        if (oldData[nr.name] !== undefined) {
          fallback[nr.name] = oldData[nr.name];
        } else if (nr.name === 'main_content' && oldData['content']) {
          fallback[nr.name] = oldData['content'];
        } else if (nr.name === 'content' && oldData['main_content']) {
           fallback[nr.name] = oldData['main_content'];
        }
      });
    }
    return fallback;
  }
}

/**
 * Migrates a specific page or block to a new template, remapping its content.
 */
export async function migrateRecordTemplate(type, recordId, newTemplateId) {
  const dbName = getCurrentDbName();
  try {
    const table = type === 'pages' ? prisma.pages : prisma.blocks;
    
    const record = await table.findUnique({
      where: { id: recordId },
      include: { 
        templates: true,
        content: true
      }
    });

    if (!record || !record.content) return;

    const oldTemplate = record.templates;
    const newTemplate = await prisma.templates.findUnique({ where: { id: newTemplateId } });

    if (!newTemplate) throw new Error('New template not found');

    const oldData = typeof record.content.data === 'string' ? JSON.parse(record.content.data) : (record.content.data || {});
    const oldRegions = oldTemplate?.regions || [];
    const newRegions = newTemplate.regions || [];

    info(dbName, 'TEMPLATE_MIGRATE_START', `Migrating ${type} ID ${recordId} to template ${newTemplate.filename}`);

    const remappedData = await remapContentWithAI(oldData, oldRegions, newRegions);

    // Update content record
    await prisma.content.update({
      where: { id: record.content_id },
      data: {
        data: JSON.stringify(remappedData)
      }
    });

    // Update the record's template_id
    await table.update({
      where: { id: recordId },
      data: { template_id: newTemplateId }
    });

    info(dbName, 'TEMPLATE_MIGRATE_SUCCESS', `Successfully migrated ${type} ID ${recordId} to ${newTemplate.filename}`);
  } catch (err) {
    logError(dbName, err, 'TEMPLATE_MIGRATION_FAILED');
  }
}

/**
 * Handles cleanup of records using a stale template by remapping them to a best-match new template.
 */
export async function handleStaleTemplateMigration(staleTemplateId, availableTemplates) {
  const dbName = getCurrentDbName();
  
  // Find pages and blocks using this stale template
  const pages = await prisma.pages.findMany({ where: { template_id: staleTemplateId } });
  const blocks = await prisma.blocks.findMany({ where: { template_id: staleTemplateId } });

  if (pages.length === 0 && blocks.length === 0) return true;

  const staleTemplate = await prisma.templates.findUnique({ where: { id: staleTemplateId } });
  if (!staleTemplate) return true;

  info(dbName, 'STALE_TEMPLATE_CLEANUP', `Migrating ${pages.length} pages and ${blocks.length} blocks from stale template ${staleTemplate.filename}`);

  for (const page of pages) {
    const bestMatch = findBestTemplateMatch(staleTemplate, availableTemplates, 'pages');
    if (bestMatch) {
      await migrateRecordTemplate('pages', page.id, bestMatch.id);
    }
  }

  for (const block of blocks) {
    const bestMatch = findBestTemplateMatch(staleTemplate, availableTemplates, 'blocks');
    if (bestMatch) {
      await migrateRecordTemplate('blocks', block.id, bestMatch.id);
    }
  }

  // Check if any are still left (migration might fail for some)
  const remainingPages = await prisma.pages.count({ where: { template_id: staleTemplateId } });
  const remainingBlocks = await prisma.blocks.count({ where: { template_id: staleTemplateId } });

  return (remainingPages === 0 && remainingBlocks === 0);
}

function findBestTemplateMatch(staleTemplate, availableTemplates, contentType) {
  // 1. Exact filename match (e.g. pages/home.njk vs themes/slug/pages/home.njk)
  const basename = staleTemplate.filename.split('/').pop();
  const exactMatch = availableTemplates.find(t => t.filename.endsWith(basename) && t.content_type === (staleTemplate.content_type || contentType));
  if (exactMatch) return exactMatch;

  // 2. Content type match
  const typeMatch = availableTemplates.find(t => t.content_type === (staleTemplate.content_type || contentType));
  if (typeMatch) return typeMatch;

  // 3. Fallback to any template
  return availableTemplates[0];
}
