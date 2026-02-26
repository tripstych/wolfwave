# WebWolf CMS

A multi-tenant, "Look & Feel" first CMS designed to import industrial-grade sites (specifically Lovable.app/React exports) and turn them into editable, dynamic Nunjucks-based themes.

## Features

- **Lovable Importer** - Hybrid AI engine that converts React repositories into CMS themes
- **Multi-Tenancy** - Database-per-tenant isolation with subdomain routing
- **SEO-First Design** - Server-side rendering with Nunjucks for optimal SEO
- **Template-Driven Content** - Define content regions using `data-cms-*` attributes
- **React Admin UI** - Modern, responsive admin interface
- **Classifieds System** - Built-in classified ads with categories, search, and messaging
- **E-commerce** - Product management, cart, and checkout functionality
- **Media Library** - Upload and manage images and documents
- **AI Integration** - Hybrid extraction (JSX source + Rendered HTML design truth)

## Tech Stack

- **Backend**: Node.js (Express)
- **Database**: PostgreSQL (via Prisma for schema/logic, Raw SQL for tenant performance)
- **Templating**: Nunjucks (standalone document approach)
- **Frontend Admin**: React (Vite), TailwindCSS
- **Public Site**: Server-rendered Nunjucks templates

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 14+

### Installation

1. Clone and install dependencies:
```bash
cd webwolf
npm install
cd admin && npm install && cd ..
```

2. Configure environment:
```bash
cp .env.example .env
# Edit .env with your PostgreSQL credentials and tenant settings
```

3. Generate Prisma client and run migrations:
```bash
npm run db:generate
npm run db:migrate
```

4. Start development servers:
```bash
npm run dev
```

This starts:
- Express server on `http://localhost:3000`
- React admin on `http://localhost:5173`

### Default Login

- Email: `admin@example.com`
- Password: `admin123`

## Project Structure

```
wolfwave/
├── server/                 # Express backend
│   ├── api/               # REST API routes (AI, classifieds, products, etc.)
│   ├── controllers/       # Page rendering and business logic
│   ├── db/                # Database connection & Prisma client
│   ├── middleware/        # Auth & tenant resolution
│   ├── lib/               # Renderer, logger, tenant context
│   └── services/          # AI, Media, Lovable Importer
├── admin/                  # React admin interface
│   └── src/
│       ├── components/    # Reusable components
│       ├── blocks/        # Block editor components
│       └── classifieds/   # Classifieds management
├── templates/              # Nunjucks site templates
│   ├── layouts/           # Base layouts
│   ├── imported/          # AI-generated tenant templates
│   ├── classifieds/       # Classifieds templates
│   └── customer/          # Customer portal templates
├── prisma/                 # Prisma schema & migrations
├── uploads/                # Multi-tenant media storage
└── public/                 # Static assets
```

## Defining Content Regions

Use `data-cms-*` attributes in your Nunjucks templates to define editable content regions:

```html
<!-- Text field -->
<h1 data-cms-region="hero_title" 
    data-cms-type="text" 
    data-cms-label="Hero Title">
  {{ content.hero_title }}
</h1>

<!-- Rich text field -->
<div data-cms-region="body" 
     data-cms-type="richtext" 
     data-cms-label="Page Content">
  {{ content.body | safe }}
</div>

<!-- Image field -->
<img data-cms-region="featured_image" 
     data-cms-type="image" 
     data-cms-label="Featured Image"
     src="{{ content.featured_image }}">

<!-- Repeater field -->
<div data-cms-region="features" 
     data-cms-type="repeater" 
     data-cms-label="Features"
     data-cms-fields='[{"name":"title","type":"text","label":"Title"},{"name":"description","type":"textarea","label":"Description"}]'>
  {% for feature in content.features %}
    <h3>{{ feature.title }}</h3>
    <p>{{ feature.description }}</p>
  {% endfor %}
</div>
```

### Supported Field Types

| Type | Description |
|------|-------------|
| `text` | Single line text input |
| `textarea` | Multi-line text input |
| `richtext` | WYSIWYG editor |
| `image` | Image picker with media library |
| `repeater` | Repeatable group of fields |

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Get current user

### Pages
- `GET /api/pages` - List pages
- `GET /api/pages/:id` - Get page
- `POST /api/pages` - Create page
- `PUT /api/pages/:id` - Update page
- `DELETE /api/pages/:id` - Delete page

### Templates
- `GET /api/templates` - List templates
- `POST /api/templates/sync` - Sync templates from filesystem

### Media
- `GET /api/media` - List media
- `POST /api/media/upload` - Upload file
- `DELETE /api/media/:id` - Delete file

### SEO
- `GET /api/seo/redirects` - List redirects
- `POST /api/seo/redirects` - Create redirect
- `GET /sitemap.xml` - Generated sitemap
- `GET /robots.txt` - Robots file

## Production Build

```bash
# Build admin
npm run build:admin

# Start production server
NODE_ENV=production npm start
```

In production, the admin UI is served from `/admin` on the Express server.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `NODE_ENV` | Environment | `development` |
| `DATABASE_URL` | PostgreSQL connection string | - |
| `MASTER_DB_NAME` | Master database name | `wolfwave_master` |
| `JWT_SECRET` | JWT signing secret | - |
| `SESSION_SECRET` | Session secret | - |
| `OPENAI_API_KEY` | OpenAI API key for AI features | - |
| `ANTHROPIC_API_KEY` | Anthropic API key (optional) | - |

## License

MIT
