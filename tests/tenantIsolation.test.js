import { describe, it, expect, vi } from 'vitest';
import { runWithTenant, getCurrentDbName } from '../server/lib/tenantContext.js';

describe('Multi-Tenant Isolation', () => {
  
  it('should maintain the correct DB context across async hops', async () => {
    const results = await Promise.all([
      runWithTenant('webwolf_tenant_a', async () => {
        // Simulate a database delay
        await new Promise(resolve => setTimeout(resolve, 50));
        return getCurrentDbName();
      }),
      runWithTenant('webwolf_tenant_b', async () => {
        // Shorter delay
        await new Promise(resolve => setTimeout(resolve, 10));
        return getCurrentDbName();
      })
    ]);

    expect(results[0]).toBe('webwolf_tenant_a');
    expect(results[1]).toBe('webwolf_tenant_b');
  });

  it('should fall back to default DB when no context is provided', () => {
    // Outside of runWithTenant
    expect(getCurrentDbName()).toBe(process.env.DB_NAME || 'webwolf_test');
  });

});
