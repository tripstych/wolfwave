import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { logError } from '../lib/logger.js';
import { downloadImage } from './mediaService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '../../public');

// Configuration
const OPENAI_API_URL = process.env.OPENAI_API_URL || 'https://api.openai.com/v1';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

/**
 * Generate text content using an LLM
 */
export async function generateText(systemPrompt, userPrompt, model = null, req = null) {
  const isSimulationExplicit = process.env.AI_SIMULATION_MODE === 'true';
  const hasNoKeys = !OPENAI_API_KEY && !ANTHROPIC_API_KEY && !GEMINI_API_KEY;
  const isDemoKey = OPENAI_API_KEY === 'demo' || ANTHROPIC_API_KEY === 'demo' || GEMINI_API_KEY === 'demo';

  // 1. SIMULATION MODE (Only if explicitly requested)
  if (isSimulationExplicit || (hasNoKeys && isDemoKey)) {
    console.log(`[AI-DEBUG] 💡 Running in SIMULATION MODE (Explicitly Enabled).`);
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
  if (GEMINI_API_KEY && GEMINI_API_KEY !== 'demo') {
    const geminiModel = model || GEMINI_MODEL;
    console.log(`[AI-DEBUG] 🔑 Gemini Key present. Sending request to ${geminiModel}...`);

    try {
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${GEMINI_API_KEY}`,
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
  if (ANTHROPIC_API_KEY && ANTHROPIC_API_KEY !== 'demo') {
    const anthropicModel = model || 'claude-3-5-sonnet-20240620';
    console.log(`[AI-DEBUG] 🔑 Anthropic Key present. Sending request to ${anthropicModel}...`);

    try {
      const response = await axios.post(
        ANTHROPIC_API_URL,
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
            'x-api-key': ANTHROPIC_API_KEY,
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
  if (OPENAI_API_KEY && OPENAI_API_KEY !== 'demo') {
    const openaiModel = model || 'gpt-4o';
    console.log(`[AI-DEBUG] 🔑 OpenAI Key present. Sending request to ${openaiModel}...`);

    try {
      const response = await axios.post(
        `${OPENAI_API_URL}/chat/completions`,
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
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
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
  // Gemini
  if (GEMINI_API_KEY && GEMINI_API_KEY !== 'demo') {
    const geminiModel = model || GEMINI_MODEL;
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${GEMINI_API_KEY}`,
      {
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      },
      { headers: { 'Content-Type': 'application/json' } }
    );
    return response.data.candidates[0].content.parts[0].text;
  }

  // Anthropic
  if (ANTHROPIC_API_KEY && ANTHROPIC_API_KEY !== 'demo') {
    const anthropicModel = model || 'claude-3-5-sonnet-20240620';
    const response = await axios.post(
      ANTHROPIC_API_URL,
      {
        model: anthropicModel,
        max_tokens: 8192,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      },
      {
        headers: {
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
      }
    );
    return response.data.content[0].text;
  }

  // OpenAI
  if (OPENAI_API_KEY && OPENAI_API_KEY !== 'demo') {
    const openaiModel = model || 'gpt-4o';
    const response = await axios.post(
      `${OPENAI_API_URL}/chat/completions`,
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
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
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
export async function generateImage(prompt, size = "1024x1024", userId = null) {
  const isSimulationExplicit = process.env.AI_SIMULATION_MODE === 'true';
  const hasNoKeys = !OPENAI_API_KEY && !GEMINI_API_KEY;
  const isDemoKey = OPENAI_API_KEY === 'demo' || GEMINI_API_KEY === 'demo';

  // SIMULATION MODE
  if (isSimulationExplicit || (hasNoKeys && isDemoKey) || prompt === 'mock') {
    console.log(`[AI-DEBUG] 🎨 Image Gen: Simulation Mode active.`);
    return '/images/placeholders/800x450.svg';
  }

  // 1. GEMINI MODE (Vertex / AI Studio Imagen API)
  if (GEMINI_API_KEY && GEMINI_API_KEY !== 'demo') {
    console.log(`[AI-DEBUG] 🎨 Generating image via Gemini Imagen: "${prompt}"...`);
    try {
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-001:generateContent?key=${GEMINI_API_KEY}`,
        {
          contents: [{ parts: [{ text: prompt }] }]
        },
        { timeout: 60000 }
      );

      // Gemini Imagen returns base64 data in the response
      const imageData = response.data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      
      if (imageData) {
        console.log(`[AI-DEBUG] 📥 Base64 image received from Gemini. Processing...`);
        // We'll create a data URI to pass to our existing downloadMedia logic, 
        // or we could refactor downloadMedia to handle buffers. 
        // For simplicity and minimal change to working logic, data URI works:
        const dataUri = `data:image/png;base64,${imageData}`;
        const localUrl = await downloadMedia(dataUri, prompt, userId, true);
        
        console.log(`[AI-DEBUG] ✅ Gemini Image processed: ${localUrl}`);
        return localUrl;
      }
      
      console.log(`[AI-DEBUG] ⚠️ Gemini returned no image data, trying fallback...`);
    } catch (e) {
      const errorMsg = e.response?.data?.error?.message || e.message;
      console.log(`[AI-DEBUG] ⚠️ Gemini Image Gen failed: ${errorMsg}`);
      // If they don't have OpenAI, this will eventually hit the final throw
    }
  }

  // 2. DALL-E 3 (Primary for now as it's more stable in AI Studio/OpenAI)
  if (OPENAI_API_KEY && OPENAI_API_KEY !== 'demo') {
    try {
      console.log(`[AI-DEBUG] 🎨 Generating image via DALL-E 3: "${prompt}"...`);
      
      const response = await axios.post(
        `${OPENAI_API_URL}/images/generations`,
        {
          model: "dall-e-3",
          prompt: prompt,
          n: 1,
          size: size,
          response_format: "url",
        },
        {
          headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          timeout: 60000 // Image gen can be slow
        }
      );

      const imageUrl = response.data.data[0].url;
      console.log(`[AI-DEBUG] 📥 Image URL received. Downloading via mediaService...`);

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

  throw new Error('No valid AI Image Generation provider configured (Missing API Key)');
}

/**
 * Generate content for a specific set of fields
 */
export async function generateContentForFields(fields, userContext, model = null, req = null) {
  const isSimulationExplicit = process.env.AI_SIMULATION_MODE === 'true';
  const hasNoKeys = !OPENAI_API_KEY && !ANTHROPIC_API_KEY && !GEMINI_API_KEY;
  const isDemoKey = OPENAI_API_KEY === 'demo' || ANTHROPIC_API_KEY === 'demo' || GEMINI_API_KEY === 'demo';

  // SIMULATION MODE
  if (isSimulationExplicit || (hasNoKeys && isDemoKey)) {
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
  const isDemo = (!OPENAI_API_KEY || OPENAI_API_KEY === 'demo') && (!ANTHROPIC_API_KEY || ANTHROPIC_API_KEY === 'demo');

  if (isDemo) {
    const mock = {};
    fields.forEach(f => {
      if (f.name === 'title') mock[f.name] = 'h1';
      else if (f.name.includes('price')) mock[f.name] = '.price';
      else if (f.name.includes('description')) mock[f.name] = '.product-description';
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
