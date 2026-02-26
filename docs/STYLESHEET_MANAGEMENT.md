# Stylesheet Management

This document explains how to manage the external stylesheets for templates in WebWolf CMS.

## Overview

Template styles have been extracted from inline `<style>` blocks into separate CSS files for easier editing and maintenance.

## Stylesheet System

WebWolf CMS uses a **database-backed stylesheet system** that allows you to:
- Edit CSS through the admin UI or directly in files
- Sync changes between filesystem and database
- Manage site-specific and global stylesheets
- Control load order and activation status

### Stylesheet Locations

#### Database (Primary)
Stylesheets are served from the `stylesheets` database table via the `/styles/` route.

**URL Format:** `/styles/{filename}.css`

Examples:
- `/styles/classifieds.css` - Classifieds listing styles
- `/styles/emails.css` - Email template styles
- `/styles/custom.css` - Global custom CSS

#### Filesystem (Source)
Source CSS files are stored in `/templates/css/` and synced to the database.

### Classifieds Styles
**Database:** `stylesheets` table, filename: `classifieds.css`  
**Source File:** `/templates/css/classifieds.css`  
**URL:** `/styles/classifieds.css`

**Used by:**
- `templates/classifieds/index.njk` - Classified listings page

**Key classes:**
- `.classifieds-search` - Main container
- `.search-bar` - Search form and filters
- `.listing-grid` - Responsive grid layout
- `.listing-card` - Individual ad cards
- `.post-ad-btn` - Call-to-action button

### Email Styles
**Database:** `stylesheets` table, filename: `emails.css`  
**Source File:** `/templates/css/emails.css`  
**URL:** `/styles/emails.css`

**Used by:**
- `templates/emails/base-email.njk` - Base email layout
- `templates/emails/welcome.njk` - Welcome email
- `templates/emails/order-confirmation.njk` - Order confirmation email

**Important Notes:**
- Email templates **keep inline styles** for maximum email client compatibility
- The external stylesheet is provided as a **reference** for editing
- When editing email styles:
  1. Edit via admin UI or `/templates/css/emails.css`
  2. Sync to database: `node scripts/sync-stylesheets.js`
  3. Copy the updated styles into `templates/emails/base-email.njk` inline `<style>` block
  4. This ensures emails render correctly in all email clients

**Email Client Compatibility:**
Most email clients (Gmail, Outlook, etc.) strip out `<link>` tags and external stylesheets. Inline styles are required for reliable rendering.

## How to Edit Styles

### Method 1: Edit in Database (Recommended)

**Via Admin UI:**
1. Go to **Settings** → **Stylesheets**
2. Find the stylesheet you want to edit
3. Click **Edit**
4. Make your changes in the editor
5. Click **Save**
6. Changes are live immediately at `/styles/{filename}.css`

**Via API:**
```bash
PUT /api/stylesheets/:id
{
  "content": "/* your updated CSS */"
}
```

### Method 2: Edit Filesystem and Sync

**For Classifieds (Web Templates):**
1. Open `/templates/css/classifieds.css`
2. Make your changes
3. Save the file
4. Sync to database: `node scripts/sync-stylesheets.js`
5. Refresh the browser (hard refresh: Ctrl+Shift+R)

**For Emails:**
1. Open `/templates/css/emails.css`
2. Make your changes
3. Sync to database: `node scripts/sync-stylesheets.js`
4. Copy the updated CSS into `templates/emails/base-email.njk` inline `<style>` block
5. Save both files

### Sync Commands

**Sync all CSS files from filesystem to database:**
```bash
node scripts/sync-stylesheets.js
```

**Sync via API:**
```bash
POST /api/stylesheets/sync-from-filesystem
```

**Sync a single stylesheet back to filesystem:**
```bash
POST /api/stylesheets/:id/sync-to-filesystem
```

## Template References

### Classifieds Template
```html
{% block head %}
{{ super() }}
<link rel="stylesheet" href="/styles/classifieds.css">
{% endblock %}
```

### Email Template
```html
{# Optional: Link external stylesheet for web-based previews #}
{% if webPreview %}<link rel="stylesheet" href="/styles/emails.css">{% endif %}
{# Inline styles required for email client compatibility #}
<style>
  /* Styles here */
</style>
```

## Best Practices

1. **Classifieds:** Use external stylesheet only - no inline styles needed
2. **Emails:** Maintain both external (for reference) and inline (for compatibility)
3. **Version Control:** Commit both CSS files when making style changes
4. **Testing:** 
   - Test classifieds in multiple browsers
   - Test emails in multiple email clients (Gmail, Outlook, Apple Mail)
5. **Sync:** When syncing templates from filesystem, the external CSS files are preserved

## Color Palette Reference

### Primary Colors
- Primary Blue: `#2563eb`
- Primary Blue Hover: `#1d4ed8`
- Success Green: `#059669`
- Success Green Hover: `#047857`

### Neutral Colors
- Dark Text: `#1a1a2e`
- Body Text: `#374151`
- Muted Text: `#6b7280`
- Light Text: `#9ca3af`
- Border: `#e5e7eb`
- Background: `#f3f4f6`
- Light Background: `#f9fafb`

### Accent Colors
- Category Badge BG: `#eff6ff`
- Category Badge Text: `#2563eb`

## Future Improvements

Consider implementing:
- CSS variables for easier theme customization
- Dark mode support
- Responsive breakpoint utilities
- Email template inliner tool to automate CSS copying
