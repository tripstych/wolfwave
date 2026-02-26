# Stylesheet Management

This document explains how to manage the external stylesheets for templates in WebWolf CMS.

## Overview

Template styles have been extracted from inline `<style>` blocks into separate CSS files for easier editing and maintenance.

## Stylesheet Locations

### Classifieds Styles
**File:** `/public/css/classifieds.css`

**Used by:**
- `templates/classifieds/index.njk` - Classified listings page

**Key classes:**
- `.classifieds-search` - Main container
- `.search-bar` - Search form and filters
- `.listing-grid` - Responsive grid layout
- `.listing-card` - Individual ad cards
- `.post-ad-btn` - Call-to-action button

**Editing:**
You can edit this file directly. Changes will be reflected immediately on the classifieds pages.

### Email Styles
**File:** `/public/css/emails.css`

**Used by:**
- `templates/emails/base-email.njk` - Base email layout
- `templates/emails/welcome.njk` - Welcome email
- `templates/emails/order-confirmation.njk` - Order confirmation email

**Important Notes:**
- Email templates **keep inline styles** for maximum email client compatibility
- The external stylesheet is provided as a **reference** for editing
- When editing email styles:
  1. Edit `/public/css/emails.css` first
  2. Copy the updated styles back into `templates/emails/base-email.njk` inline `<style>` block
  3. This ensures emails render correctly in all email clients

**Email Client Compatibility:**
Most email clients (Gmail, Outlook, etc.) strip out `<link>` tags and external stylesheets. Inline styles are required for reliable rendering.

## How to Edit Styles

### For Classifieds (Web Templates)
1. Open `/public/css/classifieds.css`
2. Make your changes
3. Save the file
4. Refresh the browser (hard refresh: Ctrl+Shift+R)

### For Emails
1. Open `/public/css/emails.css`
2. Make your changes
3. Copy the updated CSS
4. Open `templates/emails/base-email.njk`
5. Paste the CSS into the `<style>` block (lines 11-24)
6. Save both files

## Template References

### Classifieds Template
```html
{% block head %}
{{ super() }}
<link rel="stylesheet" href="/css/classifieds.css">
{% endblock %}
```

### Email Template
```html
{# Optional: Link external stylesheet for web-based previews #}
{% if webPreview %}<link rel="stylesheet" href="/css/emails.css">{% endif %}
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
