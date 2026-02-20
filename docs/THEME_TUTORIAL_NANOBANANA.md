# How to Create a Custom Theme: "Nanobanana" Tutorial

This guide walks you through creating a new custom theme called "Nanobanana" from scratch. This demonstrates the core concepts of WebWolf CMS theming.

## 1. Directory Structure

Themes live in the `themes/` directory. Each theme needs its own folder.

**Action:** Created `themes/nanobanana/`.

## 2. Theme Configuration (theme.json)

Every theme requires a `theme.json` file to define its metadata and assets.

**File:** `themes/nanobanana/theme.json`

```json
{
  "name": "Nanobanana",
  "slug": "nanobanana",
  "inherits": "default",
  "version": "1.0.0",
  "description": "A fun, vibrant, and playful theme for creative projects.",
  "assets": {
    "css": ["assets/css/nanobanana.css"],
    "js": ["assets/js/nanobanana.js"]
  }
}
```

*   **inherits:** We extend the "default" theme so we don't have to rewrite the base layout (`layouts/base.njk`) or basic styles unless we want to override them.
*   **assets:** We register a custom CSS and JS file that will be automatically loaded by the base layout.

## 3. Custom Styles & Scripts

We added custom "playful" styling to demonstrate how to override the look and feel.

**File:** `themes/nanobanana/assets/css/nanobanana.css`
*   Defined custom variables like `--nano-yellow`.
*   Added fun hover effects and borders.

**File:** `themes/nanobanana/assets/js/nanobanana.js`
*   Added simple interaction logic (e.g., random rotation on hover).

## 4. Page Templates

We created a custom homepage template that defines the editable regions for the CMS.

**File:** `themes/nanobanana/pages/homepage.njk`

```njk
{% extends "layouts/base.njk" %}

{% block content %}
  <div class="nano-hero">
    <h1 data-cms-region="hero_title" data-cms-type="text" data-cms-label="Hero Title">
      {{ content.hero_title | default('Go Nano!') }}
    </h1>
    <!-- More content... -->
  </div>
{% endblock %}
```

*   **Extends:** `layouts/base.njk` (inherited from the default theme).
*   **data-cms-region:** This attribute tells WebWolf to make this element editable in the Admin UI.
*   **content.field_name:** This is how we output the content saved by the user.

## 5. Activating the Theme

To use the new "Nanobanana" theme:

### Option A: Via Admin Panel
1.  Go to **Settings > Themes**.
2.  Find "Nanobanana" in the list.
3.  Click **Activate**.

### Option B: Via CLI
Run the helper script we created:
```bash
node scripts/set-theme.js nanobanana
```

This will:
1.  Update the site settings to use `nanobanana`.
2.  Clear the internal cache.
3.  Sync the new template fields to the database.

## 6. Editing Content

Once activated:
1.  Go to **Pages > Home** in the Admin.
2.  You will see the new fields defined in `homepage.njk` (Hero Title, CTA, Features Repeater).
3.  Edit the content and click Save.
4.  View your site to see the "Nanobanana" design in action!
