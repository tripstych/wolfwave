# WebWolf Development Mandates

These rules are absolute and must be followed by Gemini CLI at all times to maintain system integrity.

## 1. Multi-Tenancy & Database Safety
- **Request Context:** All database operations performed during a web request MUST use the tenant-specific context. 
- **Service Layer:** Services (e.g., `siteService`, `menuService`) must never assume a single global database. They must utilize the `getCurrentDbName()` helper or receive the `req` object to ensure they are querying the correct tenant.
- **Raw SQL vs Prisma:** Only use raw SQL (`query`) when Prisma's type-safety is a blocker (e.g., dynamic column issues). Otherwise, prioritize Prisma but ensure the client is generated.

## 2. Prisma Lifecycle
- **Automatic Generation:** Whenever `prisma/schema.prisma` is modified, `npm run db:generate` MUST be executed immediately.
- **Migration Path:** Use `npm run db:migrate` which combines migration and generation to prevent "out of sync" ORM errors.

## 3. Settings & Styles Logic
- **Inheritance Hierarchy:** Always follow the strict hierarchy: `System Defaults` -> `Global Site Styles` -> `Template Overrides`.
- **Non-Destructive Merging:** Never use a naive spread operator (`...templateOptions`) if the template contains default/empty strings (like "Inter" or ""). These must be filtered out to prevent clobbering valid Global settings.

## 4. Logging & Error Visibility
- **Tenant Logs:** All errors MUST be logged using the `server/lib/logger.js` utility. This ensures errors are written to the specific tenant's `logs/cms/[tenant]/error.log`.
- **No Bare Catches:** Silent errors are unacceptable. If a process fails, it must be logged with enough context (e.g., `RENDER_CONTENT`, `STYLE_SYNC`) to diagnose the root cause immediately.

## 5. Verification
- **Empirical Proof:** After making a styling or configuration change, verify the output via "View Page Source" or server-side logs before declaring the task complete.

## 6. Project Context & Agility
- **End-Consumer Product:** The product is aimed towards the end consumer.
- **No Backwards Compatibility:** Currently, there are NO backwards compatibility concerns. Prioritize clean architecture and the best final user experience over preserving legacy fields or logic.
- **Sole Authority:** There is a sole developer and user in charge. Direct instructions override standard "best practices" if they conflict with the desired product direction.
