# Plan: WolfImporter V2 - All-in-One AI-Powered Site & Theme Importer

## Overview
A new, standalone module for importing entire websites and their themes into WebWolf CMS. It leverages LLMs for platform discovery, content extraction rules, and Nunjucks template generation.

## Core Mandates
1. **Separation:** Completely independent of the legacy importer.
2. **LLM-First:** Heavy reliance on AI for analyzing structures and creating rules.
3. **Dual-HTML Storage:** Every page is stored as `raw_html` and `stripped_html` (headless, scriptless, styleless).
4. **Structural Analysis:** Pages are grouped by their structural DOM hash to optimize LLM calls.

## Architecture

### 1. Database Extensions
- `imported_sites`: Added `platform_info` (JSON) and `llm_ruleset` (JSON).
- `staged_items`: Added `stripped_html` (LongText) for cleaner AI analysis.

### 2. Core Engines (`server/services/importer-v2/`)
- **DiscoveryEngine**: Analyzes the root URL to detect platform (WP, Shopify, etc.), fonts, colors, and global assets.
- **CrawlEngine**: Recursive crawler that populates `staged_items`. Generates `stripped_html` and `structural_hash`.
- **RuleGenerator**: Groups pages by hash, samples them, and asks the LLM to provide CSS selectors for content mapping.
- **TemplateGenerator**: Uses LLM to convert sample HTML into WebWolf Nunjucks templates with dynamic tags.
- **TransformationEngine**: Applies the ruleset to create actual `content` and `pages/products` in the CMS.
- **ImporterServiceV2**: Orchestrator that runs the multi-phase process.

### 3. API (`server/api/import-v2.js`)
- `POST /api/import-v2` - Start an import.
- `GET /api/import-v2/sites/:id` - Monitor status and ruleset.
- `POST /api/import-v2/sites/:id/generate-rules` - Manual rule refresh.

## Implementation Status
- [x] Prisma Schema updates & migration.
- [x] Base service scaffolding.
- [x] DiscoveryEngine (LLM platform detection).
- [x] CrawlEngine (Dual-HTML storage + Hashing).
- [x] RuleGenerator (AI-driven selector mapping).
- [x] TemplateGenerator (AI-driven Nunjucks generation).
- [x] TransformationEngine (CMS data population).
- [x] API Route registration.
- [ ] Admin UI integration (Next Phase).

## Usage
Trigger via API:
```bash
curl -X POST http://localhost:3000/api/import-v2 -d '{"url": "https://example.com"}'
```
This will start the background process:
1. Detect Platform.
2. Crawl Site (storing raw and stripped HTML).
3. Group by Structure.
4. Generate Rules via LLM.
5. Create Templates.
6. (Optional) Transform to Content.
