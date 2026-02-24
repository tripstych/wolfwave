import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { logError, info } from '../lib/logger.js';
import { downloadImage } from './mediaService.js';
import { query } from '../db/connection.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '../../public');

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
       'gemini_model', 'ai_simulation_mode'
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
    ai_simulation_mode: settings.ai_simulation_mode === 'true' || process.env.AI_SIMULATION_MODE === 'true'
  };
}

/**
 * Generate text content using an LLM
 */
export async function generateText(systemPrompt, userPrompt, model = null, req = null) {
  const config = await getAiSettings();
  
  const hasNoKeys = !config.openai_api_key && !config.anthropic_api_key && !config.gemini_api_key;
  const isDemoKey = config.openai_api_key === 'demo' || config.anthropic_api_key === 'demo' || config.gemini_api_key === 'demo';

  // 1. SIMULATION MODE (Only if explicitly requested)
  if (config.ai_simulation_mode || (hasNoKeys && isDemoKey)) {
    console.log(`[AI-DEBUG] 💡 Running in SIMULATION MODE.`);
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    const industry = userPrompt.replace('Create a theme for:', '').trim();
    const slug = industry.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    
    return {
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
  }

  // 2. GEMINI MODE (AI Studio)
  if (config.gemini_api_key && config.gemini_api_key !== 'demo') {
    const geminiModel = model || config.gemini_model;
    info(req || 'system', 'AI_GEN_GEMINI', `Model: ${geminiModel}\nSystem: ${systemPrompt}\nUser: ${userPrompt.substring(0, 1000)}${userPrompt.length > 1000 ? '...' : ''}`);

    try {
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${config.gemini_api_key}`,
        {
          system_instruction: {
            parts: [{ text: systemPrompt + "\n\nCRITICAL: Return ONLY a valid JSON object. No preamble, no explanation." }]
          },
          contents: [
            { role: "user", parts: [{ text: userPrompt }] }
          ],
          generationConfig: {
            responseMimeType: "application/json"
          }
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      console.log(`[AI-DEBUG] 📥 Received response from Gemini.`);
      const content = response.data.candidates[0].content.parts[0].text;
      return JSON.parse(content);
    } catch (error) {
      const errorData = error.response?.data;
      logError(req || 'system', errorData || error, 'AI_TEXT_GEN_GEMINI');
      
      if (errorData?.error?.message) {
        throw new Error(`Gemini AI Error: ${errorData.error.message}`);
      }
      throw new Error(`Failed to generate content via Gemini: ${error.message}`);
    }
  }

  // 3. ANTHROPIC MODE (Prioritized if key exists)
  if (config.anthropic_api_key && config.anthropic_api_key !== 'demo') {
    const anthropicModel = model || 'claude-3-5-sonnet-20240620';
    info(req || 'system', 'AI_GEN_ANTHROPIC', `Model: ${anthropicModel}\nSystem: ${systemPrompt}\nUser: ${userPrompt.substring(0, 1000)}${userPrompt.length > 1000 ? '...' : ''}`);

    try {
      const response = await axios.post(
        config.anthropic_api_url,
        {
          model: anthropicModel,
          max_tokens: 4096,
          system: systemPrompt + "\n\nCRITICAL: Return ONLY a valid JSON object. No preamble, no explanation.",
          messages: [
            { role: 'user', content: userPrompt }
          ]
        },
        {
          headers: {
            'x-api-key': config.anthropic_api_key,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
        }
      );

      console.log(`[AI-DEBUG] 📥 Received response from Anthropic.`);
      const content = response.data.content[0].text;
      return JSON.parse(content);
    } catch (error) {
      const errorData = error.response?.data;
      logError(req || 'system', errorData || error, 'AI_TEXT_GEN_ANTHROPIC');
      
      if (errorData?.error?.message) {
        throw new Error(`Anthropic AI Error: ${errorData.error.message}`);
      }
      throw new Error(`Failed to generate content via Anthropic: ${error.message}`);
    }
  }

  // 3. OPENAI MODE (Fallback)
  if (config.openai_api_key && config.openai_api_key !== 'demo') {
    const openaiModel = model || 'gpt-4o';
    info(req || 'system', 'AI_GEN_OPENAI', `Model: ${openaiModel}\nSystem: ${systemPrompt}\nUser: ${userPrompt.substring(0, 1000)}${userPrompt.length > 1000 ? '...' : ''}`);

    try {
      const response = await axios.post(
        `${config.openai_api_url}/chat/completions`,
      {
        model: openaiModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: "json_object" },
        temperature: 0.7,
      },
      {
        headers: {
          'Authorization': `Bearer ${config.openai_api_key}`,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log(`[AI-DEBUG] 📥 Received response from OpenAI.`);
    const content = response.data.choices[0].message.content;
    return JSON.parse(content);
  } catch (error) {
    const errorData = error.response?.data;
    logError(req || 'system', errorData || error, 'AI_TEXT_GEN_OPENAI');
    
    if (errorData?.error?.message) {
      throw new Error(`OpenAI Error: ${errorData.error.message}`);
    }
    if (error.message) {
      throw new Error(`OpenAI Service Error: ${error.message}`);
    }
    throw new Error('Failed to generate text content');
    }
  }

  throw new Error('No valid AI Text Generation provider configured (Missing API Key)');
}

/**
 * Generate raw text content using an LLM (no JSON parsing).
 * Used for template conversion where the output is template code, not structured data.
 */
export async function generateRawText(systemPrompt, userPrompt, model = null) {
  const config = await getAiSettings();

  // Gemini
  if (config.gemini_api_key && config.gemini_api_key !== 'demo') {
    const geminiModel = model || config.gemini_model;
    info('system', 'AI_GEN_RAW_GEMINI', `Model: ${geminiModel}\nSystem: ${systemPrompt}\nUser: ${userPrompt.substring(0, 500)}...`);
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${config.gemini_api_key}`,
      {
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      },
      { headers: { 'Content-Type': 'application/json' } }
    );
    return response.data.candidates[0].content.parts[0].text;
  }

  // Anthropic
  if (config.anthropic_api_key && config.anthropic_api_key !== 'demo') {
    const anthropicModel = model || 'claude-3-5-sonnet-20240620';
    info('system', 'AI_GEN_RAW_ANTHROPIC', `Model: ${anthropicModel}\nSystem: ${systemPrompt}\nUser: ${userPrompt.substring(0, 500)}...`);
    const response = await axios.post(
      config.anthropic_api_url,
      {
        model: anthropicModel,
        max_tokens: 8192,
        system: systemPrompt,
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
    return response.data.content[0].text;
  }

  // OpenAI
  if (config.openai_api_key && config.openai_api_key !== 'demo') {
    const openaiModel = model || 'gpt-4o';
    info('system', 'AI_GEN_RAW_OPENAI', `Model: ${openaiModel}\nSystem: ${systemPrompt}\nUser: ${userPrompt.substring(0, 500)}...`);
    const response = await axios.post(
      `${config.openai_api_url}/chat/completions`,
      {
        model: openaiModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
      },
      {
        headers: {
          'Authorization': `Bearer ${config.openai_api_key}`,
          'Content-Type': 'application/json',
        },
      }
    );
    return response.data.choices[0].message.content;
  }

  throw new Error('No valid AI Text Generation provider configured (Missing API Key)');
}

/**
 * Generate an image using AI (DALL-E 3 or Gemini)
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

  // 1. GEMINI MODE (Vertex / AI Studio Imagen API)
  if (config.gemini_api_key && config.gemini_api_key !== 'demo') {
    // Discover available imagen models dynamically
    const availableModels = await discoverImagenModels(config.gemini_api_key);
    const modelsToTry = availableModels.length > 0
      ? availableModels
      : ['imagen-4.0-generate-preview-06-06', 'imagen-3.0-generate-002', 'imagen-3.0-generate-001'];

    console.log(`[AI-DEBUG] 🎨 Generating image via Gemini Imagen: "${prompt}" (models to try: ${modelsToTry.join(', ')})`);

    let lastError = null;
    for (const model of modelsToTry) {
      try {
        console.log(`[AI-DEBUG] Trying Imagen model: ${model}`);
        const response = await axios.post(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.gemini_api_key}`,
          {
            contents: [{ parts: [{ text: prompt }] }]
          },
          { timeout: 60000 }
        );

        // Gemini Imagen returns base64 data in the response
        const imageData = response.data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

        if (imageData) {
          console.log(`[AI-DEBUG] 📥 Base64 image received from Gemini (model: ${model}). Processing...`);
          const dataUri = `data:image/png;base64,${imageData}`;
          
          if (skipSave) {
            return dataUri;
          }

          const localUrl = await downloadMedia(dataUri, prompt, userId, true);

          console.log(`[AI-DEBUG] ✅ Gemini Image processed: ${localUrl}`);
          return localUrl;
        }

        throw new Error('Gemini returned no image data');
      } catch (e) {
        const errorMsg = e.response?.data?.error?.message || e.message;
        console.error(`[AI-DEBUG] ❌ Gemini model ${model} failed: ${errorMsg}`);
        lastError = errorMsg;

        // If model not found, clear cache so next call re-discovers
        if (e.response?.status === 404) {
          imagenModelsCache = null;
          imagenModelsCacheExpiry = 0;
        }
        // Continue to next model
      }
    }

    // All Gemini models exhausted
    if (!config.openai_api_key || config.openai_api_key === 'demo') {
      throw new Error(`Gemini Imagen Error: All models failed. Last error: ${lastError}`);
    }
    // Otherwise continue to DALL-E fallback
  }

  // 2. DALL-E 3 (Primary for now as it's more stable in AI Studio/OpenAI)
  if (config.openai_api_key && config.openai_api_key !== 'demo') {
    try {
      console.log(`[AI-DEBUG] 🎨 Generating image via DALL-E 3: "${prompt}"...`);
      
      const response = await axios.post(
        `${config.openai_api_url}/images/generations`,
        {
          model: "dall-e-3",
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
          timeout: 60000 // Image gen can be slow
        }
      );

      const imageUrl = response.data.data[0].url;
      console.log(`[AI-DEBUG] 📥 Image URL received. skipSave: ${skipSave}`);

      if (skipSave) {
        return imageUrl;
      }

      // Use mediaService to download and register in DB (strict: true)
      const localUrl = await downloadImage(imageUrl, prompt, userId, true);
      
      console.log(`[AI-DEBUG] ✅ Image processed: ${localUrl}`);
      return localUrl;

    } catch (error) {
      const errorData = error.response?.data;
      console.error('[AI-DEBUG] ❌ AI Image Generation Error:', errorData || error.message);
      
      if (errorData?.error?.message) {
        throw new Error(`AI Image Error: ${errorData.error.message}`);
      }
      throw new Error(`Failed to generate image: ${error.message}`);
    }
  }

  throw new Error(`No valid AI Image Generation provider configured. Gemini: ${config.gemini_api_key ? 'Present' : 'Missing'}, OpenAI: ${config.openai_api_key ? 'Present' : 'Missing'}, Anthropic: ${config.anthropic_api_key ? 'Present' : 'Missing'}`);
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
  // ... existing implementation ...
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
