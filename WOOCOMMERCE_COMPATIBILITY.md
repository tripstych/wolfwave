# WooCommerce Compatibility Layer

**Status**: Ready for Testing  
**Implementation Date**: February 26, 2026

---

## Overview

WolfWave now includes a complete WooCommerce compatibility layer that allows third-party integrations (Zapier, ShipStation, inventory management tools, etc.) to connect to your WolfWave site as if it were a WooCommerce store.

### Key Features

- ✅ **WooCommerce Database Tables** - Authentic WooCommerce schema
- ✅ **Bidirectional Sync** - Automatic sync between WolfWave and WooCommerce tables
- ✅ **REST API v3** - Full WooCommerce REST API compatibility
- ✅ **OAuth 1.0a Authentication** - Industry-standard API authentication
- ✅ **Consumer Keys Management** - Admin UI for API key generation
- ✅ **Webhook Support** - Ready for order/product update notifications

---

## Architecture

### How It Works

```
Third-Party Integration (Zapier, ShipStation, etc.)
    ↓
WooCommerce REST API (/wp-json/wc/v3/*)
    ↓
OAuth 1.0a Authentication
    ↓
WooCommerce-Compatible Tables (wp_posts, wp_postmeta, etc.)
    ↕ (Bidirectional Sync)
WolfWave Native Tables (products, orders, customers)
```

### Database Structure

WolfWave maintains **two parallel table structures**:

1. **WolfWave Native Tables** (existing)
   - `products`, `orders`, `customers`, `order_items`
   - Optimized for WolfWave's CMS functionality

2. **WooCommerce Tables** (new)
   - `wp_posts`, `wp_postmeta`, `wp_users`, `wp_usermeta`
   - `woocommerce_order_items`, `woocommerce_order_itemmeta`
   - `woocommerce_api_keys`, `wc_product_meta_lookup`
   - Exact WooCommerce schema for compatibility

3. **Sync Mapping Table**
   - `wc_wolfwave_sync` - Maps WolfWave IDs to WooCommerce IDs

---

## Installation

### 1. Run WooCommerce Tables Migration

```bash
node server/db/migrations/runWooCommerceMigration.js
```

This creates all WooCommerce-compatible tables in your database.

### 2. Sync Existing Data

Sync all existing products, orders, and customers to WooCommerce tables:

```bash
curl -X POST http://localhost:3000/api/woocommerce-sync/all
```

Or sync individually:

```bash
# Sync all products
curl -X POST http://localhost:3000/api/woocommerce-sync/products

# Sync all orders
curl -X POST http://localhost:3000/api/woocommerce-sync/orders

# Sync all customers
curl -X POST http://localhost:3000/api/woocommerce-sync/customers
```

### 3. Create API Keys

In the WolfWave admin panel:

1. Navigate to **Settings → WooCommerce API**
2. Click **Add Key**
3. Enter description (e.g., "Zapier Integration")
4. Select permissions: `read`, `write`, or `read_write`
5. Click **Generate**
6. **Copy the Consumer Key and Consumer Secret** (shown only once!)

---

## API Endpoints

### WooCommerce REST API v3

All standard WooCommerce endpoints are supported:

#### Products

```bash
# List products
GET /wp-json/wc/v3/products

# Get single product
GET /wp-json/wc/v3/products/:id

# Create product
POST /wp-json/wc/v3/products

# Update product
PUT /wp-json/wc/v3/products/:id

# Delete product
DELETE /wp-json/wc/v3/products/:id
```

#### Orders

```bash
# List orders
GET /wp-json/wc/v3/orders

# Get single order
GET /wp-json/wc/v3/orders/:id

# Update order (e.g., change status)
PUT /wp-json/wc/v3/orders/:id
```

#### Customers

```bash
# List customers
GET /wp-json/wc/v3/customers

# Get single customer
GET /wp-json/wc/v3/customers/:id
```

### Admin Sync Endpoints

```bash
# Sync all data
POST /api/woocommerce-sync/all

# Sync specific entities
POST /api/woocommerce-sync/products
POST /api/woocommerce-sync/orders
POST /api/woocommerce-sync/customers

# Sync single item
POST /api/woocommerce-sync/products/:id
POST /api/woocommerce-sync/orders/:id
```

### API Key Management

```bash
# List all API keys
GET /api/woocommerce-keys

# Create new API key
POST /api/woocommerce-keys
{
  "description": "Zapier Integration",
  "permissions": "read_write"
}

# Revoke API key
DELETE /api/woocommerce-keys/:keyId
```

---

## Authentication

WooCommerce API uses **OAuth 1.0a** or **Basic Authentication**.

### Basic Auth (Recommended)

Most integrations use Basic Auth over HTTPS:

```bash
curl https://yoursite.com/wp-json/wc/v3/products \
  -u ck_CONSUMER_KEY:cs_CONSUMER_SECRET
```

**Example with actual keys:**

```bash
curl https://yoursite.com/wp-json/wc/v3/products \
  -u ck_1234567890abcdef:cs_9876543210fedcba
```

### OAuth 1.0a

For non-HTTPS connections or advanced integrations:

```bash
GET /wp-json/wc/v3/products?oauth_consumer_key=ck_xxx&oauth_signature=xxx&...
```

---

## Integration Examples

### Zapier

1. In Zapier, choose **WooCommerce** as the app
2. Select **Custom** for the account type
3. Enter your WolfWave site URL: `https://yoursite.com`
4. Enter Consumer Key: `ck_...`
5. Enter Consumer Secret: `cs_...`
6. Test connection ✅

### ShipStation

1. Go to **Settings → Stores**
2. Click **Add Store**
3. Select **WooCommerce**
4. Enter Store URL: `https://yoursite.com`
5. Enter API Key (Consumer Key): `ck_...`
6. Enter API Secret (Consumer Secret): `cs_...`
7. Click **Connect**

### Custom Integration

```javascript
const axios = require('axios');

const api = axios.create({
  baseURL: 'https://yoursite.com/wp-json/wc/v3',
  auth: {
    username: 'ck_1234567890abcdef',
    password: 'cs_9876543210fedcba'
  }
});

// Get all products
const products = await api.get('/products');

// Create an order
const order = await api.post('/orders', {
  payment_method: 'stripe',
  billing: { /* ... */ },
  line_items: [
    { product_id: 123, quantity: 2 }
  ]
});

// Update order status
await api.put(`/orders/${order.data.id}`, {
  status: 'completed'
});
```

---

## Data Sync Behavior

### Automatic Sync

When you create/update data through either interface, it automatically syncs:

- **WolfWave Admin** → Creates/updates in both WolfWave and WooCommerce tables
- **WooCommerce API** → Creates/updates in both WooCommerce and WolfWave tables

### Manual Sync

If data gets out of sync, manually trigger sync:

```bash
# Sync everything
curl -X POST http://localhost:3000/api/woocommerce-sync/all

# Sync specific product
curl -X POST http://localhost:3000/api/woocommerce-sync/products/123
```

### Sync Direction

The `wc_wolfwave_sync` table tracks mappings:

```sql
SELECT * FROM wc_wolfwave_sync;
```

| entity_type | wolfwave_id | woocommerce_id | sync_direction |
|-------------|-------------|----------------|----------------|
| product     | 1           | 45             | bidirectional  |
| order       | 10          | 102            | bidirectional  |
| customer    | 5           | 23             | bidirectional  |

---

## API Response Format

### Product Response

```json
{
  "id": 45,
  "name": "Awesome T-Shirt",
  "slug": "awesome-t-shirt",
  "permalink": "https://yoursite.com/product/awesome-t-shirt",
  "type": "simple",
  "status": "publish",
  "sku": "TSHIRT-001",
  "price": "29.99",
  "regular_price": "29.99",
  "sale_price": "",
  "stock_quantity": 100,
  "stock_status": "instock",
  "manage_stock": true,
  "description": "An awesome t-shirt",
  "short_description": "Awesome tee",
  "images": [
    {
      "id": 0,
      "src": "https://yoursite.com/uploads/tshirt.jpg",
      "name": "Awesome T-Shirt",
      "alt": "Awesome T-Shirt"
    }
  ]
}
```

### Order Response

```json
{
  "id": 102,
  "number": "ORD-1234567890",
  "status": "processing",
  "currency": "USD",
  "total": "59.98",
  "billing": {
    "first_name": "John",
    "last_name": "Doe",
    "email": "john@example.com",
    "phone": "555-1234",
    "address_1": "123 Main St",
    "city": "New York",
    "state": "NY",
    "postcode": "10001",
    "country": "US"
  },
  "line_items": [
    {
      "id": 1,
      "name": "Awesome T-Shirt",
      "product_id": 45,
      "quantity": 2,
      "total": "59.98"
    }
  ]
}
```

---

## Permissions

API keys support three permission levels:

- **`read`** - GET requests only
- **`write`** - POST, PUT, DELETE only (no GET)
- **`read_write`** - All operations (recommended)

---

## Security Best Practices

1. **Use HTTPS in Production** - Always use SSL/TLS for API requests
2. **Rotate Keys Regularly** - Generate new keys every 90 days
3. **Limit Permissions** - Use `read` for reporting tools, `read_write` for order management
4. **Monitor Usage** - Check `last_access` in `woocommerce_api_keys` table
5. **Revoke Unused Keys** - Delete keys that haven't been used in 30+ days

---

## Troubleshooting

### Authentication Failed

**Error:** `401 Unauthorized - Sorry, you cannot list resources`

**Solutions:**
- Verify Consumer Key and Secret are correct
- Check key hasn't been revoked
- Ensure permissions allow the HTTP method (GET/POST/PUT/DELETE)
- For OAuth, verify signature is correct

### Product Not Found

**Error:** `404 Not Found - Product not found`

**Solutions:**
- Ensure product is synced: `POST /api/woocommerce-sync/products/:id`
- Check `wc_wolfwave_sync` table for mapping
- Verify product exists in WolfWave: `SELECT * FROM products WHERE id = ?`

### Data Out of Sync

**Symptoms:** Changes in WolfWave admin don't appear in API responses

**Solutions:**
- Manually trigger sync: `POST /api/woocommerce-sync/all`
- Check sync mapping: `SELECT * FROM wc_wolfwave_sync`
- Verify both table sets have data:
  ```sql
  SELECT COUNT(*) FROM products;
  SELECT COUNT(*) FROM wp_posts WHERE post_type = 'product';
  ```

### Slow API Responses

**Solutions:**
- Add indexes to WooCommerce tables (already included in migration)
- Limit `per_page` parameter (default: 10, max: 100)
- Use pagination for large datasets
- Enable query caching in MySQL

---

## Database Tables Reference

### WooCommerce Tables Created

| Table Name | Purpose |
|------------|---------|
| `woocommerce_api_keys` | API authentication credentials |
| `woocommerce_sessions` | Shopping cart sessions |
| `woocommerce_order_items` | Order line items |
| `woocommerce_order_itemmeta` | Order item metadata |
| `wc_webhooks` | Webhook configurations |
| `wc_product_meta_lookup` | Product search optimization |
| `wp_posts` | Products and orders (as custom post types) |
| `wp_postmeta` | Product/order metadata |
| `wp_users` | Customer accounts |
| `wp_usermeta` | Customer metadata |
| `woocommerce_tax_rates` | Tax rate configurations |
| `woocommerce_shipping_zones` | Shipping zone definitions |
| `woocommerce_shipping_zone_methods` | Shipping methods |
| `wc_wolfwave_sync` | ID mapping between systems |

---

## Performance Considerations

### Indexes

All WooCommerce tables include proper indexes for fast queries:

- Product SKU lookup
- Order number lookup
- Customer email lookup
- Post type filtering
- Meta key searches

### Caching

Consider implementing:

- Redis for API response caching
- MySQL query cache
- CDN for product images

### Batch Operations

For bulk operations, use sync endpoints:

```bash
# Better: Sync all at once
POST /api/woocommerce-sync/products

# Avoid: Syncing one by one in a loop
POST /api/woocommerce-sync/products/1
POST /api/woocommerce-sync/products/2
POST /api/woocommerce-sync/products/3
...
```

---

## Webhooks (Future Enhancement)

The `wc_webhooks` table is ready for webhook support. Future implementation will allow:

- Order created/updated/deleted notifications
- Product stock changes
- Customer registration
- Custom event triggers

---

## Testing

### Test with cURL

```bash
# Set your credentials
CONSUMER_KEY="ck_1234567890abcdef"
CONSUMER_SECRET="cs_9876543210fedcba"
SITE_URL="http://localhost:3000"

# List products
curl -u $CONSUMER_KEY:$CONSUMER_SECRET \
  $SITE_URL/wp-json/wc/v3/products

# Create a product
curl -u $CONSUMER_KEY:$CONSUMER_SECRET \
  -X POST $SITE_URL/wp-json/wc/v3/products \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Product",
    "type": "simple",
    "regular_price": "19.99",
    "sku": "TEST-001",
    "manage_stock": true,
    "stock_quantity": 50
  }'

# Update order status
curl -u $CONSUMER_KEY:$CONSUMER_SECRET \
  -X PUT $SITE_URL/wp-json/wc/v3/orders/102 \
  -H "Content-Type: application/json" \
  -d '{"status": "completed"}'
```

### Test with Postman

1. Create new request
2. Set URL: `http://localhost:3000/wp-json/wc/v3/products`
3. Go to **Authorization** tab
4. Type: **Basic Auth**
5. Username: `ck_1234567890abcdef`
6. Password: `cs_9876543210fedcba`
7. Send request

---

## FAQ

**Q: Do I need to use WooCommerce WordPress plugin?**  
A: No! This is a compatibility layer that mimics WooCommerce's API. No WordPress required.

**Q: Will this break my existing WolfWave functionality?**  
A: No. WooCommerce tables are separate and synced automatically. All existing features work unchanged.

**Q: Can I use both WolfWave admin and WooCommerce API simultaneously?**  
A: Yes! Changes in either system automatically sync to the other.

**Q: What happens if I delete a product via API?**  
A: It's deleted from both WooCommerce and WolfWave tables.

**Q: Do I need to manually sync after every change?**  
A: No. Sync happens automatically when you use the WooCommerce API or WolfWave admin.

**Q: Can I disable WooCommerce compatibility?**  
A: Yes. Simply don't create API keys and third-party integrations won't be able to connect.

---

## Support

For issues or questions:

1. Check this documentation
2. Review server logs: `tail -f logs/server.log`
3. Check sync status: `SELECT * FROM wc_wolfwave_sync`
4. Test with cURL to isolate issues

---

**Built with ❤️ for WolfWave CMS**  
Implementation Date: February 26, 2026  
Status: ✅ READY FOR TESTING
