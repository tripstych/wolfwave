import prisma from '../lib/prisma.js';
import { runWithTenant } from '../lib/tenantContext.js';

/**
 * Get tenant information (including owner) from the main database.
 */
export async function getTenantInfoByDb(dbName) {
  const primaryDb = process.env.DB_NAME || 'wolfwave_admin';
  
  // If we are already on the primary DB, don't nested-run
  if (dbName === primaryDb) return null;

  return runWithTenant(primaryDb, async () => {
    return prisma.tenants.findUnique({
      where: { database_name: dbName },
      include: {
        customers: {
          select: {
            id: true,
            email: true,
            max_sites_override: true
          }
        }
      }
    });
  });
}

/**
 * Get a customer's subscription and site count from the main database.
 * This is the core "License Pool" check.
 */
export async function getCustomerSubscriptionStats(customerId) {
  const primaryDb = process.env.DB_NAME || 'wolfwave_admin';
  
  return runWithTenant(primaryDb, async () => {
    const customer = await prisma.customers.findUnique({
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

    if (!customer) return null;

    const activeSub = customer.customer_subscriptions[0];
    const planLimit = activeSub?.subscription_plans?.max_sites || 0;
    const effectiveLimit = customer.max_sites_override !== null ? customer.max_sites_override : planLimit;

    return {
      used: customer._count.tenants,
      limit: effectiveLimit,
      plan_name: activeSub?.subscription_plans?.name || 'No Plan',
      can_create: customer._count.tenants < effectiveLimit
    };
  });
}
