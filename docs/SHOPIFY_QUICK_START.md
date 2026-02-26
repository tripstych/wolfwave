# Shopify Integration - Quick Start

Get your Shopify store connected to WebWolf CMS in 5 minutes.

## Step 1: Run Database Migration

```bash
npm run db:migrate
```

This creates the necessary Shopify integration tables.

## Step 2: Get Shopify Credentials

1. Go to your Shopify admin: `https://your-store.myshopify.com/admin`
2. Navigate to **Settings** → **Apps and sales channels** → **Develop apps**
3. Click **Create an app** → Name it "WebWolf CMS"
4. Click **Configure Admin API scopes** and select:
   - ✅ `read_products` and `write_products`
   - ✅ `read_orders` and `write_orders`
   - ✅ `read_customers` and `write_customers`
   - ✅ `read_inventory` and `write_inventory`
5. Click **Save** → **Install app**
6. Copy the **Admin API access token** (you'll only see this once!)

## Step 3: Configure in WebWolf CMS

### Via Admin UI (Recommended)

1. Log into WebWolf CMS admin
2. Go to **Settings** → **Integrations** → **Shopify**
3. Fill in:
   ```
   Shop Domain: your-store.myshopify.com
   Access Token: [paste token from step 2]
   API Version: 2024-01
   ```
4. Click **Test Connection** ✓
5. Click **Save**

### Via API

```bash
POST /api/shopify/config
Content-Type: application/json
Authorization: Bearer YOUR_JWT_TOKEN

{
  "shop_domain": "your-store.myshopify.com",
  "access_token": "shpat_xxxxxxxxxxxxx",
  "api_version": "2024-01",
  "sync_enabled": true,
  "sync_frequency": "hourly"
}
```

## Step 4: Import Your First Products

### Via Admin UI

1. Go to **Products** → **Shopify Sync**
2. Click **Import from Shopify**
3. Set limit to `10` (start small)
4. Click **Start Import**
5. Watch the progress bar!

### Via API

```bash
POST /api/shopify/import/products
Content-Type: application/json
Authorization: Bearer YOUR_JWT_TOKEN

{
  "limit": 10
}
```

## Step 5: Verify Sync

Check that products imported successfully:

```bash
GET /api/shopify/products
```

You should see your Shopify products with `sync_status: "synced"`.

## Step 6: Enable Webhooks (Optional but Recommended)

Webhooks keep your products in sync automatically.

1. In WebWolf admin, go to **Settings** → **Shopify** → **Webhooks**
2. Click **Auto-Configure Webhooks**
3. This creates webhooks in Shopify for:
   - Product create/update/delete
   - Order create/update

Your webhook URL will be:
```
https://your-site.com/api/shopify/webhook/{topic}
```

## Step 7: Display Products on Your Site

Add to your product template:

```html
{% extends "layouts/base.njk" %}

{% block content %}
<div class="products">
  {% for product in products %}
    <div class="product-card">
      <img src="{{ product.image_url }}" alt="{{ product.name }}">
      <h3>{{ product.name }}</h3>
      <p>${{ product.price }}</p>
      
      {% if product.shopify_product_id %}
        <a href="https://{{ shopify_config.shop_domain }}/products/{{ product.slug }}" 
           class="buy-button">
          Buy on Shopify
        </a>
      {% endif %}
    </div>
  {% endfor %}
</div>
{% endblock %}
```

## Next Steps

- **Two-way sync**: Export CMS products to Shopify
- **Auto sync**: Enable automatic hourly sync
- **Buy Button**: Embed Shopify checkout on your site
- **Order tracking**: Monitor orders from both systems

## Troubleshooting

### "Failed to connect to Shopify"
- Verify your shop domain is correct (include `.myshopify.com`)
- Check that access token is valid
- Ensure API scopes are configured

### "Products not importing"
- Check sync logs: `GET /api/shopify/sync/history`
- Verify you have products in Shopify
- Check API rate limits (max 2 req/sec)

### "Webhooks not working"
- Ensure your site is publicly accessible (not localhost)
- Verify webhook URL in Shopify admin
- Check webhook logs in database

## Support

Need help? Check:
- Full documentation: `docs/SHOPIFY_INTEGRATION.md`
- API reference: `server/api/shopify.js`
- Database schema: `prisma/migrations/.../migration.sql`
