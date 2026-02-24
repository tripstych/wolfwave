# Plan: WordPress Theme ZIP Converter

## Goal
Add a feature that accepts a WordPress theme ZIP file, parses the PHP template files, and converts them into working Nunjucks templates that integrate with the existing WebWolf template system.

---

## How It Works (User Flow)

1. Admin goes to **Site Importer** page → new "Import WP Theme" tab/button
2. Uploads a `.zip` file (a standard WP theme export)
3. System extracts the ZIP, scans for PHP template files
4. Displays a preview: detected templates, theme name, screenshot (if present)
5. User clicks "Convert" → system generates `.njk` files and registers them in DB
6. Templates appear in the normal template list, ready for use

---

## Implementation

### 1. New Service: `server/services/wpThemeConverter.js`

The core conversion engine. Handles:

**A. ZIP Extraction & Theme Detection**
- Extract ZIP to a temp directory
- Find `style.css` to read theme metadata (Theme Name, Author, Version, Description)
- Identify the template hierarchy: `index.php`, `single.php`, `page.php`, `archive.php`, `header.php`, `footer.php`, `sidebar.php`, `functions.php`, `front-page.php`, `home.php`, `search.php`, `404.php`, `category.php`, `tag.php`
- Detect child theme (`Template:` header in style.css)

**B. PHP-to-Nunjucks Conversion**

Core tag mapping:

| WordPress PHP | Nunjucks Equivalent |
|---|---|
| `<?php get_header(); ?>` | `{% extends "layouts/base.njk" %}` (absorbed into base) |
| `<?php get_footer(); ?>` | (absorbed into base layout) |
| `<?php get_sidebar(); ?>` | `{% include "components/sidebar.njk" %}` |
| `<?php the_title(); ?>` | `{{ page.title }}` |
| `<?php the_content(); ?>` | `{{ content.main \| safe }}` with `data-cms-region="main"` |
| `<?php the_excerpt(); ?>` | `{{ content.excerpt }}` |
| `<?php the_permalink(); ?>` | `{{ page.slug }}` |
| `<?php the_post_thumbnail(); ?>` | `{{ content.featured_image }}` |
| `<?php bloginfo('name'); ?>` | `{{ site.site_name }}` |
| `<?php bloginfo('description'); ?>` | `{{ site.default_meta_description }}` |
| `<?php the_date(); ?>` / `the_time()` | `{{ page.published_at \| date("F j, Y") }}` |
| `<?php the_author(); ?>` | `{{ content.author }}` |
| `<?php the_category(); ?>` | `{{ content.category }}` |
| `<?php the_tags(); ?>` | `{{ content.tags }}` |
| `<?php comments_template(); ?>` | (omitted or placeholder comment) |
| `<?php wp_head(); ?>` | (absorbed into base `<head>`) |
| `<?php wp_footer(); ?>` | (absorbed into base footer) |
| `<?php wp_nav_menu(...); ?>` | `{% include "components/nav.njk" %}` (uses existing menu system) |
| `<?php if (have_posts()) : while (have_posts()) : the_post(); ?>` | `{% for post in posts %}` |
| `<?php endwhile; endif; ?>` | `{% endfor %}` |
| `<?php get_template_part('content', get_post_format()); ?>` | `{% include "components/content.njk" %}` |
| `<?php dynamic_sidebar('sidebar-1'); ?>` | `{{ renderBlock('sidebar') \| safe }}` |
| `<?php if (is_single()) : ?>` | `{% if page.type == 'post' %}` |
| `<?php if (is_page()) : ?>` | `{% if page.type == 'page' %}` |
| `<?php echo esc_html(...); ?>` | `{{ ... }}` (auto-escaped by Nunjucks) |
| `<?php echo esc_url(...); ?>` | `{{ ... }}` |
| Generic `<?php echo $var; ?>` | `{{ var }}` |
| `<?php if (...) : ?>` | `{% if ... %}` |
| `<?php else : ?>` | `{% else %}` |
| `<?php endif; ?>` | `{% endif %}` |
| `<?php foreach ($items as $item) : ?>` | `{% for item in items %}` |
| `<?php endforeach; ?>` | `{% endfor %}` |

**C. CSS Extraction**
- Parse `style.css` and any enqueued stylesheets referenced in `functions.php`
- Extract color values, font families, sizing → map to WebWolf CSS custom properties (`--cms-primary-color`, `--cms-font-body`, etc.)
- Inline the theme's custom CSS into the `{% block styles %}` section of each template
- Copy referenced assets (images, fonts) to `/uploads/theme-assets/`

**D. Template File Mapping**

| WP File | Generated WebWolf File | Content Type |
|---|---|---|
| `header.php` + `footer.php` | `layouts/wp-{theme-name}.njk` (new base layout) | layout |
| `page.php` | `pages/wp-{theme-name}-page.njk` | pages |
| `single.php` | `posts/wp-{theme-name}-post.njk` | posts |
| `archive.php` / `category.php` | `posts/wp-{theme-name}-archive.njk` | posts |
| `front-page.php` / `home.php` | `pages/wp-{theme-name}-home.njk` | pages |
| `search.php` | `pages/wp-{theme-name}-search.njk` | pages |
| `404.php` | `pages/wp-{theme-name}-404.njk` | pages |
| `sidebar.php` | `components/wp-{theme-name}-sidebar.njk` | (partial) |
| Template parts (`template-parts/*.php`) | `components/wp-{theme-name}-{part}.njk` | (partial) |

**E. Region Auto-Detection**
- When converting `the_content()` → add `data-cms-region="main" data-cms-type="richtext"`
- When converting `the_title()` → add `data-cms-region="page_title" data-cms-type="text"`
- When converting `the_excerpt()` → add `data-cms-region="excerpt" data-cms-type="textarea"`
- When converting `the_post_thumbnail()` → add `data-cms-region="featured_image" data-cms-type="image"`
- Any custom fields from `get_post_meta()` → add as additional regions

### 2. New API Endpoint: Add to `server/api/import.js`

```
POST /import/wp-theme
```
- Accepts multipart form upload (ZIP file)
- Extracts, converts, writes `.njk` files to `templates/` directory
- Registers templates in DB via `prisma.templates.upsert()`
- Triggers `syncTemplatesToDb()` to register content types
- Returns list of generated templates

```
GET /import/wp-theme/preview
```
- Accepts ZIP, returns analysis without writing anything (theme name, detected files, preview of conversion)

### 3. Admin UI: Update `admin/src/pages/SiteImporter.jsx`

Add a new section/tab "Import WP Theme":
- File upload dropzone for `.zip`
- Preview panel showing:
  - Theme name, author, version
  - List of detected PHP templates with → arrow showing target Nunjucks file
  - Checkbox to select which templates to convert
  - Theme colors/fonts detected
- "Convert & Import" button
- Progress indicator
- Success view with links to the new templates

### 4. Files to Create
- `server/services/wpThemeConverter.js` — Core converter logic
- `server/lib/phpToNunjucks.js` — PHP→Nunjucks transpilation rules (regex-based, not a full PHP parser)

### 5. Files to Modify
- `server/api/import.js` — Add the two new endpoints
- `admin/src/pages/SiteImporter.jsx` — Add WP Theme upload UI tab
- `package.json` — Add `adm-zip` dependency (or use `unzipper`)

---

## Technical Approach for PHP Conversion

The converter is **regex/pattern-based**, not a full PHP AST parser. WordPress themes follow very predictable patterns. The strategy:

1. Read each PHP file as a string
2. Apply conversion rules in order (most specific first → most generic last)
3. Handle `get_header()` / `get_footer()` by compositing `header.php` + template + `footer.php` into a base layout
4. Strip PHP that has no Nunjucks equivalent (plugin hooks like `do_action()`, `wp_enqueue_script()`, etc.)
5. Preserve all HTML/CSS structure intact — only the PHP interpolation changes
6. Add `data-cms-region` attributes to converted content areas

This approach handles 80-90% of standard WP themes cleanly. Edge cases (complex PHP logic, plugin shortcodes, custom queries) get converted to comments like `{# WP: unsupported — original: <?php complex_function(); ?> #}` so the user can manually address them.

---

## Conversion Pipeline (Order of Operations)

1. Extract ZIP → temp dir
2. Read `style.css` → theme metadata
3. Read `header.php` + `footer.php` → generate base layout
4. For each content template (`page.php`, `single.php`, etc.):
   a. Read PHP source
   b. Remove `get_header()` / `get_footer()` calls
   c. Apply PHP→Nunjucks conversion rules
   d. Wrap in `{% extends "layouts/wp-{theme}.njk" %}` + `{% block content %}`
   e. Auto-detect and add `data-cms-region` attributes
   f. Write to `templates/{content_type}/wp-{theme}-{name}.njk`
5. Extract and process CSS → generate template options
6. Register all templates in DB
7. Cleanup temp dir
