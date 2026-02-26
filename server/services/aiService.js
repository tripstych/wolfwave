import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { logError, info } from '../lib/logger.js';
import { downloadImage } from './mediaService.js';
import { query } from '../db/connection.js';
import prisma from '../lib/prisma.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '../../public');

/**
 * Get cached LLM response if it exists
 */
async function getCachedAiResponse(promptHash) {
  try {
    const cached = await prisma.ai_cache.findUnique({
      where: { prompt_hash: promptHash }
    });
    return cached ? cached.response : null;
  } catch (err) {
    return null;
  }
}

/**
 * Cache an LLM response
 */
async function setCachedAiResponse(promptHash, response, model) {
  try {
    await prisma.ai_cache.upsert({
      where: { prompt_hash: promptHash },
      update: { response, model, created_at: new Date() },
      create: { prompt_hash: promptHash, response, model }
    });
  } catch (err) {
    console.error('[AI-CACHE] Failed to save cache:', err.message);
  }
}

// Cache for discovered Gemini image generation models
let imagenModelsCache = null;
let imagenModelsCacheExpiry = 0;
const IMAGEN_CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Discover available Gemini image generation models via ListModels API.
 * Returns an array of model IDs sorted by preference (newest first).
 * Results are cached for 1 hour.
 */
async function discoverImagenModels(apiKey) {
  if (imagenModelsCache && Date.now() < imagenModelsCacheExpiry) {
    return imagenModelsCache;
  }

  try {
    const response = await axios.get(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );

    const models = response.data.models || [];

    // Filter for image generation models that support generateContent
    const imagenModels = models
      .filter(m => {
        const id = m.name?.replace('models/', '') || '';
        const methods = m.supportedGenerationMethods || [];
        // Look for imagen models or models with image generation capability
        return (id.includes('imagen') || id.includes('image')) &&
               methods.includes('generateContent');
      })
      .map(m => m.name.replace('models/', ''))
      // Sort: prefer higher version numbers and newer models
      .sort((a, b) => b.localeCompare(a));

    console.log(`[AI-DEBUG] Discovered Imagen models: ${imagenModels.length > 0 ? imagenModels.join(', ') : 'NONE'}`);

    imagenModelsCache = imagenModels;
    imagenModelsCacheExpiry = Date.now() + IMAGEN_CACHE_TTL;
    return imagenModels;
  } catch (err) {
    console.error(`[AI-DEBUG] Failed to discover Imagen models: ${err.message}`);
    // Return empty array so callers can fall back gracefully
    return [];
  }
}

/**
 * Get AI settings from the database with environment fallbacks
 */
async function getAiSettings() {
  const rows = await query(
    `SELECT setting_key, setting_value FROM settings
     WHERE setting_key IN (
       'openai_api_key', 'openai_api_url',
       'anthropic_api_key', 'gemini_api_key',
       'gemini_model', 'ai_simulation_mode',
       'ai_default_provider', 'ai_fallback_provider',
       'anthropic_model', 'openai_model',
       'openai_image_model', 'gemini_image_model'
     )`
  );

  const settings = {};
  rows.forEach(r => { settings[r.setting_key] = r.setting_value; });

  return {
    openai_api_key: settings.openai_api_key || process.env.OPENAI_API_KEY,
    openai_api_url: settings.openai_api_url || process.env.OPENAI_API_URL || 'https://api.openai.com/v1',
    anthropic_api_key: settings.anthropic_api_key || process.env.ANTHROPIC_API_KEY,
    anthropic_api_url: 'https://api.anthropic.com/v1/messages',
    gemini_api_key: settings.gemini_api_key || process.env.GEMINI_API_KEY,
    gemini_model: settings.gemini_model || process.env.GEMINI_MODEL || 'gemini-3-flash-preview',
    ai_simulation_mode: settings.ai_simulation_mode === 'true' || process.env.AI_SIMULATION_MODE === 'true',
    ai_default_provider: settings.ai_default_provider || 'gemini',
    ai_fallback_provider: settings.ai_fallback_provider || 'none',
    anthropic_model: settings.anthropic_model || 'claude-sonnet-4-20250514',
    openai_model: settings.openai_model || 'gpt-4o',
    openai_image_model: settings.openai_image_model || 'dall-e-3',
    gemini_image_model: settings.gemini_image_model || '',
  };
}

/**
 * Build ordered list of providers to try based on user preferences.
 * Returns array of provider names, filtered to those with valid API keys.
 */
function getProviderOrder(config, capability = 'text') {
  const providers = [];

  // Add default provider first
  if (config.ai_default_provider && config.ai_default_provider !== 'none') {
    providers.push(config.ai_default_provider);
  }

  // Add fallback provider second
  if (config.ai_fallback_provider && config.ai_fallback_provider !== 'none' && config.ai_fallback_provider !== config.ai_default_provider) {
    providers.push(config.ai_fallback_provider);
  }

  // If somehow neither is set, fall back to legacy order
  if (providers.length === 0) {
    providers.push('gemini', 'anthropic', 'openai');
  }

  // Filter to providers that have valid keys and support the capability
  return providers.filter(p => {
    if (capability === 'image' && p === 'anthropic') return false; // Anthropic has no image generation
    const keyMap = { gemini: 'gemini_api_key', anthropic: 'anthropic_api_key', openai: 'openai_api_key' };
    const key = config[keyMap[p]];
    return key && key !== 'demo';
  });
}

/**
 * Call Gemini for text generation (JSON mode).
 */
async function callGeminiText(config, systemPrompt, userPrompt, model, jsonMode = true) {
  const geminiModel = model || config.gemini_model;
  const body = {
    system_instruction: {
      parts: [{ text: jsonMode ? systemPrompt + "\n\nCRITICAL: Return ONLY a valid JSON object. No preamble, no explanation." : systemPrompt }]
    },
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
  };
  if (jsonMode) body.generationConfig = { responseMimeType: "application/json" };

  const response = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${config.gemini_api_key}`,
    body,
    { headers: { 'Content-Type': 'application/json' } }
  );
  return { text: response.data.candidates[0].content.parts[0].text, model: geminiModel };
}

/**
 * Call Anthropic for text generation.
 */
async function callAnthropicText(config, systemPrompt, userPrompt, model, jsonMode = true) {
  const anthropicModel = model || config.anthropic_model;
  const response = await axios.post(
    config.anthropic_api_url,
    {
      model: anthropicModel,
      max_tokens: jsonMode ? 4096 : 8192,
      system: jsonMode ? systemPrompt + "\n\nCRITICAL: Return ONLY a valid JSON object. No preamble, no explanation." : systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    },
    {
      headers: {
        'x-api-key': config.anthropic_api_key,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
    }
  );
  return { text: response.data.content[0].text, model: anthropicModel };
}

/**
 * Call OpenAI for text generation.
 */
async function callOpenAIText(config, systemPrompt, userPrompt, model, jsonMode = true) {
  const openaiModel = model || config.openai_model;
  const body = {
    model: openaiModel,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: jsonMode ? 0.7 : 0.3,
  };
  if (jsonMode) body.response_format = { type: "json_object" };

  const response = await axios.post(
    `${config.openai_api_url}/chat/completions`,
    body,
    {
      headers: {
        'Authorization': `Bearer ${config.openai_api_key}`,
        'Content-Type': 'application/json',
      },
    }
  );
  return { text: response.data.choices[0].message.content, model: openaiModel };
}

/**
 * Route a text generation call to the appropriate provider.
 */
const textCallers = {
  gemini: callGeminiText,
  anthropic: callAnthropicText,
  openai: callOpenAIText,
};

/**
 * Robustly extract and parse JSON from an LLM response string.
 * Handles markdown blocks, trailing text, and multiple JSON candidates.
 */
function extractJson(text) {
  if (!text || typeof text !== 'string') return null;
  
  const clean = text.trim();
  
  // 1. Direct parse attempt
  try {
    return JSON.parse(clean);
  } catch (e) {}

  // 2. Try to find JSON block in markdown
  const markdownMatch = clean.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (markdownMatch && markdownMatch[1]) {
    try {
      return JSON.parse(markdownMatch[1].trim());
    } catch (e) {}
  }

  // 3. Last resort: Find first { and last }
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    try {
      const candidate = clean.substring(start, end + 1);
      return JSON.parse(candidate);
    } catch (e) {}
  }

  throw new Error(`Failed to extract valid JSON from response: ${text.substring(0, 100)}...`);
}

/**
 * Generate text content using an LLM
 */
export async function generateText(systemPrompt, userPrompt, model = null, req = null) {
  const config = await getAiSettings();

  // Determine the actual model that will be used for the hash
  const defaultProvider = config.ai_default_provider || 'gemini';
  const providerModelMap = { gemini: 'gemini_model', anthropic: 'anthropic_model', openai: 'openai_model' };
  const targetModel = model || config[providerModelMap[defaultProvider]] || 'gemini-1.5-flash';

  const promptHash = crypto.createHash('sha256')
    .update(`${systemPrompt}|${userPrompt}|${targetModel}`)
    .digest('hex');

  // Check cache first (skip for simulation mode)
  if (!config.ai_simulation_mode) {
    const cached = await getCachedAiResponse(promptHash);
    if (cached) {
      console.log(`[AI-CACHE] 🎯 HIT: Returning cached response for hash ${promptHash.substring(0, 8)}`);
      return cached;
    }
  }

  const hasNoKeys = !config.openai_api_key && !config.anthropic_api_key && !config.gemini_api_key;
  const isDemoKey = config.openai_api_key === 'demo' || config.anthropic_api_key === 'demo' || config.gemini_api_key === 'demo';

  // 1. SIMULATION MODE (Only if explicitly requested)
  if (config.ai_simulation_mode || (hasNoKeys && isDemoKey)) {
    console.log(`[AI-DEBUG] 💡 Running in SIMULATION MODE.`);
    await new Promise(resolve => setTimeout(resolve, 1500));

    const industry = userPrompt.replace('Create a theme for:', '').trim();
    const slug = industry.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

    const result = {
      slug: `${slug}-mock`,
      name: `${industry} (Simulated)`,
      description: `A professionally drafted theme for the ${industry} industry.`,
      css_variables: {
        "--nano-brand": "#3b82f6",
        "--nano-bg": "#ffffff",
        "--nano-text": "#1f2937"
      },
      content: {
        headline: `Premium Solutions for ${industry}`,
        subtext: `We provide world-class services tailored specifically for the ${industry} sector, driven by excellence and innovation.`,
        features: [
          { "title": "Expertise", "body": "Years of experience in the field." },
          { "title": "Quality", "body": "Uncompromising standards in every project." },
          { "title": "Speed", "body": "Fast turnaround without sacrificing detail." }
        ],
        hero_image_prompt: "mock"
      }
    };
    return result;
  }

  // 2. Try providers in configured order (default → fallback)
  const providers = getProviderOrder(config, 'text');
  let lastError = null;

  for (const provider of providers) {
    const caller = textCallers[provider];
    const logTag = `AI_GEN_${provider.toUpperCase()}`;
    info(req || 'system', logTag, `System: ${systemPrompt}\nUser: ${userPrompt.substring(0, 1000)}${userPrompt.length > 1000 ? '...' : ''}`);

    try {
      const { text, model: usedModel } = await caller(config, systemPrompt, userPrompt, model, true);
      console.log(`[AI-DEBUG] 📥 Received response from ${provider}.`);
      
      const parsed = extractJson(text);
      
      await setCachedAiResponse(promptHash, parsed, usedModel);
      return parsed;
    } catch (error) {
      const errorData = error.response?.data;
      logError(req || 'system', errorData || error, `AI_TEXT_GEN_${provider.toUpperCase()}`);
      lastError = errorData?.error?.message || error.message;
      console.warn(`[AI-DEBUG] ⚠️ ${provider} failed: ${lastError}, trying next provider...`);
    }
  }

  throw new Error(lastError ? `All AI providers failed. Last error: ${lastError}` : 'No valid AI Text Generation provider configured (Missing API Key)');
}

/**
 * Generate raw text content using an LLM (no JSON parsing).
 * Used for template conversion where the output is template code, not structured data.
 */
export async function generateRawText(systemPrompt, userPrompt, model = null) {
  const config = await getAiSettings();

  // Determine the actual model that will be used for the hash
  const defaultProvider = config.ai_default_provider || 'gemini';
  const providerModelMap = { gemini: 'gemini_model', anthropic: 'anthropic_model', openai: 'openai_model' };
  const targetModel = model || config[providerModelMap[defaultProvider]] || 'gemini-1.5-flash';

  const promptHash = crypto.createHash('sha256')
    .update(`RAW|${systemPrompt}|${userPrompt}|${targetModel}`)
    .digest('hex');

  // Check cache
  if (!config.ai_simulation_mode) {
    const cached = await getCachedAiResponse(promptHash);
    if (cached && typeof cached === 'string') {
      console.log(`[AI-CACHE] 🎯 HIT (RAW): Returning cached response for hash ${promptHash.substring(0, 8)}`);
      return cached;
    }
  }

  // Try providers in configured order (default → fallback)
  const providers = getProviderOrder(config, 'text');
  let lastError = null;

  for (const provider of providers) {
    const caller = textCallers[provider];
    info('system', `AI_GEN_RAW_${provider.toUpperCase()}`, `System: ${systemPrompt}\nUser: ${userPrompt.substring(0, 500)}...`);

    try {
      const { text, model: usedModel } = await caller(config, systemPrompt, userPrompt, model, false);
      await setCachedAiResponse(promptHash, text, usedModel);
      return text;
    } catch (error) {
      const errorData = error.response?.data;
      lastError = errorData?.error?.message || error.message;
      console.warn(`[AI-DEBUG] ⚠️ ${provider} (raw) failed: ${lastError}, trying next provider...`);
    }
  }

  throw new Error(lastError ? `All AI providers failed. Last error: ${lastError}` : 'No valid AI Text Generation provider configured (Missing API Key)');
}

/**
 * Generate image via Gemini Imagen.
 */
async function callGeminiImage(config, prompt, skipSave, userId) {
  // Use configured image model or auto-discover
  let modelsToTry;
  if (config.gemini_image_model) {
    modelsToTry = [config.gemini_image_model];
  } else {
    const availableModels = await discoverImagenModels(config.gemini_api_key);
    modelsToTry = availableModels.length > 0
      ? availableModels
      : ['imagen-4.0-generate-preview-06-06', 'imagen-3.0-generate-002', 'imagen-3.0-generate-001'];
  }

  console.log(`[AI-DEBUG] 🎨 Generating image via Gemini Imagen: "${prompt}" (models to try: ${modelsToTry.join(', ')})`);

  let lastError = null;
  for (const model of modelsToTry) {
    try {
      console.log(`[AI-DEBUG] Trying Imagen model: ${model}`);
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.gemini_api_key}`,
        { contents: [{ parts: [{ text: prompt }] }] },
        { timeout: 60000 }
      );

      const imageData = response.data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (imageData) {
        console.log(`[AI-DEBUG] 📥 Base64 image received from Gemini (model: ${model}). Processing...`);
        const dataUri = `data:image/png;base64,${imageData}`;
        if (skipSave) return dataUri;
        const localUrl = await downloadImage(dataUri, prompt, userId, true);
        console.log(`[AI-DEBUG] ✅ Gemini Image processed: ${localUrl}`);
        return localUrl;
      }
      throw new Error('Gemini returned no image data');
    } catch (e) {
      const errorMsg = e.response?.data?.error?.message || e.message;
      console.error(`[AI-DEBUG] ❌ Gemini model ${model} failed: ${errorMsg}`);
      lastError = errorMsg;
      if (e.response?.status === 404) {
        imagenModelsCache = null;
        imagenModelsCacheExpiry = 0;
      }
    }
  }
  throw new Error(`Gemini Imagen: All models failed. Last error: ${lastError}`);
}

/**
 * Generate image via OpenAI DALL-E.
 */
async function callOpenAIImage(config, prompt, size, skipSave, userId) {
  const imageModel = config.openai_image_model;
  console.log(`[AI-DEBUG] 🎨 Generating image via ${imageModel}: "${prompt}"...`);

  const response = await axios.post(
    `${config.openai_api_url}/images/generations`,
    {
      model: imageModel,
      prompt: prompt,
      n: 1,
      size: size,
      response_format: "url",
    },
    {
      headers: {
        'Authorization': `Bearer ${config.openai_api_key}`,
        'Content-Type': 'application/json',
      },
      timeout: 60000
    }
  );

  const imageUrl = response.data.data[0].url;
  console.log(`[AI-DEBUG] 📥 Image URL received. skipSave: ${skipSave}`);
  if (skipSave) return imageUrl;
  const localUrl = await downloadImage(imageUrl, prompt, userId, true);
  console.log(`[AI-DEBUG] ✅ Image processed: ${localUrl}`);
  return localUrl;
}

/**
 * Generate an image using AI (Gemini Imagen or DALL-E)
 * Downloads the image locally and returns the local path.
 */
export async function generateImage(prompt, size = "1024x1024", userId = null, skipSave = false) {
  const config = await getAiSettings();

  const hasNoKeys = !config.openai_api_key && !config.gemini_api_key;
  const isDemoKey = config.openai_api_key === 'demo' || config.gemini_api_key === 'demo';

  console.log(`[AI-DEBUG] generateImage keys check:`, {
    hasGemini: !!config.gemini_api_key,
    hasOpenAI: !!config.openai_api_key,
    isDemo: isDemoKey,
    hasNoKeys,
    skipSave
  });

  // SIMULATION MODE
  if (config.ai_simulation_mode || isDemoKey || prompt === 'mock') {
    console.log(`[AI-DEBUG] 🎨 Image Gen: Simulation Mode active.`);
    return '/images/placeholders/800x450.svg';
  }

  // Try providers in configured order (default → fallback), skipping Anthropic for images
  const providers = getProviderOrder(config, 'image');
  let lastError = null;

  for (const provider of providers) {
    try {
      if (provider === 'gemini') {
        return await callGeminiImage(config, prompt, skipSave, userId);
      } else if (provider === 'openai') {
        return await callOpenAIImage(config, prompt, size, skipSave, userId);
      }
    } catch (error) {
      lastError = error.message;
      console.warn(`[AI-DEBUG] ⚠️ ${provider} image gen failed: ${lastError}, trying next provider...`);
    }
  }

  throw new Error(lastError ? `All image providers failed. Last error: ${lastError}` : `No valid AI Image Generation provider configured.`);
}

/**
 * Generate content for a specific set of fields
 */
export async function generateContentForFields(fields, userContext, model = null, req = null) {
  const config = await getAiSettings();
  
  const hasNoKeys = !config.openai_api_key && !config.anthropic_api_key && !config.gemini_api_key;
  const isDemoKey = config.openai_api_key === 'demo' || config.anthropic_api_key === 'demo' || config.gemini_api_key === 'demo';

  // SIMULATION MODE
  if (config.ai_simulation_mode || (hasNoKeys && isDemoKey)) {
    console.log(`[AI-DEBUG] ✍️ Content Gen: Simulation Mode active.`);
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const mockData = {};
    for (const field of fields) {
      if (field.type === 'repeater') {
        mockData[field.name] = [
          { title: `${userContext} Feature 1`, description: "Simulated AI content for item 1." },
          { title: `${userContext} Feature 2`, description: "Simulated AI content for item 2." },
          { title: `${userContext} Feature 3`, description: "Simulated AI content for item 3." }
        ];
      } else if (field.type === 'image') {
        mockData[field.name] = '/images/placeholders/800x450.svg';
      } else {
        mockData[field.name] = `[AI Generated] ${field.label} for ${userContext}`;
      }
    }
    return mockData;
  }

  // REAL MODE
  const systemPrompt = `You are a professional copywriter for a CMS. 
  Your task is to generate content for a webpage based on the user's context.
  
  You will receive a JSON list of fields (name, label, type).
  Return a JSON object where the keys are the field names and the values are the generated content.
  
  Rules:
  - For 'richtext', use simple HTML (<p>, <strong>, <ul>).
  - For 'image', return a descriptive DALL-E prompt string (do not generate URL).
  - For 'repeater', generate an array of 3 objects matching the sub-fields.
  - Tone: Professional, engaging, and SEO-friendly.
  `;

  const fieldSchema = JSON.stringify(fields, null, 2);
  const fullPrompt = `Context: ${userContext}\n\nFields to fill:\n${fieldSchema}`;

  return await generateText(systemPrompt, fullPrompt, model, req);
}

/**
 * Suggest CSS selectors for a set of fields based on HTML content
 */
export async function suggestSelectors(fields, html, model = null, req = null) {
  const config = await getAiSettings();
  const isDemo = (!config.openai_api_key || config.openai_api_key === 'demo') && (!config.anthropic_api_key || config.anthropic_api_key === 'demo');

  if (isDemo) {
    const mock = {};
    fields.forEach(f => {
      if (f.name === 'title') mock[f.name] = 'h1';
      else if (f.name.includes('price')) mock[f.name] = '.price';
      else if (f.name === 'content') mock[f.name] = '.main-content-area, .entry-content, .article-body';
      else if (f.name.includes('description')) mock[f.name] = '.product-description, .short-description, .summary';
      else if (f.name.includes('image')) mock[f.name] = '.product-main-image img';
      else mock[f.name] = `.${f.name}`;
    });
    return mock;
  }

  const systemPrompt = `You are a web scraping expert. 
  Your goal is to look at a provided HTML snippet and suggest the best CSS selectors for a set of target fields.
  
  You will receive:
  1. A list of fields (name, label, type).
  2. A sample of the target webpage HTML.
  
  Rules:
  - Return ONLY a JSON object where keys are field names and values are CSS selectors.
  - Prioritize unique IDs, then specific classes.
  - If a field is an 'image' type, ensure the selector targets the <img> tag or an element with a background-image.
  - Be as precise as possible.
  - If you cannot find a good match, use a reasonable guess based on common patterns.
  `;

  // Strip excessive HTML to save tokens
  const cleanHtml = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
                        .substring(0, 15000); // 15k chars is usually enough for structure

  const userPrompt = `Fields to map: ${JSON.stringify(fields)}\n\nHTML Snippet:\n${cleanHtml}`;

  return await generateText(systemPrompt, userPrompt, model, req);
}

/**
 * Extract structured content from HTML using AI based on field definitions.
 */
export async function structuredScrape(fields, html, model = null, req = null) {
  const config = await getAiSettings();
  const $ = (await import('cheerio')).load(html);
  
  // 1. SURGICAL CLEANING: Nuke the high-token junk
  $('head, script, style, noscript, svg, iframe, canvas, link, meta').remove();
  
  // 2. SEMANTIC CLEANING: Remove structural noise that isn't "content"
  $('header, footer, nav, aside, .sidebar, .menu, .nav, .footer, .header, #header, #footer, #nav').remove();

  // 3. ATTRIBUTE CLEANING: Remove noisy attributes that don't help mapping
  $('*').each((i, el) => {
    const attribs = el.attribs || {};
    for (const key in attribs) {
      // Keep ID and Class as they often have semantic meaning (e.g. class="product-description")
      // But strip everything else (data-v-xyz, style, event handlers, etc)
      if (key !== 'class' && key !== 'id' && key !== 'src' && key !== 'href') {
        $(el).removeAttr(key);
      }
    }
  });

  // 4. PREFER THE MAIN MEAT: If there's a main or article tag, focus on that
  const $main = $('main, [role="main"], article, .content, #content').first();
  const cleanHtml = ($main.length > 0 ? $main.html() : $('body').html())
    .replace(/\s+/g, ' ') // Collapse whitespace
    .substring(0, 60000); // Doubled limit of high-quality content

  const systemPrompt = `You are a professional content extraction AI. 
Your goal is to extract content from HTML and structure it into a JSON object.

TARGET FIELDS:
${JSON.stringify(fields)}

EXTRACTION RULES:
- Return ONLY valid JSON.
- If a field is 'richtext', preserve <h2>, <p>, <ul>, <li>. REMOVE all classes/IDs from these tags.
- If a field is 'image', find the most relevant primary image URL.
- If a field is 'text' or 'textarea', return plain text only.
- DO NOT be lazy. If the content is in the HTML, find it and extract it fully.
- If you absolutely cannot find a field, return null for that key.`;

  const userPrompt = `SOURCE HTML:\n${cleanHtml}`;

  try {
    return await generateText(systemPrompt, userPrompt, model, req);
  } catch (err) {
    console.error('[AI-Scraper] Structured scrape failed:', err.message);
    throw err;
  }
}

/**
 * Extract navigation menus from HTML using AI.
 */
export async function extractMenusFromHTML(html, model = null, req = null) {
  const config = await getAiSettings();
  const $ = (await import('cheerio')).load(html);
  
  // 1. SURGICAL CLEANING: Keep only navigation-relevant parts
  $('script, style, noscript, svg, iframe, canvas, main, article, .content, #content, aside, .sidebar').remove();
  
  // Collapse whitespace and trim to stay within limits
  const cleanHtml = $('body').html()
    .replace(/\s+/g, ' ')
    .substring(0, 40000);

  const systemPrompt = `You are a web architecture expert. 
Your task is to analyze the provided HTML (which contains headers, footers, and nav bars) and extract the navigation menus.

Return a JSON object with this structure:
{
  "menus": [
    {
      "name": "Main Navigation",
      "slug": "main-nav",
      "items": [
        { "title": "Home", "url": "/", "children": [] },
        { "title": "Shop", "url": "/shop", "children": [ { "title": "New Arrivals", "url": "/shop/new" } ] }
      ]
    },
    {
      "name": "Footer Menu",
      "slug": "footer-menu",
      "items": [...]
    }
  ]
}

RULES:
- Identify logical groups of links (Main Nav, Footer links, Social links).
- Preserve hierarchy (parent/child) if evident in the HTML.
- Return ONLY the valid JSON object. No explanation.`;

  const userPrompt = `SOURCE HTML:\n${cleanHtml}`;

  try {
    const result = await generateText(systemPrompt, userPrompt, model, req);
    return result;
  } catch (err) {
    console.error('[AI-Menus] Menu extraction failed:', err.message);
    throw err;
  }
}

/**
 * Generate a Nunjucks template from HTML and a selector map.
 */
export async function generateTemplateFromHtml(html, selectorMap, pageType, assets = null, model = null, req = null) {
  const systemPrompt = `You are a Nunjucks template expert for the WebWolf CMS.
Your goal is to convert a static HTML page into a standalone dynamic Nunjucks template (.njk).

RULES:
- STANDALONE: Generate a complete HTML document (<!DOCTYPE html>, <html>, <head>, <body>).
- NO BLOCKS: Do not use {% block content %} or {% extends %}. Output raw HTML with Nunjucks tags.
- REPLACE CONTENT: You MUST replace the static text/HTML inside identified elements with Nunjucks tags. 
  * Incorrect: <h1 data-cms-region="title">Static Title</h1>
  * Correct: <h1 data-cms-region="title" data-cms-type="text">{{ content.title }}</h1>
- NO NESTING: Do not put a data-cms-region inside another data-cms-region. 
  * If 'main' or 'content' is used as a region, it must NOT wrap 'title' or 'description'. 
  * Choose either specific fields (title, description, content) OR a broad 'main' field, but never both in a parent-child relationship.
- COLLECTIONS & LOOPS: If a field in the selector map indicates multiple items (like 'images'):
  * Do NOT output a single static tag.
  * Generate a Nunjucks loop to render the items.
  * Example for images: 
    <div class="media-gallery">
      {% for img in content.images %}
        <img data-cms-region="images" data-cms-type="image" src="{{ img }}">
      {% endfor %}
    </div>
- CRITICAL: Every dynamic field MUST be wrapped in an element with 'data-cms-region' and 'data-cms-type' attributes.
- Format: <div data-cms-region="field_name" data-cms-type="text|richtext|image">{{ content.field_name | safe }}</div>
- For images: <img data-cms-region="image_field" data-cms-type="image" src="{{ content.image_field | default('/placeholder.png') }}">
- THEME ASSETS: Include provided local assets in the <head> or at the end of the body using the provided local paths.
- CMS HEAD: Always include {{ seo.title }}, {{ seo.description }}, etc. in the <head>.
- CMS EDITING: Add this before </body>: 
  {% if user %}
    <link rel="stylesheet" href="/css/edit-in-place.css">
    <script src="/js/edit-in-place.js"></script>
  {% endif %}
- Return ONLY the Nunjucks code. No explanation.

THEME ASSETS (Local paths and Styles):
${JSON.stringify(assets, null, 2)}
- If 'lovable_styles' are provided:
  * Include all 'links' as <link rel="stylesheet" href="..."> tags in the <head>.
  * Include all 'inline' strings as <style>...</style> blocks in the <head>.

SELECTOR MAP:
${JSON.stringify(selectorMap, null, 2)}

PAGE TYPE: ${pageType}`;

  const userPrompt = `SOURCE HTML:\n${html.substring(0, 25000)}`;

  // Retry once on transient errors (502, 503, timeout)
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await generateRawText(systemPrompt, userPrompt, model);
    } catch (err) {
      const status = err.response?.status;
      if (attempt < 2 && (status === 502 || status === 503 || status === 429 || err.code === 'ECONNABORTED')) {
        console.warn(`[AI-Template] Attempt ${attempt} failed (${status || err.code}), retrying in 5s...`);
        await new Promise(r => setTimeout(r, 5000));
        continue;
      }
      console.error('[AI-Template] Template generation failed:', err.message);
      throw err;
    }
  }
}

/**
 * Generate a structural Nunjucks template based purely on identified data regions,
 * ignoring the original site's look and feel.
 */
export async function generateStructuralTemplate(regions, pageType, model = null, req = null) {
  const systemPrompt = `You are a Nunjucks template expert and an expert UI/UX designer.
Your goal is to design a clean, modern, structural Nunjucks template (.njk) based ONLY on a list of available data regions.
DO NOT try to copy the look and feel of the original website. 
Instead, based on the available types of data and the page type, design a template that will structurally format the data in a beautiful, responsive way using standard semantic HTML and simple vanilla CSS classes (e.g., .container, .grid, .card, .header) or inline styles if necessary to make it look decent out of the box.

RULES:
- STANDALONE: Generate a complete HTML document (<!DOCTYPE html>, <html>, <head>, <body>).
- NO BLOCKS: Do not use {% block content %} or {% extends %}. Output raw HTML with Nunjucks tags.
- DYNAMIC CONTENT: Use the provided data regions to populate the template.
- COLLECTIONS & LOOPS: If a region indicates multiple items (like 'images'), generate a Nunjucks loop:
    <div class="gallery-grid">
      {% for item in content.images %}
        <img data-cms-region="images" data-cms-type="image" src="{{ item }}" class="gallery-img">
      {% endfor %}
    </div>
- CRITICAL: Every dynamic field MUST be wrapped in an element with 'data-cms-region' and 'data-cms-type' attributes.
- Format: <div data-cms-region="field_name" data-cms-type="text|richtext|image">{{ content.field_name | safe }}</div>
- CMS HEAD: Always include {{ seo.title }}, {{ seo.description }}, etc. in the <head>.
- CMS EDITING: Add this before </body>: 
  {% if user %}
    <link rel="stylesheet" href="/css/edit-in-place.css">
    <script src="/js/edit-in-place.js"></script>
  {% endif %}
- Return ONLY the Nunjucks code. No explanation.

PAGE TYPE: ${pageType}

AVAILABLE DATA REGIONS:
${JSON.stringify(regions, null, 2)}`;

  const userPrompt = `Generate the structural Nunjucks template for a ${pageType} page based on the provided regions.`;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await generateRawText(systemPrompt, userPrompt, model);
    } catch (err) {
      const status = err.response?.status;
      if (attempt < 2 && (status === 502 || status === 503 || status === 429 || err.code === 'ECONNABORTED')) {
        console.warn(`[AI-Template] Attempt ${attempt} failed, retrying in 5s...`);
        await new Promise(r => setTimeout(r, 5000));
        continue;
      }
      console.error('[AI-Template] Structural template generation failed:', err.message);
      throw err;
    }
  }
}

/**
 * Compare two page structures to see if they can share the same template.
 */
export async function comparePageStructures(htmlA, htmlB, model = null) {
  const systemPrompt = `You are a web architecture expert. 
Analyze two HTML snippets and determine if they are structurally similar enough to use the same Nunjucks template.

They can share a template if:
- They have the same primary content areas (e.g. both are standard articles, both are product pages).
- The location of the main title, body, and sidebar is consistent.
- Small differences in internal element counts are okay.

They should NOT share a template if:
- One is a product and the other is a blog post.
- One is a grid-based listing and the other is a long-form article.
- They have fundamentally different layout regions.

RESPOND WITH ONLY VALID JSON:
{
  "can_share": true|false,
  "reason": "Brief explanation",
  "confidence": 0.9
}`;

  const userPrompt = `HTML A:\n${htmlA.substring(0, 15000)}\n\nHTML B:\n${htmlB.substring(0, 15000)}`;

  try {
    return await generateText(systemPrompt, userPrompt, model);
  } catch (err) {
    console.error('[AI-Compare] Comparison failed:', err.message);
    return { can_share: false, reason: "Comparison error" };
  }
}

/**
 * Analyze a sample page using the Technical Content Engineer prompt.
 * Identifies editable regions, navigation, and media.
 */
export async function analyzeSiteImport(html, url = '', model = null, req = null, feedback = null) {
  const $ = (await import('cheerio')).load(html);

  // Clean non-visible elements
  $('script, style, noscript, svg, iframe, canvas, link[rel="stylesheet"], meta').remove();

  const cleanHtml = ($.html('body') || $.html())
    .replace(/\s+/g, ' ')
    .substring(0, 40000);

  const systemPrompt = `Role: You are a Technical Content Engineer specializing in CMS migrations.

Task: Analyze the provided HTML and identify content blocks that should be converted into editable fields.

Requirements:
1. Editable Fields: Identify headers, body text, and images.
2. Navigation: Specifically extract any <nav>, <ul>, or menu-related structures into a dedicated navigation property.
3. Format: Return the result as a single JSON-formatted string.

Schema Logic:
- content: Key-value pairs of IDs/Classes (the CSS selectors) and their inner HTML/text content.
- navigation: An array of objects containing label and url.
- media: Source URLs for any <img> tags found in editable areas.

${feedback ? `
CRITICAL - PREVIOUS ATTEMPT FAILED:
The following selectors were previously suggested but failed to match other pages in this group:
${JSON.stringify(feedback, null, 2)}
Please provide MORE RESILIENT selectors this time.
` : ''}

RESPOND WITH ONLY VALID JSON:
{
  "page_type": "product|article|blog_post|listing|contact|about|homepage|other",
  "content": {
    "CSS_SELECTOR_1": "Inner HTML or text",
    "CSS_SELECTOR_2": "..."
  },
  "navigation": [
    { "label": "Menu Item", "url": "/path" }
  ],
  "media": [
    "https://example.com/image.jpg"
  ],
  "confidence": 0.9,
  "summary": "1-sentence summary of the page layout"
}`;

  const userPrompt = `Input HTML: ${cleanHtml}`;

  try {
    return await generateText(systemPrompt, userPrompt, model, req);
  } catch (err) {
    console.error('[AI-Analyze] Technical Content Engineer analysis failed:', err.message);
    throw err;
  }
}

/**
 * REBUILD: Analyze React source code (Senior Systems Engineer persona)
 * Task: Scoped Content Extraction for WolfWave CMS.
 */
export async function analyzeLovableSource(code, filePath, model = null, req = null) {
  const systemPrompt = `Role: Senior Systems Engineer.
Project: WolfWave CMS.
Task: Analyze provided React source code (.tsx/.jsx) for a scoped content migration.

Requirements:
1. Discovery: Build a route manifest from the component structure.
2. Identify Primary Content Region: Look for the semantically dense area characterized by a high density of paragraphs (<p>), headings (<h1>-<h6>), and lists. Mark this as a single 'richtext' region.
3. EXCLUDE SUB-REGIONS: Once this Primary Content Region is identified, do NOT create any sub-regions for strings or images found INSIDE that block. They will be handled as part of the rich text.
4. Identify External Literals: Identify headlines, buttons, or metadata found OUTSIDE the Primary Content area.
5. STRICT CONSTRAINT: Do not rewrite or summarize. For 'text' types, extract the RAW string literal. For 'richtext' types, extract the FULL JSX/HTML SUB-TREE including all tags.
6. Categorize: Mark as 'text' (single string), 'richtext' (full HTML/JSX block), or 'image'.

RESPOND WITH ONLY VALID JSON:
{
  "page_type": "homepage|product|article|listing|other",
  "route_slug": "derived-from-filepath-or-code",
  "title": "Extracted Page Title",
  "regions": [
    {
      "key": "unique_camel_case_key",
      "label": "User-friendly label",
      "type": "text|richtext|image",
      "raw_value": "EXACT_LITERAL_OR_FULL_HTML_BLOCK"
    }
  ],
  "media_paths": ["/src/assets/image.png", "logo.svg"],
  "summary": "Technical layout summary"
}`;

  const userPrompt = `File Path: ${filePath}\n\nSource Code:\n${code}`;

  try {
    return await generateText(systemPrompt, userPrompt, model, req);
  } catch (err) {
    console.error('[WolfWave-Engineer] Source extraction failed:', err.message);
    throw err;
  }
}

/**
 * REBUILD: Convert React Component to WolfWave Nunjucks (Senior Systems Engineer persona)
 */
export async function convertReactToNunjucks(code, regions, pageType, styles = '', liveHtml = null, model = null) {
  const systemPrompt = `Role: Senior Systems Engineer.
Project: WolfWave CMS.
Task: Transpile React/JSX source code into a WolveWave Nunjucks (.njk) template, using Live Rendered HTML as the "Look & Feel" source of truth.

CRITICAL MANDATE:
- The LIVE RENDERED HTML provided below is exactly how the page must look.
- Use the React SOURCE CODE only to understand the dynamic logic, loops, and conditional content.
- Your output must be a Nunjucks template that produces the EXACT visual structure and CSS (Tailwind/Inline) of the Live Rendered HTML.

Requirements:
1. LAYOUT: You MUST extend the base layout and place all HTML within blocks.
   - Start the file with: {% extends "layouts/base.njk" %}
   - Place styles in: {% block styles %} ... styles here ... {% endblock %}
   - Place page HTML in: {% block content %} ... html here ... {% endblock %}
2. LOOK & FEEL: Capture every Tailwind class, inline style, and structural div from the Live Rendered HTML. Do not simplify the design.
3. GLOBAL STYLES: Include the provided global CSS styles in the {% block styles %} block.
4. NO MISSING PARTIALS: Do NOT use {% include "partials/..." %}. If the source code has a <Navbar /> or <Footer />, you MUST find their rendered equivalent in the Live HTML and transpile them directly into the template.
5. CMS INTEGRATION: Replace identified content regions (from the Source Code) with Nunjucks tags inside the structure derived from the Live HTML.
6. Logic Conversion: Replace React map() loops with Nunjucks {% for %} and ternary/if logic with {% if %}.
7. Path Mapping: 
   - Update all image src paths starting with '/src/assets/', 'src/assets/', or '/assets/' to start with '/uploads/assets/'.
   - Update all other root-relative paths like '/logo.png' (from the public folder) to start with '/uploads/'.

Format for regions:
- Text: <span data-cms-region="key" data-cms-type="text">{{ content.key | default('original_literal') }}</span>
- RichText: <div data-cms-region="key" data-cms-type="richtext">{{ content.key | safe }}</div>
- Image: <img data-cms-region="key" data-cms-type="image" src="{{ content.key | default('/uploads/assets/original') }}">

GLOBAL STYLES TO INCLUDE IN {% block styles %}:
${styles}

Return ONLY the Nunjucks code. No preamble.

IDENTIFIED REGIONS FOR INJECTION:
${JSON.stringify(regions, null, 2)}

LIVE RENDERED HTML (SOURCE OF TRUTH FOR DESIGN):
${liveHtml ? liveHtml.substring(0, 30000) : 'Not available - fallback to Source Code only'}
`;

  const userPrompt = `React Source Code:\n${code}`;

  try {
    return await generateRawText(systemPrompt, userPrompt, model);
  } catch (err) {
    console.error('[WolfWave-Engineer] Template transpilation failed:', err.message);
    throw err;
  }
}

/**
 * Analyze a site's homepage to identify platform, recommend CSS/JS assets to import,
 * detect fonts, and extract color palette.
 */
export async function analyzeSiteAssets(html, url = '', model = null, req = null) {
  const $ = (await import('cheerio')).load(html);

  // Extract raw asset references from <head> before cleaning
  const stylesheets = [];
  $('link[rel="stylesheet"]').each((i, el) => {
    const href = $(el).attr('href');
    if (href) stylesheets.push(href);
  });

  const scripts = [];
  $('script[src]').each((i, el) => {
    const src = $(el).attr('src');
    if (src) scripts.push(src);
  });

  // Extract inline style blocks for color analysis
  const inlineStyles = [];
  $('style').each((i, el) => {
    const css = $(el).html();
    if (css) inlineStyles.push(css.substring(0, 2000));
  });

  const systemPrompt = `You are a web technology analyst. Analyze a website's assets and technology stack.

Given a list of stylesheets, scripts, and HTML structure, determine:
1. What platform/CMS powers this site
2. Which CSS/JS files are worth importing (theme files vs third-party junk)
3. What fonts and colors the site uses

RESPOND WITH ONLY VALID JSON:
{
  "platform": "shopify|wordpress|woocommerce|squarespace|webflow|wix|magento|custom|unknown",
  "theme_name": "Name of the theme if identifiable, or null",
  "stylesheets": [
    { "url": "/path/to/file.css", "purpose": "Main theme styles", "recommend": true },
    { "url": "/path/to/vendor.css", "purpose": "Third-party library (Bootstrap etc)", "recommend": false }
  ],
  "scripts": [
    { "url": "/path/to/theme.js", "purpose": "Theme interaction/UI", "recommend": true }
  ],
  "fonts": ["Font Name 1", "Font Name 2"],
  "color_palette": ["#hex1", "#hex2", "#hex3"],
  "summary": "Brief description of the site's tech stack and design approach"
}

RULES:
- ONLY recommend CSS/JS that contains actual theme/design code — skip analytics, tracking, CDN libraries (jQuery, etc), chat widgets
- For Shopify: recommend theme CSS but NOT Shopify platform JS
- For WordPress: recommend theme CSS but NOT wp-includes or plugin boilerplate
- Identify Google Fonts, Adobe Fonts, or self-hosted fonts from stylesheet URLs and @font-face rules
- Extract dominant colors from inline CSS :root variables or common color declarations
- Be practical: fewer high-quality recommendations > long lists of everything`;

  const userPrompt = `URL: ${url}

STYLESHEETS:\n${stylesheets.map((s, i) => `${i + 1}. ${s}`).join('\n')}

SCRIPTS:\n${scripts.map((s, i) => `${i + 1}. ${s}`).join('\n')}

INLINE CSS (excerpts):\n${inlineStyles.join('\n---\n').substring(0, 5000)}

HTML STRUCTURE (head + body classes):\n${$('head').html()?.substring(0, 3000) || ''}\n<body class="${$('body').attr('class') || ''}">`;

  try {
    return await generateText(systemPrompt, userPrompt, model, req);
  } catch (err) {
    console.error('[AI-Analyze] Site asset analysis failed:', err.message);
    throw err;
  }
}

/**
 * Generate Theme (Existing)
 */
export async function generateThemeFromIndustry(industry) {
  // 1. Text Generation
  const systemPrompt = `You are a WebWolf Theme Architect. 
  Your goal is to generate a JSON object containing configuration and content for a new CMS theme based on an industry.
  
  Output JSON format:
  {
    "slug": "kebab-case-slug",
    "name": "Display Name",
    "description": "Short description",
    "css_variables": {
      "--nano-brand": "#hex",
      "--nano-bg": "#hex",
      "--nano-text": "#hex"
    },
    "content": {
      "headline": "High impact headline",
      "subtext": "Compelling subtext",
      "features": [
        { "title": "Feature 1", "body": "Description" },
        { "title": "Feature 2", "body": "Description" },
        { "title": "Feature 3", "body": "Description" }
      ],
      "hero_image_prompt": "A detailed DALL-E 3 prompt for a hero image for this industry. Modern, high quality, 16:9 aspect ratio."
    }
  }`;

  const themeData = await generateText(systemPrompt, `Create a theme for: ${industry}`);

  // 2. Image Generation
  let heroImagePath = '/images/placeholders/1920x600.svg';
  if (themeData.content.hero_image_prompt) {
    try {
      heroImagePath = await generateImage(themeData.content.hero_image_prompt);
    } catch (e) {
      console.warn("Skipping image generation due to error.");
    }
  }

  // 3. Construct File Data
  const themeFiles = {
    'theme.json': JSON.stringify({
      name: themeData.name,
      slug: themeData.slug,
      inherits: "ai-atomic",
      version: "1.0.0",
      description: themeData.description,
      assets: {
        css: ["assets/css/style.css"]
      }
    }, null, 2),

    'assets/css/style.css': `:root {
  --nano-brand: ${themeData.css_variables['--nano-brand']};
  --nano-bg: ${themeData.css_variables['--nano-bg']};
  --nano-text: ${themeData.css_variables['--nano-text']};
}
body { background-color: var(--nano-bg); color: var(--nano-text); }
.text-block h1 { color: var(--nano-brand); }
/* AI Generated Styles */
`,

    'pages/homepage.njk': `{% extends "layouts/base.njk" %}
{% block content %}
<main class="ai-generated-theme" data-industry="${themeData.slug}">
  
  <div class="text-block">
    <h1 data-cms-region="headline" data-cms-type="text">
      {{ content.headline | default("${themeData.content.headline}") }}
    </h1>
    <p data-cms-region="subtext" data-cms-type="textarea">
      {{ content.subtext | default("${themeData.content.subtext}") }}
    </p>
  </div>

  <div class="visual-block" data-cms-region="hero_image" data-cms-type="image">
    <img src="{{ content.hero_image | default('${heroImagePath}') }}" alt="${themeData.name} Hero">
  </div>

  <div class="feature-grid"
       data-cms-region="feature_grid"
       data-cms-type="repeater"
       data-cms-fields='[{"name":"title","type":"text"},{"name":"body","type":"textarea"}]'>
    {% for item in content.feature_grid %}
      <div class="feature-item"><h3>{{ item.title }}</h3><p>{{ item.body }}</p></div>
    {% else %}
      ${themeData.content.features.map(f => `
      <div class="feature-item">
        <h3>${f.title}</h3>
        <p>${f.body}</p>
      </div>`).join('')}
    {% endfor %}
  </div>

</main>
{% endblock %}`
  };

  return {
    slug: themeData.slug,
    files: themeFiles
  };
}
