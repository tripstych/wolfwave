import { describe, it, expect, vi, beforeEach } from 'vitest';

// Simulate the logic found in server/api/customer-tenants.js
// This represents the current flat accounting model
async function checkSiteLimits(prismaMock, customerId) {
  const customer = await prismaMock.customers.findUnique({
    where: { id: customerId },
    include: {
      customer_subscriptions: {
        where: { status: 'active' },
        include: { subscription_plans: true },
        take: 1
      },
      _count: {
        select: { tenants: true }
      }
    }
  });

  if (!customer) throw new Error('Customer not found');

  const activeSub = customer.customer_subscriptions[0];
  const planLimit = activeSub?.subscription_plans?.max_sites || 0;
  const effectiveLimit = customer.max_sites_override !== null ? customer.max_sites_override : planLimit;

  return {
    used: customer._count.tenants,
    limit: effectiveLimit,
    can_create: customer._count.tenants < effectiveLimit
  };
}

describe('Hierarchical Site Limits (Current Flat Model)', () => {
  let prismaMock;

  beforeEach(() => {
    // Mock the primary database state
    prismaMock = {
      customers: {
        findUnique: vi.fn(async ({ where }) => {
          if (where.id === 1) {
            // Reseller A in Primary DB
            return {
              id: 1,
              max_sites_override: null,
              customer_subscriptions: [{
                subscription_plans: { max_sites: 10 }
              }],
              _count: { tenants: 9 } // They have created 9 sites (e.g., zenblock and 8 others)
            };
          }
          if (where.id === 2) {
            // End-User B who just signed up on zenblock.wolfwave.shop
            // In the primary DB, they either don't exist, or if they do, they have no subscription
            return {
              id: 2,
              max_sites_override: null,
              customer_subscriptions: [], // No subscription in primary DB
              _count: { tenants: 0 }
            };
          }
          return null;
        })
      }
    };
  });

  it('Reseller A can create a site (9/10 used)', async () => {
    const limits = await checkSiteLimits(prismaMock, 1);
    expect(limits.used).toBe(9);
    expect(limits.limit).toBe(10);
    expect(limits.can_create).toBe(true);
  });

  it('End-User B is incorrectly evaluated against their own empty primary DB record', async () => {
    // When End-User B (id: 2) tries to create a site while on zenblock.wolfwave.shop,
    // the system currently queries the primary DB for ID 2.
    const limits = await checkSiteLimits(prismaMock, 2);
    
    // The glitch: The system sees 0 used, but 0 limit. 
    // It DOES NOT evaluate against Reseller A's remaining 1 slot.
    expect(limits.used).toBe(0);
    expect(limits.limit).toBe(0);
    expect(limits.can_create).toBe(false); // Fails to create
  });

  it('PROPOSED FIX: End-User B should be evaluated against Reseller A (the tenant owner)', async () => {
    // In a hierarchical model, if End-User B is on 'zenblock', we first find who owns 'zenblock'
    const currentTenantDb = 'wolfwave_zenblock';
    
    // Mocking finding the owner of the current tenant DB
    const tenantOwnerId = 1; // Reseller A owns zenblock

    // We check limits against the OWNER, not the end-user
    const limits = await checkSiteLimits(prismaMock, tenantOwnerId);
    
    expect(limits.used).toBe(9);
    expect(limits.limit).toBe(10);
    expect(limits.can_create).toBe(true); // Succeeds, drawing from Reseller's pool
  });
});
