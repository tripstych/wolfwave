# WooCommerce Compatibility - Quick Start

Get your WolfWave site WooCommerce-compatible in 5 minutes.

---

## Installation

### 1. Run Setup Script

```bash
node scripts/setup-woocommerce.js
```

This creates all WooCommerce database tables.

### 2. Start Your Server

```bash
npm start
```

### 3. Create API Key

**Option A: Using cURL**

```bash
curl -X POST http://localhost:3000/api/woocommerce-keys \
  -H "Content-Type: application/json" \
  -d '{
    "description": "My Integration",
    "permissions": "read_write"
  }'
```

**Option B: Using Admin UI**

Navigate to `/admin/woocommerce-keys` (add route to your admin app)

**Response:**

```json
{
  "keyId": 1,
  "consumerKey": "ck_1234567890abcdef...",
  "consumerSecret": "cs_9876543210fedcba...",
  "truncatedKey": "...cdef",
  "permissions": "read_write",
  "description": "My Integration"
}
```

⚠️ **Save these credentials!** The secret is shown only once.

### 4. Sync Existing Data

```bash
curl -X POST http://localhost:3000/api/woocommerce-sync/all
```

This syncs all your existing products, orders, and customers to WooCommerce tables.

---

## Test It Works

### Test with cURL

```bash
# Replace with your actual keys
CONSUMER_KEY="ck_1234567890abcdef"
CONSUMER_SECRET="cs_9876543210fedcba"

# List products
curl -u $CONSUMER_KEY:$CONSUMER_SECRET \
  http://localhost:3000/wp-json/wc/v3/products

# Create a product
curl -u $CONSUMER_KEY:$CONSUMER_SECRET \
  -X POST http://localhost:3000/wp-json/wc/v3/products \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Product",
    "regular_price": "29.99",
    "sku": "TEST-001"
  }'
```

### Test with Zapier

1. In Zapier, add **WooCommerce** app
2. Choose **Custom** account
3. Enter:
   - **Store URL:** `http://localhost:3000` (or your domain)
   - **Consumer Key:** `ck_...`
   - **Consumer Secret:** `cs_...`
4. Test connection ✅

---

## What You Get

✅ **Full WooCommerce REST API v3 compatibility**
- `/wp-json/wc/v3/products` - Product management
- `/wp-json/wc/v3/orders` - Order management  
- `/wp-json/wc/v3/customers` - Customer management

✅ **Automatic bidirectional sync**
- Changes in WolfWave admin → Synced to WooCommerce tables
- Changes via WooCommerce API → Synced to WolfWave tables

✅ **Works with existing integrations**
- Zapier
- ShipStation
- Inventory management tools
- Any WooCommerce-compatible service

---

## Common Use Cases

### Connect to Zapier

**Trigger:** New WooCommerce Order  
**Action:** Send email, update spreadsheet, notify Slack, etc.

### Connect to ShipStation

Automatically import orders and sync tracking numbers back to WolfWave.

### Inventory Sync

Use any WooCommerce inventory management tool to sync stock across platforms.

---

## Troubleshooting

### "Authentication failed"

- Verify consumer key/secret are correct
- Check key hasn't been revoked: `SELECT * FROM woocommerce_api_keys`
- Ensure using Basic Auth over HTTPS in production

### "Product not found"

- Sync the product: `POST /api/woocommerce-sync/products/:id`
- Check mapping: `SELECT * FROM wc_wolfwave_sync WHERE entity_type = 'product'`

### Data out of sync

- Re-sync everything: `POST /api/woocommerce-sync/all`
- Or sync individually: `POST /api/woocommerce-sync/products`

---

## Next Steps

📖 **Read full documentation:** `WOOCOMMERCE_COMPATIBILITY.md`

🔧 **Add admin UI route** (optional):

```jsx
// In admin/src/App.jsx
import WooCommerceKeys from './pages/WooCommerceKeys';

// Add route:
<Route path="/woocommerce-keys" element={<WooCommerceKeys />} />
```

🚀 **Deploy to production:**
- Use HTTPS (required for Basic Auth)
- Update API endpoint URLs
- Rotate keys every 90 days

---

**That's it!** Your WolfWave site now speaks WooCommerce. 🎉
