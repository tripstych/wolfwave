# Shopify Integration Guide

This guide explains how to integrate Shopify with WebWolf CMS for two-way product synchronization and e-commerce functionality.

## Overview

The Shopify integration provides:
- **Two-way product sync** - Keep products synchronized between Shopify and WebWolf CMS
- **Product display** - Show Shopify products on your WebWolf-powered sites
- **Buy Button integration** - Link directly to Shopify checkout
- **Webhook support** - Real-time updates when products/orders change in Shopify
- **Order tracking** - Monitor orders from both systems

## Setup

### 1. Create a Shopify Private App

1. Log into your Shopify admin
2. Go to **Settings** → **Apps and sales channels** → **Develop apps**
3. Click **Create an app**
4. Name it "WebWolf CMS Integration"
5. Configure API scopes:
   - `read_products`, `write_products`
   - `read_orders`, `write_orders`
   - `read_customers`, `write_customers`
   - `read_inventory`, `write_inventory`
6. Install the app and copy the **Admin API access token**

### 2. Get Your Storefront Access Token (Optional)

For Buy Button functionality:
1. In the same app, go to **Storefront API**
2. Enable it and copy the **Storefront access token**

### 3. Configure in WebWolf CMS

1. Log into WebWolf CMS admin
2. Go to **Settings** → **Integrations** → **Shopify**
3. Enter:
   - **Shop Domain**: `your-store.myshopify.com`
   - **Admin API Access Token**: (from step 1)
   - **Storefront Access Token**: (from step 2, optional)
   - **API Version**: `2024-01` (or latest)
4. Click **Test Connection** to verify
5. Click **Save Configuration**

## Product Synchronization

### Import Products from Shopify

**Via Admin UI:**
1. Go to **Products** → **Shopify Sync**
2. Click **Import from Shopify**
3. Select options:
   - All products or specific collection
   - Number of products to import
4. Click **Start Import**

**Via API:**
```bash
POST /api/shopify/import/products
{
  "limit": 50,
  "collection_id": 123456789  // optional
}
```

### Export Products to Shopify

**Via Admin UI:**
1. Go to **Products**
2. Select products to export
3. Click **Actions** → **Export to Shopify**

**Via API:**
```bash
POST /api/shopify/export/products
{
  "product_ids": [1, 2, 3, 4, 5]
}
```

### Automatic Sync

Configure automatic synchronization:
1. Go to **Settings** → **Integrations** → **Shopify**
2. Enable **Auto Sync**
3. Set **Sync Frequency**:
   - Every 15 minutes
   - Hourly
   - Daily
   - Manual only

## Webhooks

Webhooks enable real-time updates when changes occur in Shopify.

### Supported Webhook Topics

- `products/create` - New product created
- `products/update` - Product updated
- `products/delete` - Product deleted
- `orders/create` - New order placed
- `orders/updated` - Order status changed

### Setup Webhooks

Webhooks are automatically created when you save your Shopify configuration. The webhook URL is:

```
https://your-site.com/api/shopify/webhook/{topic}
```

### Manual Webhook Setup

If automatic setup fails:
1. Go to Shopify Admin → **Settings** → **Notifications**
2. Scroll to **Webhooks**
3. Click **Create webhook**
4. Configure:
   - **Event**: Select event type
   - **Format**: JSON
   - **URL**: `https://your-site.com/api/shopify/webhook/products/update`
   - **API version**: `2024-01`

## Product Display Templates

### Basic Product Display

Create a template to display Shopify products:

```html
{% extends "layouts/base.njk" %}

{% block content %}
<div class="products-grid">
  {% for product in products %}
  <div class="product-card">
    <img src="{{ product.image_url }}" alt="{{ product.name }}">
    <h3>{{ product.name }}</h3>
    <p class="price">${{ product.price }}</p>
    
    {% if product.shopify_product_id %}
    <a href="{{ product.shopify_buy_url }}" class="buy-button">
      Buy Now on Shopify
    </a>
    {% endif %}
  </div>
  {% endfor %}
</div>
{% endblock %}
```

### Shopify Buy Button Integration

Use Shopify's Buy Button for embedded checkout:

```html
<div id="product-component"></div>

<script>
var client = ShopifyBuy.buildClient({
  domain: '{{ shopify_config.shop_domain }}',
  storefrontAccessToken: '{{ shopify_config.storefront_access_token }}'
});

ShopifyBuy.UI.onReady(client).then(function (ui) {
  ui.createComponent('product', {
    id: '{{ product.shopify_product_id }}',
    node: document.getElementById('product-component'),
    options: {
      product: {
        buttonDestination: 'checkout',
        contents: {
          img: true,
          title: true,
          price: true
        }
      }
    }
  });
});
</script>
```

## API Endpoints

### Configuration

- `GET /api/shopify/config` - Get Shopify configuration
- `POST /api/shopify/config` - Save/update configuration
- `POST /api/shopify/test-connection` - Test connection

### Sync Operations

- `POST /api/shopify/import/products` - Import products from Shopify
- `POST /api/shopify/export/products` - Export products to Shopify
- `GET /api/shopify/sync/status/:id` - Get sync job status
- `GET /api/shopify/sync/history` - Get sync history

### Products

- `GET /api/shopify/products` - Get synced products
- `GET /api/shopify/products?status=error` - Get products with sync errors

### Webhooks

- `POST /api/shopify/webhook/:topic` - Webhook endpoint (called by Shopify)

## Sync Status & Monitoring

### Check Sync Status

```bash
GET /api/shopify/sync/status/123
```

Response:
```json
{
  "syncLog": {
    "id": 123,
    "sync_type": "products",
    "sync_direction": "import",
    "status": "completed",
    "items_total": 50,
    "items_processed": 50,
    "items_succeeded": 48,
    "items_failed": 2,
    "started_at": "2024-01-15T10:00:00Z",
    "completed_at": "2024-01-15T10:05:30Z"
  }
}
```

### View Sync History

```bash
GET /api/shopify/sync/history?limit=20
```

## Conflict Resolution

When the same product is modified in both systems:

1. **Last Modified Wins** (default)
   - The most recently modified version overwrites the other

2. **Manual Resolution**
   - Products with conflicts are marked with `sync_status: 'conflict'`
   - Admin can review and choose which version to keep

3. **Shopify Priority**
   - Always use Shopify version for conflicts
   - Configure in settings

## Database Schema

### shopify_config
Stores Shopify API credentials per site.

### shopify_products
Tracks product sync status and mapping between CMS and Shopify products.

### shopify_variants
Tracks product variant synchronization.

### shopify_orders
Tracks order synchronization.

### shopify_webhooks
Logs incoming webhooks from Shopify.

### shopify_sync_log
Records sync job history and statistics.

## Troubleshooting

### Products Not Syncing

1. Check Shopify configuration is correct
2. Test connection: `POST /api/shopify/test-connection`
3. Check sync logs: `GET /api/shopify/sync/history`
4. Verify API token has correct permissions

### Webhooks Not Working

1. Verify webhook URL is publicly accessible
2. Check webhook signature verification
3. Review webhook logs in database
4. Ensure `webhook_secret` is configured

### Sync Errors

Common errors:
- **401 Unauthorized**: Invalid access token
- **404 Not Found**: Product doesn't exist in Shopify
- **422 Unprocessable**: Invalid product data
- **429 Rate Limited**: Too many API requests

## Best Practices

1. **Start with Import** - Import existing Shopify products first
2. **Use Webhooks** - Enable webhooks for real-time sync
3. **Monitor Sync Logs** - Regularly check for errors
4. **Test in Staging** - Test sync with a few products first
5. **Backup Data** - Always backup before bulk operations
6. **Rate Limits** - Shopify has API rate limits (2 requests/second)

## Environment Variables

Add to `.env`:

```bash
# Shopify is configured per-site in the database
# No global environment variables needed
```

## Security

- Access tokens are encrypted in the database
- Webhook signatures are verified
- Admin-only endpoints require authentication
- HTTPS required for webhook endpoints

## Support

For issues or questions:
- Check sync logs in admin
- Review webhook logs
- Contact support with sync log ID
