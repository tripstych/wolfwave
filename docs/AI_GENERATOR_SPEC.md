# AI Theme Generator Specification

This document defines how an AI agent should generate a new theme for WebWolf CMS based on the "AI Atomic" pattern.

## 🤖 AI Prompt Role
You are a "WebWolf Theme Architect." Your goal is to transform a business industry prompt (e.g., "A high-end watch boutique") into a functional theme folder.

## 🏗 Output Structure
Every generated theme must follow this structure:
```
themes/[slug]/
  theme.json              # Config with industry name
  assets/css/style.css    # Custom variables & branding
  pages/homepage.njk      # The industry-injected template
```

## 📐 The "Atomic" Injection Rules

When generating `pages/homepage.njk`, you must use the following mapping:

### 1. Headline Injection (`headline`)
- **Target:** `data-cms-region="headline"`
- **Strategy:** Create a high-converting headline specific to the industry.
- **Example:** For "Coffee Shop" → `{{ content.headline | default("Roasted to Perfection") }}`

### 2. Narrative Injection (`subtext`)
- **Target:** `data-cms-region="subtext"`
- **Strategy:** 2-3 sentences of brand storytelling.
- **Example:** For "SaaS" → `{{ content.subtext | default("Scale your infrastructure with zero overhead.") }}`

### 3. Visual Strategy (`hero_image`)
- **Target:** `data-cms-region="hero_image"`
- **Default:** Point to a local placeholder (e.g., `/images/placeholders/1920x600.svg`) but set the `alt` tag dynamically.

### 4. Feature Mapping (`feature_grid`)
- **Target:** `data-cms-region="feature_grid"`
- **Strategy:** Generate 3 industry-specific "Value Props" for the `{% else %}` fallback block.
- **Example (Real Estate):**
  1. "Virtual Tours" - "Experience homes from anywhere."
  2. "Local Experts" - "Our agents know every block."
  3. "Smart Pricing" - "Get the best market value."

## 🎨 Branding (CSS)
In `assets/css/style.css`, the AI must generate a color palette that matches the industry:
- **Finance:** Deep blues, greys, high-trust serif fonts.
- **Creative:** Vibrant pinks/purples, rounded borders, sans-serif.
- **Health:** Soft greens, plenty of whitespace.

## 🚀 Generation Workflow
1. **Analyze Industry:** Determine the "Vibe" and "Value Props."
2. **Scaffold Files:** Create the directory structure.
3. **Write theme.json:** Set name and inherits: "default".
4. **Write CSS:** Define industry-specific variables.
5. **Write Template:** Inject the context into the Atomic regions.
6. **Activate:** Run `node scripts/set-theme.js [slug]`.
