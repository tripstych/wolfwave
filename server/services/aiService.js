import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '../../public');

// Configuration
const OPENAI_API_URL = process.env.OPENAI_API_URL || 'https://api.openai.com/v1';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

/**
 * Generate text content using an LLM
 */
export async function generateText(systemPrompt, userPrompt, model = 'gpt-4o') {
  // SIMULATION MODE
  if (!OPENAI_API_KEY || OPENAI_API_KEY === 'demo') {
    console.log(`[AI-DEBUG] 💡 Running in SIMULATION MODE (No API Key).`);
    await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate thinking
    
    // Simple heuristic to make the mock response feel "generated"
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

  console.log(`[AI-DEBUG] 🔑 API Key present: ${OPENAI_API_KEY.slice(0, 7)}...`);
  console.log(`[AI-DEBUG] 📤 Sending text generation request to ${model}...`);

  try {
    const response = await axios.post(
      `${OPENAI_API_URL}/chat/completions`,
      {
        model: model,
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
    console.error('[AI-DEBUG] ❌ AI Text Generation Error:', errorData || error.message);
    
    if (errorData?.error?.message) {
      throw new Error(`AI Error: ${errorData.error.message}`);
    }
    throw new Error('Failed to generate text content');
  }
}

/**
 * Generate an image using DALL-E 3
 * Downloads the image locally and returns the local path.
 */
export async function generateImage(prompt, size = "1024x1024") {
  // SIMULATION MODE
  if (!OPENAI_API_KEY || OPENAI_API_KEY === 'demo' || prompt === 'mock') {
    console.log(`[AI-DEBUG] 🎨 Image Gen: Simulation Mode active.`);
    return '/images/placeholders/1920x600.svg';
  }

  try {
    console.log(`[AI-DEBUG] 🎨 Generating image for: "${prompt}" (${size})...`);
    
    const response = await axios.post(
      `${OPENAI_API_URL}/images/generations`,
      {
        model: "dall-e-3",
        prompt: prompt,
        n: 1,
        size: size,
        response_format: "url", // We'll download it
      },
      {
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const imageUrl = response.data.data[0].url;
    console.log(`[AI-DEBUG] 📥 Image URL received. Downloading...`);

    const filename = `ai-${crypto.randomUUID()}.png`;
    const relativePath = `/images/generated/${filename}`;
    const absolutePath = path.join(PUBLIC_DIR, 'images', 'generated', filename);

    // Ensure directory exists
    await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true });

    // Download image
    const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    await fs.promises.writeFile(absolutePath, imageResponse.data);

    console.log(`[AI-DEBUG] ✅ Image saved locally to: ${absolutePath}`);
    return relativePath;

  } catch (error) {
    console.error('[AI-DEBUG] ❌ AI Image Generation Error:', error.response?.data || error.message);
    // Return a placeholder on failure so the process doesn't crash completely
    return '/images/placeholders/1024x1024.svg';
  }
}

/**
 * Generate content for a specific set of fields
 */
export async function generateContentForFields(fields, userContext, model = 'gpt-4o') {
  // SIMULATION MODE
  if (!OPENAI_API_KEY || OPENAI_API_KEY === 'demo') {
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

  return await generateText(systemPrompt, fullPrompt, model);
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
