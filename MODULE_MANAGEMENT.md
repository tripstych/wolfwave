# Module Management System

WolfWave's module management system allows you to enable/disable features and integrations on a per-customer or per-subscription-plan basis.

## Overview

The module system provides:

- **Subscription-based access**: Enable modules for specific subscription tiers
- **Customer overrides**: Grant or revoke access for individual customers
- **Usage tracking**: Monitor module usage for analytics and billing
- **Configuration management**: Store module-specific settings per customer
- **Middleware protection**: Easily protect routes with module access checks

## Architecture

### Database Tables

#### `modules`
Registry of all available modules in the system.

```sql
- id: INT (Primary Key)
- name: VARCHAR(100) - Display name
- slug: VARCHAR(100) - Unique identifier (e.g., 'shipstation')
- description: TEXT
- category: VARCHAR(50) - 'integration', 'ecommerce', 'analytics', etc.
- icon: VARCHAR(50) - Icon name for UI
- is_system: BOOLEAN - System module (cannot be disabled)
- requires_config: BOOLEAN - Requires configuration
- config_schema: JSON - JSON schema for configuration
- default_enabled: BOOLEAN - Enabled by default
```

#### `plan_modules`
Defines which modules are available for each subscription plan.

```sql
- id: INT (Primary Key)
- plan_id: INT (FK to subscription_plans)
- module_id: INT (FK to modules)
- is_enabled: BOOLEAN
- config: JSON - Plan-level module configuration
```

#### `customer_modules`
Customer-specific module overrides.

```sql
- id: INT (Primary Key)
- customer_id: INT (FK to customers)
- module_id: INT (FK to modules)
- is_enabled: BOOLEAN
- config: JSON - Customer-specific configuration
- override_plan: BOOLEAN - Whether to override plan settings
```

#### `module_usage`
Tracks module usage for analytics and billing.

```sql
- id: BIGINT (Primary Key)
- customer_id: INT (FK to customers)
- module_id: INT (FK to modules)
- usage_type: VARCHAR(50) - 'api_call', 'export', 'sync', etc.
- usage_count: INT
- metadata: JSON
- created_at: TIMESTAMP
```

## Default Modules

The system comes with these pre-configured modules:

| Module | Slug | Category | Description |
|--------|------|----------|-------------|
| ShipStation Integration | `shipstation` | shipping | Connect to ShipStation for order fulfillment |
| WooCommerce API | `woocommerce` | integration | WooCommerce REST API compatibility |
| Advanced Analytics | `analytics` | analytics | Detailed analytics dashboard |
| Email Marketing | `email-marketing` | marketing | Built-in email campaigns |
| Multi-Currency | `multi-currency` | ecommerce | Multiple currency support |
| Subscriptions | `subscriptions` | ecommerce | Recurring billing (enabled by default) |
| Digital Downloads | `digital-downloads` | ecommerce | Sell digital products (enabled by default) |
| Classified Ads | `classified-ads` | content | User-generated classifieds |
| API Access | `api-access` | developer | Full REST API access |
| Custom Domains | `custom-domains` | infrastructure | Use custom domain names |
| Priority Support | `priority-support` | support | 24/7 priority support |
| White Label | `white-label` | branding | Remove WolfWave branding |

## Access Priority

Module access is determined in this order:

1. **Customer Override** (if `override_plan = true`)
2. **Subscription Plan Module**
3. **Module Default**

## API Endpoints

### Customer Endpoints

#### Get All Modules
```http
GET /api/modules
Authorization: Bearer {token}
```

**Response:**
```json
{
  "subscription": {
    "plan_id": 2,
    "plan_name": "Professional"
  },
  "modules": [
    {
      "id": 1,
      "name": "ShipStation Integration",
      "slug": "shipstation",
      "description": "Connect to ShipStation...",
      "category": "shipping",
      "icon": "package",
      "requires_config": true,
      "enabled": true,
      "config": { "auth_key": "..." },
      "source": "plan"
    }
  ]
}
```

#### Check Module Access
```http
GET /api/modules/:slug
Authorization: Bearer {token}
```

**Response:**
```json
{
  "slug": "shipstation",
  "enabled": true,
  "config": { "auth_key": "..." }
}
```

#### Get Module Usage
```http
GET /api/modules/usage/:slug?start_date=2024-01-01&end_date=2024-01-31
Authorization: Bearer {token}
```

**Response:**
```json
{
  "usage": [
    {
      "module_name": "ShipStation Integration",
      "module_slug": "shipstation",
      "usage_type": "export",
      "total_usage": 1250,
      "event_count": 45,
      "first_used": "2024-01-01T10:00:00Z",
      "last_used": "2024-01-31T15:30:00Z"
    }
  ]
}
```

### Admin Endpoints

#### Enable Module for Customer
```http
POST /api/modules/:slug/enable
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "config": { "auth_key": "..." },
  "override_plan": true
}
```

#### Disable Module for Customer
```http
POST /api/modules/:slug/disable
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "override_plan": true
}
```

#### Remove Customer Override
```http
DELETE /api/modules/:slug/override
Authorization: Bearer {admin_token}
```

#### Get Plan Modules
```http
GET /api/modules/plans/:planId
Authorization: Bearer {admin_token}
```

#### Set Plan Modules
```http
PUT /api/modules/plans/:planId
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "modules": [
    {
      "slug": "shipstation",
      "enabled": true,
      "config": null
    },
    {
      "slug": "woocommerce",
      "enabled": true,
      "config": null
    }
  ]
}
```

## Service Functions

### Check Module Access

```javascript
import { hasModuleAccess } from '../services/moduleManager.js';

const access = await hasModuleAccess(customerId, 'shipstation');
// { enabled: true, config: { auth_key: '...' } }
```

### Get Customer Modules

```javascript
import { getCustomerModules } from '../services/moduleManager.js';

const result = await getCustomerModules(customerId);
// { subscription: {...}, modules: [...] }
```

### Enable/Disable Module

```javascript
import { 
  enableModuleForCustomer, 
  disableModuleForCustomer 
} from '../services/moduleManager.js';

await enableModuleForCustomer(customerId, 'shipstation', { auth_key: '...' });
await disableModuleForCustomer(customerId, 'analytics');
```

### Track Usage

```javascript
import { trackModuleUsage } from '../services/moduleManager.js';

await trackModuleUsage(
  customerId, 
  'shipstation', 
  'export', 
  100, 
  { orders_exported: 100 }
);
```

## Middleware

### Require Module

Protect routes that require a specific module:

```javascript
import { requireModule } from '../middleware/moduleAccess.js';

router.get('/shipstation/export', 
  requireModule('shipstation'), 
  async (req, res) => {
    // Access granted - req.moduleConfig contains module config
    const authKey = req.moduleConfig.auth_key;
    // ...
  }
);
```

### Require Any Module

Allow access if any of the specified modules is enabled:

```javascript
import { requireAnyModule } from '../middleware/moduleAccess.js';

router.get('/shipping/export', 
  requireAnyModule(['shipstation', 'woocommerce']), 
  async (req, res) => {
    // req.moduleSlug contains the enabled module
    // req.moduleConfig contains its config
  }
);
```

### Attach Module Info

Attach module info without blocking:

```javascript
import { attachModuleInfo } from '../middleware/moduleAccess.js';

router.get('/dashboard', 
  attachModuleInfo('analytics'), 
  async (req, res) => {
    // req.moduleAccess.analytics = { enabled: true, config: {...} }
    const hasAnalytics = req.moduleAccess?.analytics?.enabled;
  }
);
```

## Usage Examples

### Example 1: Configure Subscription Plans

```javascript
// Set modules for "Professional" plan
await setPlanModules(2, [
  { slug: 'shipstation', enabled: true, config: null },
  { slug: 'woocommerce', enabled: true, config: null },
  { slug: 'analytics', enabled: true, config: null },
  { slug: 'api-access', enabled: true, config: null }
]);

// Set modules for "Basic" plan
await setPlanModules(1, [
  { slug: 'digital-downloads', enabled: true, config: null },
  { slug: 'subscriptions', enabled: true, config: null }
]);
```

### Example 2: Grant Trial Access

```javascript
// Give a customer temporary access to premium module
await enableModuleForCustomer(
  customerId, 
  'analytics', 
  { trial_until: '2024-12-31' },
  true // override plan
);
```

### Example 3: Track API Usage

```javascript
// In your API endpoint
router.post('/api/sync', 
  requireModule('woocommerce'), 
  async (req, res) => {
    // Perform sync
    const syncedCount = await syncOrders();
    
    // Track usage
    await trackModuleUsage(
      req.user.customer_id,
      'woocommerce',
      'sync',
      syncedCount,
      { endpoint: '/api/sync' }
    );
    
    res.json({ synced: syncedCount });
  }
);
```

### Example 4: Conditional Features

```javascript
router.get('/dashboard', async (req, res) => {
  const modules = await getCustomerModules(req.user.customer_id);
  
  const features = {
    hasShipping: modules.modules.find(m => m.slug === 'shipstation')?.enabled,
    hasAnalytics: modules.modules.find(m => m.slug === 'analytics')?.enabled,
    hasAPI: modules.modules.find(m => m.slug === 'api-access')?.enabled
  };
  
  res.json({ features });
});
```

## Admin UI Integration

Create a module management page in your admin UI:

```jsx
// admin/src/pages/Modules.jsx
import { useState, useEffect } from 'react';
import api from '../lib/api';

export default function Modules() {
  const [modules, setModules] = useState([]);
  
  useEffect(() => {
    api.get('/modules').then(res => {
      setModules(res.data.modules);
    });
  }, []);
  
  return (
    <div>
      <h1>Your Modules</h1>
      {modules.map(module => (
        <div key={module.slug}>
          <h3>{module.name}</h3>
          <p>{module.description}</p>
          <span>{module.enabled ? '✓ Enabled' : '✗ Disabled'}</span>
          {!module.enabled && (
            <button>Upgrade to Enable</button>
          )}
        </div>
      ))}
    </div>
  );
}
```

## Migration

Run migrations to create the module tables:

```bash
npm run db:migrate
```

This will:
1. Create `modules`, `plan_modules`, `customer_modules`, `module_usage` tables
2. Insert default modules
3. Set up foreign key relationships

## Best Practices

1. **Always check module access** before executing module-specific code
2. **Track usage** for billing and analytics
3. **Use middleware** for route protection
4. **Store sensitive config** (API keys) in module config, not in code
5. **Test module access** in development before deploying
6. **Document module requirements** in your API documentation
7. **Provide upgrade prompts** when users try to access disabled modules

## Troubleshooting

### Module Not Found
```javascript
// Error: Module 'xyz' not found
// Solution: Check module slug spelling, or add module to database
```

### Access Denied
```javascript
// Error: Access denied: Module 'shipstation' is not enabled
// Solution: Enable module for customer's plan or add customer override
```

### Configuration Required
```javascript
// Error: Module 'shipstation' requires configuration
// Solution: Set module config via enableModuleForCustomer()
```

## Security Considerations

- Module access checks happen on every request
- Customer overrides require admin permissions
- Module configs can store sensitive data (encrypted recommended)
- Usage tracking helps detect abuse
- Plan changes automatically update module access

## Future Enhancements

- [ ] Module dependencies (require module X to enable module Y)
- [ ] Usage-based billing integration
- [ ] Module marketplace for third-party modules
- [ ] Automatic module recommendations based on usage
- [ ] Module A/B testing framework
- [ ] Webhook notifications for module state changes

## Support

For questions or issues with the module system:
1. Check module status: `GET /api/modules`
2. Review usage logs: `GET /api/modules/usage`
3. Verify subscription plan includes module
4. Contact support if module should be enabled but isn't
