# WebWolf CMS

A multi-tenant, "Look & Feel" first CMS designed to import industrial-grade sites (specifically Lovable.app/React exports) and turn them into editable, dynamic Nunjucks-based themes.

## Features

- **Lovable Importer** - Hybrid AI engine that converts React repositories into CMS themes
- **Multi-Tenancy** - Database-per-tenant isolation with subdomain routing
- **SEO-First Design** - Server-side rendering with Nunjucks for optimal SEO
- **Template-Driven Content** - Define content regions using `data-cms-*` attributes
- **React Admin UI** - Modern, responsive admin interface
- **Classifieds System** - Built-in classified ads with categories, search, and messaging
- **E-commerce** - Complete product catalog, shopping cart, checkout, and order management
- **Payment Processing** - Stripe and PayPal integration with secure credential storage
- **WooCommerce Compatibility** - Import and sync with existing WooCommerce stores
- **ShipStation Integration** - Automated shipping and fulfillment management
- **Subscription System** - Recurring billing and subscription management
- **Builder Frontend** - Visual site builder with drag-and-drop interface
- **Extension System** - Modular architecture for custom functionality
- **Media Library** - Upload and manage images and documents
- **AI Integration** - Hybrid extraction (JSX source + Rendered HTML design truth)

## Tech Stack

- **Backend**: Node.js (Express)
- **Database**: PostgreSQL (via Prisma for schema/logic, Raw SQL for tenant performance)
- **Templating**: Nunjucks (standalone document approach)
- **Frontend Admin**: React (Vite), TailwindCSS
- **Builder Frontend**: React (Vite), Drag-and-drop components
- **Public Site**: Server-rendered Nunjucks templates
- **Payment Processing**: Stripe Elements, PayPal Buttons
- **Media Storage**: AWS S3 (configurable)
- **Email**: MailerSend, Resend
- **Process Management**: PM2
- **Testing**: Vitest, Puppeteer
- **API Documentation**: RESTful JSON APIs
- **Authentication**: JWT, Express Sessions
- **File Uploads**: Multer
- **CSS Processing**: PostCSS
- **Build Tools**: Vite, npm scripts

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
│   ├── api/               # REST API routes (AI, classifieds, products, orders, payments, etc.)
│   ├── controllers/       # Page rendering and business logic
│   ├── db/                # Database connection & Prisma client
│   ├── extensions/        # Extension system modules
│   ├── middleware/        # Auth & tenant resolution
│   ├── lib/               # Renderer, logger, tenant context
│   └── services/          # AI, Media, Lovable Importer, payment processing
├── admin/                  # React admin interface
│   └── src/
│       ├── components/    # Reusable components
│       ├── blocks/        # Block editor components
│       ├── classifieds/   # Classifieds management
│       ├── products/      # Product management
│       └── orders/        # Order management
├── builder/                # Visual site builder
│   ├── frontend/          # React-based builder UI
│   └── server/            # Builder API endpoints
├── templates/              # Nunjucks site templates
│   ├── layouts/           # Base layouts
│   ├── imported/          # AI-generated tenant templates
│   ├── classifieds/       # Classifieds templates
│   ├── products/          # E-commerce templates
│   ├── shop/              # Cart, checkout, order templates
│   └── customer/          # Customer portal templates
├── prisma/                 # Prisma schema & migrations
├── uploads/                # Multi-tenant media storage
├── public/                 # Static assets
│   ├── css/               # Site stylesheets
│   ├── js/                # E-commerce and site JavaScript
│   └── images/            # Static images and placeholders
├── scripts/                # Utility scripts and tools
├── tests/                  # Test suites
└── docs/                   # Additional documentation
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

### E-commerce - Products
- `GET /api/products` - List products
- `POST /api/products` - Create product
- `GET /api/products/:id` - Get product
- `PUT /api/products/:id` - Update product
- `DELETE /api/products/:id` - Delete product
- `POST /api/products/:id/inventory` - Update inventory

### E-commerce - Orders
- `GET /api/orders` - List orders
- `POST /api/orders` - Create order
- `GET /api/orders/:id` - Get order
- `GET /api/orders/number/:orderNumber` - Lookup order by number
- `PUT /api/orders/:id/status` - Update order status
- `PUT /api/orders/:id/tracking` - Add tracking number

### E-commerce - Cart
- `GET /api/cart` - Get cart contents
- `POST /api/cart/items` - Add item to cart
- `PUT /api/cart/items/:index` - Update cart item
- `DELETE /api/cart/items/:index` - Remove cart item
- `POST /api/cart/clear` - Clear cart
- `POST /api/cart/totals` - Calculate totals

### E-commerce - Payments
- `POST /api/payments/stripe/intent` - Create Stripe payment intent
- `POST /api/payments/stripe/confirm` - Confirm Stripe payment
- `POST /api/payments/paypal/order` - Create PayPal order
- `POST /api/payments/paypal/capture` - Capture PayPal payment

### Extensions
- `GET /api/extensions` - List extensions
- `GET /api/extensions/:extensionName` - Get extension details
- `POST /api/extensions/:extensionName/enable` - Enable extension
- `POST /api/extensions/:extensionName/disable` - Disable extension

### Integrations
- `POST /api/woocommerce/import` - Import from WooCommerce
- `POST /api/woocommerce/sync` - Sync with WooCommerce
- `POST /api/shipstation/ship` - Create shipment
- `GET /api/shipstation/tracking/:trackingNumber` - Get tracking info

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
| `STRIPE_PUBLIC_KEY` | Stripe public key | - |
| `STRIPE_SECRET_KEY` | Stripe secret key | - |
| `PAYPAL_CLIENT_ID` | PayPal client ID | - |
| `PAYPAL_CLIENT_SECRET` | PayPal client secret | - |
| `PAYPAL_MODE` | PayPal mode (sandbox/live) | `sandbox` |
| `WOOCOMMERCE_URL` | WooCommerce store URL | - |
| `WOOCOMMERCE_KEY` | WooCommerce consumer key | - |
| `WOOCOMMERCE_SECRET` | WooCommerce consumer secret | - |
| `SHIPSTATION_API_KEY` | ShipStation API key | - |
| `SHIPSTATION_API_SECRET` | ShipStation API secret | - |
| `AWS_ACCESS_KEY_ID` | AWS S3 access key (for media) | - |
| `AWS_SECRET_ACCESS_KEY` | AWS S3 secret key | - |
| `AWS_REGION` | AWS S3 region | `us-east-1` |
| `AWS_S3_BUCKET` | S3 bucket name | - |

## License

MIT
