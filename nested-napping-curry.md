# Pre-built Layout Scaffold Templates

## Context
The system uses Nunjucks templates with `data-cms-region` attributes to define editable content regions. Templates live in `templates/pages/` and are auto-synced to the DB via `templateParser.js`. The LLM theme generator needs a wide selection of layout patterns to pick from. Currently there are only 4 page templates: `standard.njk`, `homepage.njk`, `blog-post.njk`, `index.njk`.

## Approach
Create 20+ new `.njk` files in `templates/pages/` following the existing pattern:
- Extend `layouts/base.njk`
- Define layout-specific CSS in `{% block styles %}`
- Use `data-cms-region`, `data-cms-type`, `data-cms-label` attributes for editable regions
- Use `data-cms-type="repeater"` with `data-cms-fields` for repeating sections
- Use CSS variables from `base.njk` (`--cms-primary-color`, `--cms-font-body`, etc.)
- All responsive with mobile breakpoints

No server/admin changes needed — `scanTemplates()` in `templateParser.js` already recursively scans `templates/pages/` and syncs to DB automatically.

## Template List (24 templates)

### Hero Variations (5)
1. **`hero-centered.njk`** — Full-width hero with centered text overlay, subtitle, CTA button + body content below
2. **`hero-split.njk`** — 50/50 split: text left, hero image right + body content below
3. **`hero-video.njk`** — Video/image background hero with overlay text + body content below
4. **`hero-minimal.njk`** — Clean minimal hero (large title, thin underline, no bg image) + body content
5. **`hero-angled.njk`** — Hero with angled/diagonal bottom edge clip + body content

### Content + CTA Variations (5)
6. **`content-cta-mid.njk`** — Body content, mid-page CTA banner, more content below
7. **`content-cta-sidebar.njk`** — Main content with sticky CTA sidebar
8. **`content-cta-bottom.njk`** — Full body content with prominent bottom CTA section
9. **`content-cta-inline.njk`** — Content with inline card-style CTAs interspersed (repeater)
10. **`content-cta-banner.njk`** — Content sections separated by full-width colored CTA banners

### Multi-Column Variations (5)
11. **`two-column.njk`** — Equal 2-column content layout
12. **`two-column-sidebar.njk`** — Wide main + narrow sidebar (70/30)
13. **`three-column.njk`** — Equal 3-column content sections
14. **`features-grid.njk`** — Section intro + repeater grid of feature cards (icon, title, desc)
15. **`alternating-rows.njk`** — Alternating image-left/text-right, text-left/image-right rows

### Landing Pages (5)
16. **`landing-saas.njk`** — Hero + features grid + pricing section + testimonials + CTA
17. **`landing-product.njk`** — Product hero + benefits list + gallery + specs + CTA
18. **`landing-service.njk`** — Hero + service descriptions (repeater) + process steps + contact CTA
19. **`landing-event.njk`** — Event hero (date, location) + schedule + speakers + registration CTA
20. **`landing-portfolio.njk`** — Minimal hero + filterable project gallery (repeater) + about + contact

### Specialty (4)
21. **`about-team.njk`** — Company intro + team member grid (repeater: photo, name, role, bio)
22. **`contact.njk`** — Contact info section + embedded map placeholder + contact form area
23. **`faq.njk`** — Page intro + FAQ accordion items (repeater: question, answer)
24. **`testimonials.njk`** — Hero intro + testimonial cards grid (repeater: quote, name, role, photo)

## Template Structure Pattern
Each template follows this structure:
```njk
{% extends "layouts/base.njk" %}

{% block styles %}
/* Scoped CSS using CSS variables from base.njk */
{% endblock %}

{% block content %}
<!-- Sections using data-cms-region attributes -->
{% endblock %}
```

## Verification
- Run template sync from admin (or restart server) — all 24 templates should appear in the template dropdown
- Create a test page, select each template — verify regions render correctly in the editor
- Preview pages to confirm responsive layouts render properly
