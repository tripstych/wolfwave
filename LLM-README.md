# WebWolf CMS: LLM Architectural Blueprint

This document provides a concise, high-signal overview of the WebWolf CMS architecture to help LLM agents understand the system's structure, data flow, and "Lovable Importer" mechanics.

---

## 1. System Philosophy
WebWolf is a multi-tenant, "Look & Feel" first CMS designed to import industrial-grade sites (specifically Lovable.app/React exports) and turn them into editable, dynamic Nunjucks-based themes.

## 2. Technical Stack
- **Server:** Node.js (Express)
- **Database:** PostgreSQL (via Prisma for schema/logic, Raw SQL for tenant performance)
- **Templating:** Nunjucks (standalone document approach)
- **Admin UI:** React (Vite)
- **AI Integration:** Hybrid extraction (JSX source + Rendered HTML design truth)

## 3. Core Directory Structure
- `/admin`: React-based dashboard for managing content, themes, and imports.
- `/server`:
  - `/api`: REST endpoints for all CMS operations.
  - `/controllers`: Logic for rendering pages and managing shop/classifieds.
  - `/services`: Core business logic (AI, Media, Importers).
  - `/lib`: Low-level utilities (Prisma, Logger, Tenant Context, Pool Management).
- `/templates`:
  - `/layouts`: Base Nunjucks layouts (Note: Lovable imports are currently **standalone** and bypass these).
  - `/imported`: Tenant-specific templates generated via AI.
- `/uploads`: Multi-tenant storage. Files mapped to `/uploads/[tenant_subdomain]/`.

## 4. Multi-Tenancy Logic
WebWolf uses **Database-per-Tenant** isolation.
- **Middleware:** `server/middleware/tenant.js` resolves the tenant via subdomain.
- **Context:** Database calls MUST use `runWithTenant(dbName, ...)` or the Prisma client initialized with the tenant context.
- **Prisma:** Shared schema, isolated instances.

## 5. The Lovable Importer Pipeline (Hybrid Engine)
This is the most complex part of the app. It converts a React repository into a CMS theme.

### Phase 1: Discovery & Crawl (`LovableImporterService.js`)
- **RepoManager:** Clones the Git repo and scans for `.tsx/.jsx` files.
- **Live Crawl:** If a `liveUrl` is provided, `CrawlEngine` captures the *final rendered HTML* (browser output) to use as the design truth.

### Phase 2: Deterministic Mapping (`LovableRuleGenerator.js`)
- **Extraction:** AI analyzes React source code to find every string literal and text node. These become `regions`.
- **Mapping:** The generator maps these source-code regions to the structural HTML captured during the live crawl.

### Phase 3: Transpilation (`aiService.js` -> `convertReactToNunjucks`)
- **Standalone Templates:** Instead of extending a base layout, the AI generates a complete HTML document including `<head>`, `<body>`, and all Tailwind/CSS found in the live render.
- **Hole-Punching:** The AI replaces the extracted strings with `{{ content.key }}` tags.
- **Asset Localization:** Remote CSS/JS are downloaded to the local tenant upload folder.

## 6. Content Rendering
- `server/controllers/contentController.js`: The catch-all router.
- `server/lib/renderer.js`: Handles `themeRender`. It loads the Nunjucks environment for the active theme, resolves style overrides, and processes shortcodes (`[[block:slug]]`).

## 7. Development Mandates (From GEMINI.md)
1. **Never Stage/Commit:** Only perform code changes; let the human handle git.
2. **Empirical Reproduction:** For bugs, write a test case or script first.
3. **Prisma Sync:** If `schema.prisma` changes, run `npm run db:generate`.
4. **Tenant Safety:** Never assume a global database.

---

**Common Update Patterns:**
- *Adding a Region Type:* Update `aiService.js` prompt + `convertReactToNunjucks` mapping logic.
- *Changing Rendering:* Modify `server/lib/renderer.js` or `server/controllers/contentController.js`.
- *UI Updates:* Modify the React components in `/admin/src/`.
