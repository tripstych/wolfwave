# Template Documentation

WebWolf CMS uses [Nunjucks](https://mozilla.github.io/nunjucks/) for templating. Templates live in `themes/<theme-name>/` and are organized by type.

---

## Directory Structure

```
themes/default/
  theme.json              # Theme config (name, slug, version, assets, inherits)
  assets/
    css/                  # Theme stylesheets (auto-loaded via theme.json)
    js/                   # Theme scripts (auto-loaded via theme.json)
  layouts/
    base.njk              # Base HTML layout — all templates extend this
  pages/                  # Page templates
  products/               # Product templates
  blocks/                 # Reusable block templates
  customer/               # Customer account templates
  shop/                   # Cart, checkout, order confirmation
  partials/               # Includable fragments
  components/             # Reusable UI components
```

### Theme Inheritance

Themes can extend other themes via `theme.json`:

```json
{
  "name": "My Theme",
  "slug": "my-theme",
  "inherits": "default"
}
```

Template resolution checks the child theme first, then falls back to the parent. Parent CSS loads before child CSS for cascading overrides.

---

## Writing a Template

Every page template extends the base layout and fills in blocks:

```njk
{% extends "layouts/base.njk" %}

{% block styles %}
.my-page { padding: 2rem 0; }
{% endblock %}

{% block content %}
<div class="my-page">
  <h1 data-cms-region="title" data-cms-type="text" data-cms-label="Page Title">
    {{ content.title | default(page.title) }}
  </h1>

  <div data-cms-region="body" data-cms-type="richtext" data-cms-label="Body">
    {{ content.body | safe | default('<p>Content goes here.</p>') }}
  </div>
</div>
{% endblock %}

{% block scripts %}
<script>console.log('page loaded');</script>
{% endblock %}
```

The base layout provides three blocks: `styles`, `content`, and `scripts`.

---

## Editable Regions (data-cms-* attributes)

Add `data-cms-*` attributes to any HTML element to make it editable in the admin. The template scanner reads these to build the editing UI.

### Attributes

| Attribute | Required | Description |
|-----------|----------|-------------|
| `data-cms-region="name"` | Yes | Unique field identifier (snake_case) |
| `data-cms-type="type"` | No | Field type (default: `text`) |
| `data-cms-label="Label"` | No | Admin UI label (default: auto from name) |
| `data-cms-required="true"` | No | Mark as required |
| `data-cms-placeholder="text"` | No | Placeholder text |
| `data-cms-fields="json"` | No | Sub-fields for repeater type |

### Field Types

**`text`** — Single-line text input
```njk
<h1 data-cms-region="hero_title" data-cms-type="text" data-cms-label="Hero Title">
  {{ content.hero_title | default('Welcome') }}
</h1>
```

**`textarea`** — Multi-line plain text
```njk
<p data-cms-region="excerpt" data-cms-type="textarea" data-cms-label="Excerpt">
  {{ content.excerpt }}
</p>
```

**`richtext`** — Rich text editor (HTML output, use `| safe`)
```njk
<div data-cms-region="body" data-cms-type="richtext" data-cms-label="Body Content">
  {{ content.body | safe | default('<p>Content here.</p>') }}
</div>
```

**`image`** — Image uploader
```njk
<img src="{{ content.hero_image }}"
     alt="{{ content.hero_title }}"
     data-cms-region="hero_image"
     data-cms-type="image"
     data-cms-label="Hero Image">
```

**`repeater`** — Repeatable group of fields
```njk
<div data-cms-region="features"
     data-cms-type="repeater"
     data-cms-label="Features"
     data-cms-fields='[
       {"name":"title","type":"text","label":"Title"},
       {"name":"description","type":"textarea","label":"Description"},
       {"name":"icon","type":"image","label":"Icon"}
     ]'>
  {% for feature in content.features %}
  <div class="feature">
    <img src="{{ feature.icon }}" alt="">
    <h3>{{ feature.title }}</h3>
    <p>{{ feature.description }}</p>
  </div>
  {% endfor %}
</div>
```

> In HTML attributes, encode quotes as `&quot;` — Nunjucks handles this automatically when the attribute is in the source.

---

## Context Variables

### Available Everywhere

| Variable | Type | Description |
|----------|------|-------------|
| `site` | Object | Site settings from the database |
| `site.site_name` | String | Site name |
| `site.site_url` | String | Site URL |
| `site.active_theme` | String | Current theme slug |
| `site.home_page_id` | Number | Home page ID |
| `site.google_analytics_id` | String | GA tracking ID |
| `menus` | Object | All menus, keyed by slug |
| `blocks` | Array | All block objects |
| `customer` | Object/null | Logged-in customer, or null |
| `hasActiveSubscription` | Boolean | Whether customer has an active subscription |
| `theme_css` | Array | CSS file URLs to load |
| `theme_js` | Array | JS file URLs to load |
| `user` | Object/null | Admin/editor user (for edit-in-place UI) |

### Page Templates

| Variable | Type | Description |
|----------|------|-------------|
| `page` | Object | Page record from the database |
| `page.id` | Number | Page ID |
| `page.title` | String | Page title |
| `page.status` | String | `'published'`, `'draft'`, `'archived'` |
| `page.published_at` | Date | Publication date |
| `page.template_filename` | String | Template file path |
| `content` | Object | Parsed content data (your editable fields) |
| `content_type` | String | Module name: `'pages'`, `'products'`, etc. |
| `seo` | Object | SEO metadata (see below) |
| `subscription_required` | Boolean | Content is gated and customer lacks subscription |

### Product Templates

All page variables above, plus:

| Variable | Type | Description |
|----------|------|-------------|
| `product` | Object | Alias for `page` on product templates |
| `product.price` | Decimal | Product price |
| `product.compare_at_price` | Decimal | Sale comparison price |
| `product.sku` | String | SKU |
| `product.inventory_quantity` | Number | Stock count |
| `product.inventory_tracking` | Boolean | Whether stock is tracked |
| `product.allow_backorder` | Boolean | Allow purchase when out of stock |
| `product.weight` | Decimal | Product weight |
| `product.weight_unit` | String | `'lb'`, `'kg'`, `'oz'`, `'g'` |
| `product.taxable` | Boolean | Whether product is taxable |
| `product.requires_shipping` | Boolean | Requires shipping |
| `product.variants` | Array | Product variants |

Each variant:

| Field | Type | Description |
|-------|------|-------------|
| `id` | Number | Variant ID |
| `sku` | String | Variant SKU |
| `price` | Decimal | Variant-specific price (null = use product price) |
| `inventory_quantity` | Number | Variant stock |
| `option1_name` / `option1_value` | String | First option (e.g. "Size" / "Large") |
| `option2_name` / `option2_value` | String | Second option |
| `option3_name` / `option3_value` | String | Third option |
| `image` | String | Variant-specific image URL |

### SEO Object

```njk
{{ seo.title }}                  {# Meta title #}
{{ seo.description }}            {# Meta description #}
{{ seo.canonical }}              {# Canonical URL #}
{{ seo.robots }}                 {# Robots directive #}
{{ seo.og.title }}               {# Open Graph title #}
{{ seo.og.description }}         {# Open Graph description #}
{{ seo.og.image }}               {# Open Graph image #}
{{ seo.og.url }}                 {# Open Graph URL #}
{{ seo.schema }}                 {# JSON-LD schema object #}
```

### Menus

```njk
{% for item in menus['main-nav'].items %}
  <a href="{{ item.url }}" target="{{ item.target }}">{{ item.title }}</a>
  {% if item.children.length %}
    <ul>
      {% for child in item.children %}
        <a href="{{ child.url }}">{{ child.title }}</a>
      {% endfor %}
    </ul>
  {% endif %}
{% endfor %}
```

### Customer

```njk
{% if customer %}
  <p>Welcome, {{ customer.first_name }}!</p>

  {% if customer.subscription %}
    <p>Plan: {{ customer.subscription.plan.name }}</p>
    <p>Status: {{ customer.subscription.status }}</p>
    <p>Renews: {{ customer.subscription.current_period_end | date("MMM D, YYYY") }}</p>
  {% endif %}
{% else %}
  <a href="/customer/login">Log in</a>
{% endif %}
```

---

## Filters

### `date`

Formats dates using [moment.js format tokens](https://momentjs.com/docs/#/displaying/format/).

```njk
{{ page.published_at | date("MMMM D, YYYY") }}    → February 18, 2026
{{ page.published_at | date("MMM D, YYYY") }}      → Feb 18, 2026
{{ page.published_at | date("MM/DD/YYYY") }}        → 02/18/2026
{{ page.published_at | date("dddd, MMMM Do") }}     → Wednesday, February 18th
{{ page.published_at | date("YYYY-MM-DD") }}         → 2026-02-18
{{ page.published_at | date("h:mm A") }}             → 3:45 PM
```

Default format (no argument): `YYYY-MM-DD`

### `truncate`

Truncates text to a maximum length with ellipsis.

```njk
{{ content.description | truncate(100) }}   → "First 100 characters..."
```

### `stripHtml`

Removes all HTML tags from a string.

```njk
{{ content.body | stripHtml }}   → plain text, no tags
```

### `safe`

Built-in Nunjucks filter. Prevents HTML escaping — required for richtext fields.

```njk
{{ content.body | safe }}
```

### `default`

Built-in Nunjucks filter. Provides a fallback value.

```njk
{{ content.title | default('Untitled') }}
```

### `dump`

Built-in Nunjucks filter. Serializes to JSON — useful for schema markup or debugging.

```njk
<script type="application/ld+json">{{ seo.schema | dump | safe }}</script>
```

---

## Global Functions

### Fetching Products

```njk
{# Single product by ID #}
{% set product = getProduct(5) %}

{# Single product by slug #}
{% set product = getProductBySlug('/products/cool-shirt') %}

{# Multiple products by IDs #}
{% set products = getProductsByIds([1, 2, 3]) %}

{# Active products (with optional limit) #}
{% set products = getProductsByCategory('all', 6) %}
```

### Fetching Pages

```njk
{# Single page by ID #}
{% set aboutPage = getPage(10) %}

{# Single page by slug #}
{% set aboutPage = getPageBySlug('/pages/about') %}

{# Multiple pages by IDs #}
{% set pages = getPagesByIds([1, 2, 3]) %}

{# Pages by content type (module) #}
{% set blogPosts = getPagesByType('pages', 5) %}
```

### Rendering Blocks

Blocks are reusable template fragments managed in the admin.

```njk
{{ renderBlock('cta') | safe }}
{{ renderBlock('newsletter-signup') | safe }}
```

### Subscription Plans

```njk
{% set plans = getSubscriptionPlans() %}
{% for plan in plans %}
  <div class="plan">
    <h3>{{ plan.name }}</h3>
    <p>${{ plan.price }}/{{ plan.interval }}</p>
    {% for feature in plan.features %}
      <li>{{ feature }}</li>
    {% endfor %}
  </div>
{% endfor %}
```

---

## Subscription Gating

Mark content as subscription-only in the admin. The `subscription_required` variable will be `true` when a visitor doesn't have an active subscription.

```njk
{% if subscription_required %}
  <div class="paywall">
    <p>This content is for subscribers only.</p>
    <a href="/subscribe">Subscribe Now</a>
  </div>
{% else %}
  <div class="premium-content">
    {{ content.body | safe }}
  </div>
{% endif %}
```

---

## URL Routing

Content slugs are stored in the `content` table and map directly to URLs:

| Slug | URL |
|------|-----|
| `/pages/about` | `http://site.com/about` or `http://site.com/pages/about` |
| `/blog/my-post` | `http://site.com/blog/my-post` |
| `/products/cool-shirt` | `http://site.com/products/cool-shirt` |

The router looks up the exact slug first, then tries with a `/pages` prefix as a fallback. The `content.module` field determines which database table to query — the URL structure does not dictate the module.

### Module Index Pages

Visiting `/products` or `/pages` renders the corresponding `index.njk` template with all content for that module.

---

## Template Syncing

Templates are synced from the filesystem to the database. The content type is derived from the top-level folder name:

- `pages/homepage.njk` → content type `pages`
- `products/product-single.njk` → content type `products`
- `blocks/CTA.njk` → content type `blocks`

Sync via the admin API:

```
POST /api/templates/sync
```

This scans all `.njk` files, extracts `data-cms-*` regions, and upserts template records. New content types are auto-registered.
