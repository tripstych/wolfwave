/**
 * PHP-to-Nunjucks Transpiler for WordPress Themes
 *
 * Regex/pattern-based converter that handles standard WP template tags.
 * Not a full PHP parser — covers the 90% case of typical WP themes.
 */

// ── CONVERSION RULES ──
// Applied in order: most specific first, most generic last.
// Each rule: { pattern: RegExp, replace: string|Function }

const WP_TAG_RULES = [
  // ─── HEADER / FOOTER / SIDEBAR (stripped — handled by base layout) ───
  { pattern: /<\?php\s+get_header\s*\([^)]*\)\s*;?\s*\?>/gi, replace: '' },
  { pattern: /<\?php\s+get_footer\s*\([^)]*\)\s*;?\s*\?>/gi, replace: '' },
  { pattern: /<\?php\s+wp_head\s*\(\s*\)\s*;?\s*\?>/gi, replace: '' },
  { pattern: /<\?php\s+wp_footer\s*\(\s*\)\s*;?\s*\?>/gi, replace: '' },
  { pattern: /<\?php\s+wp_body_open\s*\(\s*\)\s*;?\s*\?>/gi, replace: '' },
  { pattern: /<\?php\s+language_attributes\s*\(\s*\)\s*;?\s*\?>/gi, replace: 'lang="en"' },
  { pattern: /<\?php\s+body_class\s*\([^)]*\)\s*;?\s*\?>/gi, replace: '' },
  { pattern: /<\?php\s+post_class\s*\([^)]*\)\s*;?\s*\?>/gi, replace: '' },

  // ─── CHARSET / BLOGINFO ───
  { pattern: /<\?php\s+bloginfo\s*\(\s*['"]charset['"]\s*\)\s*;?\s*\?>/gi, replace: 'UTF-8' },
  { pattern: /<\?php\s+bloginfo\s*\(\s*['"]name['"]\s*\)\s*;?\s*\?>/gi, replace: '{{ site.site_name }}' },
  { pattern: /<\?php\s+bloginfo\s*\(\s*['"]description['"]\s*\)\s*;?\s*\?>/gi, replace: '{{ site.default_meta_description }}' },
  { pattern: /<\?php\s+bloginfo\s*\(\s*['"]url['"]\s*\)\s*;?\s*\?>/gi, replace: '{{ site.site_url }}' },
  { pattern: /<\?php\s+bloginfo\s*\(\s*['"]stylesheet_url['"]\s*\)\s*;?\s*\?>/gi, replace: '' },
  { pattern: /<\?php\s+bloginfo\s*\(\s*['"]template_url['"]\s*\)\s*;?\s*\?>/gi, replace: '' },
  { pattern: /<\?php\s+bloginfo\s*\(\s*['"]stylesheet_directory['"]\s*\)\s*;?\s*\?>/gi, replace: '' },
  { pattern: /<\?php\s+bloginfo\s*\(\s*['"]pingback_url['"]\s*\)\s*;?\s*\?>/gi, replace: '' },
  { pattern: /<\?php\s+bloginfo\s*\(\s*['"]atom_url['"]\s*\)\s*;?\s*\?>/gi, replace: '' },
  { pattern: /<\?php\s+bloginfo\s*\(\s*['"]rss2_url['"]\s*\)\s*;?\s*\?>/gi, replace: '' },
  { pattern: /<\?php\s+bloginfo\s*\([^)]*\)\s*;?\s*\?>/gi, replace: '{{ site.site_name }}' },

  // ─── HOME / SITE URL ───
  { pattern: /<\?php\s+echo\s+(?:esc_url\s*\(\s*)?home_url\s*\([^)]*\)\s*\)?\s*;?\s*\?>/gi, replace: '/' },
  { pattern: /<\?php\s+echo\s+(?:esc_url\s*\(\s*)?site_url\s*\([^)]*\)\s*\)?\s*;?\s*\?>/gi, replace: '{{ site.site_url }}' },
  { pattern: /<\?php\s+echo\s+(?:esc_url\s*\(\s*)?get_home_url\s*\([^)]*\)\s*\)?\s*;?\s*\?>/gi, replace: '/' },

  // ─── POST/PAGE CONTENT (with CMS regions) ───
  { pattern: /<\?php\s+the_title\s*\(\s*\)\s*;?\s*\?>/gi, replace: '{{ page.title }}' },
  { pattern: /<\?php\s+the_title\s*\(\s*['"]([^'"]*)['"]\s*,\s*['"]([^'"]*)['"]\s*\)\s*;?\s*\?>/gi, replace: '$1{{ page.title }}$2' },
  { pattern: /<\?php\s+echo\s+get_the_title\s*\([^)]*\)\s*;?\s*\?>/gi, replace: '{{ page.title }}' },
  { pattern: /<\?php\s+get_the_title\s*\([^)]*\)\s*;?\s*\?>/gi, replace: '{{ page.title }}' },
  { pattern: /<\?php\s+the_content\s*\([^)]*\)\s*;?\s*\?>/gi, replace: '<div data-cms-region="main" data-cms-type="richtext" data-cms-label="Main Content">{{ content.main | safe }}</div>' },
  { pattern: /<\?php\s+the_excerpt\s*\(\s*\)\s*;?\s*\?>/gi, replace: '<span data-cms-region="excerpt" data-cms-type="textarea" data-cms-label="Excerpt">{{ content.excerpt }}</span>' },
  { pattern: /<\?php\s+echo\s+get_the_excerpt\s*\([^)]*\)\s*;?\s*\?>/gi, replace: '{{ content.excerpt }}' },

  // ─── FEATURED IMAGE / THUMBNAIL ───
  { pattern: /<\?php\s+the_post_thumbnail\s*\(\s*\)\s*;?\s*\?>/gi, replace: '{% if content.featured_image %}<img src="{{ content.featured_image }}" alt="{{ page.title }}" data-cms-region="featured_image" data-cms-type="image" data-cms-label="Featured Image">{% endif %}' },
  { pattern: /<\?php\s+the_post_thumbnail\s*\([^)]*\)\s*;?\s*\?>/gi, replace: '{% if content.featured_image %}<img src="{{ content.featured_image }}" alt="{{ page.title }}" data-cms-region="featured_image" data-cms-type="image" data-cms-label="Featured Image">{% endif %}' },
  { pattern: /<\?php\s+echo\s+get_the_post_thumbnail_url\s*\([^)]*\)\s*;?\s*\?>/gi, replace: '{{ content.featured_image }}' },
  { pattern: /<\?php\s+if\s*\(\s*has_post_thumbnail\s*\(\s*\)\s*\)\s*[:{]\s*\?>/gi, replace: '{% if content.featured_image %}' },

  // ─── PERMALINK / URL ───
  { pattern: /<\?php\s+the_permalink\s*\(\s*\)\s*;?\s*\?>/gi, replace: '{{ page.slug }}' },
  { pattern: /<\?php\s+echo\s+(?:esc_url\s*\(\s*)?get_permalink\s*\([^)]*\)\s*\)?\s*;?\s*\?>/gi, replace: '{{ page.slug }}' },
  { pattern: /<\?php\s+the_ID\s*\(\s*\)\s*;?\s*\?>/gi, replace: '{{ page.id }}' },
  { pattern: /<\?php\s+echo\s+get_the_ID\s*\(\s*\)\s*;?\s*\?>/gi, replace: '{{ page.id }}' },

  // ─── DATE / TIME ───
  { pattern: /<\?php\s+the_date\s*\([^)]*\)\s*;?\s*\?>/gi, replace: '{{ page.published_at | date("F j, Y") }}' },
  { pattern: /<\?php\s+the_time\s*\([^)]*\)\s*;?\s*\?>/gi, replace: '{{ page.published_at | date("F j, Y") }}' },
  { pattern: /<\?php\s+echo\s+get_the_date\s*\([^)]*\)\s*;?\s*\?>/gi, replace: '{{ page.published_at | date("F j, Y") }}' },
  { pattern: /<\?php\s+echo\s+get_the_modified_date\s*\([^)]*\)\s*;?\s*\?>/gi, replace: '{{ page.updated_at | date("F j, Y") }}' },
  { pattern: /<\?php\s+echo\s+human_time_diff\s*\([^)]*\)\s*;?\s*\?>/gi, replace: '{{ page.published_at | date("F j, Y") }}' },

  // ─── AUTHOR ───
  { pattern: /<\?php\s+the_author\s*\(\s*\)\s*;?\s*\?>/gi, replace: '{{ content.author }}' },
  { pattern: /<\?php\s+the_author_posts_link\s*\(\s*\)\s*;?\s*\?>/gi, replace: '{{ content.author }}' },
  { pattern: /<\?php\s+echo\s+get_the_author\s*\([^)]*\)\s*;?\s*\?>/gi, replace: '{{ content.author }}' },
  { pattern: /<\?php\s+echo\s+get_the_author_meta\s*\(\s*['"]display_name['"]\s*\)\s*;?\s*\?>/gi, replace: '{{ content.author }}' },
  { pattern: /<\?php\s+echo\s+get_avatar\s*\([^)]*\)\s*;?\s*\?>/gi, replace: '' },

  // ─── CATEGORIES / TAGS ───
  { pattern: /<\?php\s+the_category\s*\([^)]*\)\s*;?\s*\?>/gi, replace: '{{ content.category }}' },
  { pattern: /<\?php\s+the_tags\s*\([^)]*\)\s*;?\s*\?>/gi, replace: '{{ content.tags }}' },
  { pattern: /<\?php\s+echo\s+get_the_category_list\s*\([^)]*\)\s*;?\s*\?>/gi, replace: '{{ content.category }}' },
  { pattern: /<\?php\s+echo\s+get_the_tag_list\s*\([^)]*\)\s*;?\s*\?>/gi, replace: '{{ content.tags }}' },
  { pattern: /<\?php\s+single_cat_title\s*\([^)]*\)\s*;?\s*\?>/gi, replace: '{{ page.title }}' },
  { pattern: /<\?php\s+single_tag_title\s*\([^)]*\)\s*;?\s*\?>/gi, replace: '{{ page.title }}' },

  // ─── COMMENTS (omit) ───
  { pattern: /<\?php\s+comments_template\s*\([^)]*\)\s*;?\s*\?>/gi, replace: '{# Comments section omitted #}' },
  { pattern: /<\?php\s+comment_form\s*\([^)]*\)\s*;?\s*\?>/gi, replace: '' },
  { pattern: /<\?php\s+wp_list_comments\s*\([^)]*\)\s*;?\s*\?>/gi, replace: '' },
  { pattern: /<\?php\s+comments_number\s*\([^)]*\)\s*;?\s*\?>/gi, replace: '' },

  // ─── NAVIGATION ───
  { pattern: /<\?php\s+wp_nav_menu\s*\([^)]*\)\s*;?\s*\?>/gi, replace: `<ul>
  {% if menus['main-nav'] and menus['main-nav'].items %}
    {% for item in menus['main-nav'].items %}
      <li><a href="{{ item.url }}">{{ item.title }}</a></li>
    {% endfor %}
  {% endif %}
</ul>` },
  { pattern: /<\?php\s+the_custom_logo\s*\(\s*\)\s*;?\s*\?>/gi, replace: '<a href="/" class="site-logo">{{ site.site_name }}</a>' },

  // ─── SEARCH FORM ───
  { pattern: /<\?php\s+get_search_form\s*\([^)]*\)\s*;?\s*\?>/gi, replace: '<form role="search" method="get" action="/search"><input type="text" name="q" placeholder="Search..."><button type="submit">Search</button></form>' },

  // ─── PAGINATION ───
  { pattern: /<\?php\s+the_posts_pagination\s*\([^)]*\)\s*;?\s*\?>/gi, replace: '{# Pagination — implement with your listing template #}' },
  { pattern: /<\?php\s+the_posts_navigation\s*\([^)]*\)\s*;?\s*\?>/gi, replace: '{# Post navigation — implement with your listing template #}' },
  { pattern: /<\?php\s+posts_nav_link\s*\([^)]*\)\s*;?\s*\?>/gi, replace: '' },
  { pattern: /<\?php\s+previous_post_link\s*\([^)]*\)\s*;?\s*\?>/gi, replace: '' },
  { pattern: /<\?php\s+next_post_link\s*\([^)]*\)\s*;?\s*\?>/gi, replace: '' },
  { pattern: /<\?php\s+paginate_links\s*\([^)]*\)\s*;?\s*\?>/gi, replace: '' },

  // ─── SIDEBAR / WIDGETS ───
  { pattern: /<\?php\s+get_sidebar\s*\([^)]*\)\s*;?\s*\?>/gi, replace: '{# Sidebar — use blocks or components #}' },
  { pattern: /<\?php\s+dynamic_sidebar\s*\([^)]*\)\s*;?\s*\?>/gi, replace: '{# Widget area — use blocks #}' },
  { pattern: /<\?php\s+if\s*\(\s*is_active_sidebar\s*\([^)]*\)\s*\)\s*[:{]\s*\?>/gi, replace: '{% if true %}{# sidebar check #}' },

  // ─── TEMPLATE PARTS ───
  { pattern: /<\?php\s+get_template_part\s*\(\s*['"]([^'"]+)['"]\s*(?:,\s*['"]([^'"]+)['"]\s*)?\)\s*;?\s*\?>/gi, replace: (match, part, variant) => {
    const name = variant ? `${part}-${variant}` : part;
    const clean = name.replace(/\//g, '-').replace(/^template-parts?-/, '');
    return `{# Template part: ${name} #}`;
  }},

  // ─── WP LOOP ───
  // Standard WP loop: if (have_posts()) : while (have_posts()) : the_post();
  { pattern: /<\?php\s+if\s*\(\s*have_posts\s*\(\)\s*\)\s*:\s*\?>\s*(?:<\?php\s+)?while\s*\(\s*have_posts\s*\(\)\s*\)\s*:\s*the_post\s*\(\)\s*;?\s*\?>/gi, replace: '{% for post in posts %}' },
  { pattern: /<\?php\s+while\s*\(\s*have_posts\s*\(\)\s*\)\s*:\s*the_post\s*\(\)\s*;?\s*\?>/gi, replace: '{% for post in posts %}' },
  { pattern: /<\?php\s+endwhile\s*;?\s*\?>\s*(?:<\?php\s+)?endif\s*;?\s*\?>/gi, replace: '{% endfor %}' },
  { pattern: /<\?php\s+endwhile\s*;?\s*\?>/gi, replace: '{% endfor %}' },

  // ─── CONDITIONALS ───
  { pattern: /<\?php\s+if\s*\(\s*is_single\s*\(\s*\)\s*\)\s*[:{]\s*\?>/gi, replace: '{% if true %}{# is_single #}' },
  { pattern: /<\?php\s+if\s*\(\s*is_page\s*\(\s*\)\s*\)\s*[:{]\s*\?>/gi, replace: '{% if true %}{# is_page #}' },
  { pattern: /<\?php\s+if\s*\(\s*is_home\s*\(\s*\)\s*\)\s*[:{]\s*\?>/gi, replace: '{% if true %}{# is_home #}' },
  { pattern: /<\?php\s+if\s*\(\s*is_front_page\s*\(\s*\)\s*\)\s*[:{]\s*\?>/gi, replace: '{% if true %}{# is_front_page #}' },
  { pattern: /<\?php\s+if\s*\(\s*is_archive\s*\(\s*\)\s*\)\s*[:{]\s*\?>/gi, replace: '{% if true %}{# is_archive #}' },
  { pattern: /<\?php\s+if\s*\(\s*is_search\s*\(\s*\)\s*\)\s*[:{]\s*\?>/gi, replace: '{% if true %}{# is_search #}' },
  { pattern: /<\?php\s+if\s*\(\s*is_404\s*\(\s*\)\s*\)\s*[:{]\s*\?>/gi, replace: '{% if true %}{# is_404 #}' },
  { pattern: /<\?php\s+if\s*\(\s*is_category\s*\([^)]*\)\s*\)\s*[:{]\s*\?>/gi, replace: '{% if true %}{# is_category #}' },

  // ─── GENERIC CONTROL STRUCTURES ───
  { pattern: /<\?php\s+else\s*:\s*\?>/gi, replace: '{% else %}' },
  { pattern: /<\?php\s+elseif\s*\(([^)]+)\)\s*:\s*\?>/gi, replace: '{% elif true %}{# elseif: $1 #}' },
  { pattern: /<\?php\s+endif\s*;?\s*\?>/gi, replace: '{% endif %}' },
  { pattern: /<\?php\s+endforeach\s*;?\s*\?>/gi, replace: '{% endfor %}' },
  { pattern: /<\?php\s+endwhile\s*;?\s*\?>/gi, replace: '{% endfor %}' },

  // ─── THEME ASSET URLs ───
  { pattern: /<\?php\s+echo\s+(?:esc_url\s*\(\s*)?get_template_directory_uri\s*\(\s*\)\s*\)?\s*;?\s*\?>/gi, replace: '' },
  { pattern: /<\?php\s+echo\s+(?:esc_url\s*\(\s*)?get_stylesheet_directory_uri\s*\(\s*\)\s*\)?\s*;?\s*\?>/gi, replace: '' },

  // ─── ESCAPING FUNCTIONS (unwrap) ───
  { pattern: /<\?php\s+echo\s+esc_html\s*\(\s*get_the_title\s*\(\s*\)\s*\)\s*;?\s*\?>/gi, replace: '{{ page.title }}' },
  { pattern: /<\?php\s+echo\s+esc_html\s*\(\s*get_bloginfo\s*\(\s*['"]name['"]\s*\)\s*\)\s*;?\s*\?>/gi, replace: '{{ site.site_name }}' },
  { pattern: /<\?php\s+echo\s+esc_attr\s*\(\s*get_the_title\s*\(\s*\)\s*\)\s*;?\s*\?>/gi, replace: '{{ page.title }}' },

  // ─── WP_QUERY / CUSTOM QUERIES ───
  { pattern: /<\?php\s+(?:echo\s+)?wp_kses_post\s*\(\s*get_the_content\s*\([^)]*\)\s*\)\s*;?\s*\?>/gi, replace: '{{ content.main | safe }}' },

  // ─── HOOKS / ACTIONS / FILTERS (strip) ───
  { pattern: /<\?php\s+do_action\s*\([^)]*\)\s*;?\s*\?>/gi, replace: '' },
  { pattern: /<\?php\s+apply_filters\s*\([^)]*\)\s*;?\s*\?>/gi, replace: '' },
  { pattern: /<\?php\s+wp_enqueue_script\s*\([^)]*\)\s*;?\s*\?>/gi, replace: '' },
  { pattern: /<\?php\s+wp_enqueue_style\s*\([^)]*\)\s*;?\s*\?>/gi, replace: '' },

  // ─── CUSTOM FIELDS / POST META ───
  { pattern: /<\?php\s+echo\s+get_post_meta\s*\(\s*get_the_ID\s*\(\)\s*,\s*['"]([^'"]+)['"]\s*,\s*true\s*\)\s*;?\s*\?>/gi, replace: (match, field) => `{{ content.${field.replace(/-/g, '_')} }}` },
  { pattern: /<\?php\s+echo\s+get_field\s*\(\s*['"]([^'"]+)['"]\s*\)\s*;?\s*\?>/gi, replace: (match, field) => `{{ content.${field.replace(/-/g, '_')} }}` },

  // ─── GENERIC ECHO ───
  { pattern: /<\?php\s+echo\s+esc_html__?\s*\(\s*['"]([^'"]+)['"]\s*(?:,\s*['"][^'"]*['"]\s*)?\)\s*;?\s*\?>/gi, replace: '$1' },
  { pattern: /<\?php\s+echo\s+esc_html\s*\(\s*\$([a-zA-Z_]+)\s*\)\s*;?\s*\?>/gi, replace: '{{ $1 }}' },
  { pattern: /<\?php\s+echo\s+esc_attr\s*\(\s*\$([a-zA-Z_]+)\s*\)\s*;?\s*\?>/gi, replace: '{{ $1 }}' },
  { pattern: /<\?php\s+echo\s+esc_url\s*\(\s*\$([a-zA-Z_]+)\s*\)\s*;?\s*\?>/gi, replace: '{{ $1 }}' },
  { pattern: /<\?php\s+echo\s+\$([a-zA-Z_][a-zA-Z0-9_]*)\s*;?\s*\?>/gi, replace: '{{ $1 }}' },

  // ─── _e() translation function → just output the string ───
  { pattern: /<\?php\s+(?:esc_html_)?_e\s*\(\s*['"]([^'"]+)['"]\s*(?:,\s*['"][^'"]*['"]\s*)?\)\s*;?\s*\?>/gi, replace: '$1' },
  { pattern: /<\?php\s+echo\s+__\s*\(\s*['"]([^'"]+)['"]\s*(?:,\s*['"][^'"]*['"]\s*)?\)\s*;?\s*\?>/gi, replace: '$1' },

  // ─── GENERIC IF with parenthesized expressions ───
  { pattern: /<\?php\s+if\s*\(([^)]{1,80})\)\s*[:{]\s*\?>/gi, replace: (match, cond) => `{% if true %}{# WP condition: ${cond.trim()} #}` },
  { pattern: /<\?php\s+foreach\s*\(\s*\$([a-zA-Z_]+)\s+as\s+\$([a-zA-Z_]+)\s*\)\s*:\s*\?>/gi, replace: '{% for $2 in $1 %}' },
  { pattern: /<\?php\s+foreach\s*\(\s*\$([a-zA-Z_]+)\s+as\s+\$([a-zA-Z_]+)\s*=>\s*\$([a-zA-Z_]+)\s*\)\s*:\s*\?>/gi, replace: '{% for $3 in $1 %}' },
];

// ─── FINAL CLEANUP RULES (applied after main rules) ───
const CLEANUP_RULES = [
  // Catch-all: any remaining short PHP blocks → comment
  { pattern: /<\?php\s+(.{1,120}?)\s*;?\s*\?>/gi, replace: (match, code) => `{# WP: ${code.trim().substring(0, 100)} #}` },
  // Multi-line PHP blocks → comment block
  { pattern: /<\?php[\s\S]{1,500}?\?>/gi, replace: (match) => {
    const preview = match.replace(/<\?php/, '').replace(/\?>/, '').trim().substring(0, 120);
    return `{# WP block: ${preview} #}`;
  }},
  // Remove empty lines left over
  { pattern: /\n{4,}/g, replace: '\n\n' },
  // Clean up double CMS region wrappers (if the_content was already inside a container)
  { pattern: /(<div[^>]*data-cms-region="main"[^>]*>)\s*<div data-cms-region="main"[^>]*>/gi, replace: '$1' },
];

/**
 * Convert a PHP template string to Nunjucks
 */
export function convertPhpToNunjucks(phpSource, options = {}) {
  let result = phpSource;

  // Apply main conversion rules
  for (const rule of WP_TAG_RULES) {
    result = result.replace(rule.pattern, rule.replace);
  }

  // Apply cleanup rules
  for (const rule of CLEANUP_RULES) {
    result = result.replace(rule.pattern, rule.replace);
  }

  return result;
}

/**
 * Extract the content between header and footer from a full-page PHP template.
 * Removes get_header() and get_footer() calls and returns the body content.
 */
export function extractBodyContent(phpSource) {
  let body = phpSource;

  // Remove everything before and including get_header()
  body = body.replace(/^[\s\S]*?<\?php\s+get_header\s*\([^)]*\)\s*;?\s*\?>\s*/i, '');

  // Remove everything after and including get_footer()
  body = body.replace(/\s*<\?php\s+get_footer\s*\([^)]*\)\s*;?\s*\?>[\s\S]*$/i, '');

  return body;
}

/**
 * Build a base layout from header.php + footer.php
 */
export function buildBaseLayout(headerPhp, footerPhp, themeName) {
  let header = convertPhpToNunjucks(headerPhp || '');
  let footer = convertPhpToNunjucks(footerPhp || '');

  // Remove the closing </body></html> from header if present
  header = header.replace(/<\/body>\s*<\/html>\s*$/i, '');

  // If header doesn't have opening HTML tags, add them
  if (!header.includes('<!DOCTYPE') && !header.includes('<html')) {
    header = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{ seo.title }} | {{ site.site_name }}</title>
  <meta name="description" content="{{ seo.description }}">
  {% block styles %}{% endblock %}
</head>
<body>
${header}`;
  }

  // Ensure we have seo meta in the head
  if (header.includes('<head>') && !header.includes('seo.title')) {
    header = header.replace(/<head>/i, `<head>
  <title>{{ seo.title }} | {{ site.site_name }}</title>
  <meta name="description" content="{{ seo.description }}">`);
  }

  // Add block styles placeholder if not present
  if (!header.includes('{% block styles %}')) {
    header = header.replace(/<\/head>/i, '  {% block styles %}{% endblock %}\n</head>');
  }

  // Build the layout
  const layout = `${header}

  <main class="site-main">
    {% block content %}{% endblock %}
  </main>

${footer}
  {% block scripts %}{% endblock %}
</body>
</html>`;

  return cleanupLayout(layout);
}

/**
 * Wrap converted body content as a child template
 */
export function wrapAsChildTemplate(bodyNjk, layoutFilename, extraStyles = '') {
  let content = bodyNjk.trim();

  const stylesBlock = extraStyles
    ? `\n{% block styles %}\n${extraStyles}\n{% endblock %}\n`
    : '';

  return `{% extends "${layoutFilename}" %}
${stylesBlock}
{% block content %}
${content}
{% endblock %}
`;
}

/**
 * Parse WordPress style.css for theme metadata
 */
export function parseThemeMetadata(styleCss) {
  const meta = {};
  const fields = ['Theme Name', 'Theme URI', 'Author', 'Author URI', 'Description', 'Version', 'License', 'Text Domain', 'Template', 'Tags'];

  for (const field of fields) {
    const regex = new RegExp(`^\\s*${field}\\s*:\\s*(.+)$`, 'mi');
    const match = styleCss.match(regex);
    if (match) {
      meta[field.toLowerCase().replace(/\s+/g, '_')] = match[1].trim();
    }
  }

  return meta;
}

/**
 * Extract CSS custom properties / colors from a WP stylesheet
 */
export function extractThemeStyles(styleCss) {
  const styles = {
    colors: {},
    fonts: [],
    cssBody: ''
  };

  // Strip the header comment block
  const cssBody = styleCss.replace(/\/\*[\s\S]*?\*\//, '').trim();
  styles.cssBody = cssBody;

  // Extract color values
  const colorRegex = /(?:color|background(?:-color)?)\s*:\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\))/gi;
  const colorMatches = cssBody.matchAll(colorRegex);
  const colorCounts = {};
  for (const m of colorMatches) {
    const color = m[1].toLowerCase();
    colorCounts[color] = (colorCounts[color] || 0) + 1;
  }
  // Top colors by frequency
  const sorted = Object.entries(colorCounts).sort((a, b) => b[1] - a[1]);
  if (sorted[0]) styles.colors.primary = sorted[0][0];
  if (sorted[1]) styles.colors.secondary = sorted[1][0];

  // Extract font families
  const fontRegex = /font-family\s*:\s*(['"]?[^;'"]+['"]?)/gi;
  const fontMatches = cssBody.matchAll(fontRegex);
  for (const m of fontMatches) {
    const font = m[1].trim().replace(/['"]/g, '').split(',')[0].trim();
    if (!styles.fonts.includes(font) && !['inherit', 'initial', 'sans-serif', 'serif', 'monospace'].includes(font)) {
      styles.fonts.push(font);
    }
  }

  return styles;
}

/**
 * Clean up a generated layout — remove duplicate tags, fix nesting
 */
function cleanupLayout(html) {
  let result = html;

  // Remove duplicate <html> tags
  const htmlCount = (result.match(/<html/gi) || []).length;
  if (htmlCount > 1) {
    let found = false;
    result = result.replace(/<html[^>]*>/gi, (match) => {
      if (!found) { found = true; return match; }
      return '';
    });
  }

  // Remove duplicate <head> / </head>
  const headCount = (result.match(/<head>/gi) || []).length;
  if (headCount > 1) {
    let found = false;
    result = result.replace(/<head>/gi, (match) => {
      if (!found) { found = true; return match; }
      return '';
    });
  }

  // Remove duplicate </body></html>
  result = result.replace(/(<\/body>\s*<\/html>\s*){2,}/gi, '</body>\n</html>');

  // Remove excessive blank lines
  result = result.replace(/\n{4,}/g, '\n\n');

  return result;
}

// ── PLUGIN DETECTION ──

const ELEMENTOR_PATTERNS = [
  /\belementor\b/i,
  /\\Elementor\\/i,
  /elementor[-_](?:widget|section|column|element)/i,
  /\bElementor\\Widget_Base\b/,
  /\$this->add_render_attribute/,
  /\$this->get_settings_for_display/,
  /elementor\/widgets/i,
  /\[elementor-template/i,
  /data-elementor-type/i,
  /elementor-element/i,
];

const ACF_PATTERNS = [
  /\bget_field\s*\(/,
  /\bthe_field\s*\(/,
  /\bhave_rows\s*\(/,
  /\bthe_row\s*\(/,
  /\bget_sub_field\s*\(/,
  /\bthe_sub_field\s*\(/,
  /\bacf_add_local_field_group\s*\(/,
  /\bget_field_object\s*\(/,
  /\bacf_register_block_type\s*\(/,
];

/**
 * Detect plugin usage in PHP source code.
 * Returns { hasElementor, hasACF, hasShortcodes, pluginHints[] }
 */
export function detectPluginUsage(phpSource) {
  const hasElementor = ELEMENTOR_PATTERNS.some(p => p.test(phpSource));
  const hasACF = ACF_PATTERNS.some(p => p.test(phpSource));
  const hasShortcodes = /do_shortcode|add_shortcode|\[\w+[^\]]*\]/.test(phpSource);

  const pluginHints = [];
  if (hasElementor) pluginHints.push('Elementor');
  if (hasACF) pluginHints.push('ACF');
  if (hasShortcodes) pluginHints.push('Shortcodes');
  if (/\bwoocommerce\b/i.test(phpSource)) pluginHints.push('WooCommerce');
  if (/\byoast\b|wpseo/i.test(phpSource)) pluginHints.push('Yoast SEO');
  if (/\bwpbakery\b|vc_row|vc_column/i.test(phpSource)) pluginHints.push('WPBakery');
  if (/\bwpml\b|icl_t/i.test(phpSource)) pluginHints.push('WPML');

  return { hasElementor, hasACF, hasShortcodes, pluginHints, needsLLM: hasElementor || hasACF };
}

/**
 * Build the system prompt for LLM-powered PHP→Nunjucks conversion
 */
export function buildConversionSystemPrompt() {
  return `You are a WordPress-to-Nunjucks template converter for the WolfWave CMS.

Your job: convert WordPress PHP template code into clean Nunjucks (Jinja2-style) templates.

## WolfWave CMS Template System

WolfWave uses Nunjucks templates with a CMS region system for editable content.
Editable regions are declared via data attributes on HTML elements:

- \`data-cms-region="field_name"\` — the field key (snake_case)
- \`data-cms-type="text|textarea|richtext|image|repeater"\` — the field type
- \`data-cms-label="Human Label"\` — display label in the admin editor

### Available variables:
- \`{{ page.title }}\`, \`{{ page.slug }}\`, \`{{ page.id }}\`
- \`{{ page.published_at | date("F j, Y") }}\`, \`{{ page.updated_at }}\`
- \`{{ content.field_name }}\` — for CMS region values
- \`{{ site.site_name }}\`, \`{{ site.site_url }}\`
- \`{{ seo.title }}\`, \`{{ seo.description }}\`
- \`{{ menus['menu-name'].items }}\` — navigation menus

### Template inheritance:
- Layouts: \`{% extends "layouts/base.njk" %}\`
- Blocks: \`{% block content %}...{% endblock %}\`
- Includes: \`{% include "components/name.njk" %}\`

## ACF Field Conversion Rules

Convert ACF calls to CMS regions:
- \`get_field('hero_title')\` → \`{{ content.hero_title }}\` with a \`data-cms-region="hero_title"\` wrapper
- \`the_field('hero_title')\` → same (outputs directly)
- \`get_field('hero_image')\` (image) → \`{{ content.hero_image }}\` with \`data-cms-type="image"\`
- ACF repeater (\`have_rows\`/\`the_row\`/\`get_sub_field\`) → Nunjucks \`{% for %}\` loop with \`data-cms-type="repeater"\`
- ACF group fields → flatten to \`content.group_fieldname\`
- ACF true/false → \`{% if content.field_name %}\`
- ACF select/radio → \`{{ content.field_name }}\`
- ACF link field → \`<a href="{{ content.field_name.url }}">{{ content.field_name.title }}</a>\`

## Elementor Conversion Rules

Elementor stores page content as serialized data, not in PHP templates.
When you see Elementor patterns:
- Elementor sections → convert to semantic HTML sections with CMS regions
- Elementor widgets (heading, text-editor, image, button, etc.) → convert to appropriate HTML with CMS regions
- Elementor columns → convert to CSS grid/flexbox layout divs
- Remove all Elementor-specific PHP, data attributes, and classes
- Preserve the visual structure/intent but use clean semantic HTML

## Output Rules

1. Return ONLY the converted Nunjucks template code — no explanation, no markdown fences
2. Remove all PHP tags completely — no remaining \`<?php\` or \`?>\`
3. Remove WordPress-specific functions (wp_head, wp_footer, etc.)
4. Convert ALL get_field/the_field calls to CMS regions
5. Keep the HTML structure and CSS classes where they're meaningful for styling
6. Add appropriate data-cms-region attributes for every editable content area
7. Use sensible snake_case names for regions based on the ACF field names or context`;
}

/**
 * Convert PHP source to Nunjucks using an LLM.
 * Falls back to regex conversion if no LLM is available.
 */
export async function convertPhpWithLLM(phpSource, context = {}) {
  const { generateRawText } = await import('../services/aiService.js');

  const systemPrompt = buildConversionSystemPrompt();

  let userPrompt = `Convert this WordPress PHP template to a WolfWave Nunjucks template:\n\n`;
  if (context.filename) userPrompt += `File: ${context.filename}\n`;
  if (context.templateType) userPrompt += `Template type: ${context.templateType}\n`;
  if (context.pluginHints?.length) userPrompt += `Detected plugins: ${context.pluginHints.join(', ')}\n`;
  userPrompt += `\n\`\`\`php\n${phpSource}\n\`\`\``;

  try {
    const result = await generateRawText(systemPrompt, userPrompt);
    if (result) {
      // Strip markdown fences if the LLM added them despite instructions
      return result
        .replace(/^```(?:nunjucks|njk|html|jinja2?)?\s*\n?/i, '')
        .replace(/\n?```\s*$/i, '')
        .trim();
    }
  } catch (err) {
    console.error('[phpToNunjucks] LLM conversion failed, falling back to regex:', err.message);
  }

  // Fallback to regex-based conversion
  return convertPhpToNunjucks(phpSource);
}

export default { convertPhpToNunjucks, extractBodyContent, buildBaseLayout, wrapAsChildTemplate, parseThemeMetadata, extractThemeStyles, detectPluginUsage, convertPhpWithLLM };
