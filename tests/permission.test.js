import { describe, it, expect } from 'vitest';
import { canAccess } from '../server/middleware/permission.js';

describe('Permission System (canAccess)', () => {
  it('should allow access if no rules are defined', () => {
    const context = { isLoggedIn: false, hasActiveSubscription: false };
    expect(canAccess(null, context)).toBe(true);
    expect(canAccess({}, context)).toBe(true);
  });

  describe('Authentication Rules', () => {
    it('should handle logged_in rule', () => {
      const rules = { auth: 'logged_in' };
      expect(canAccess(rules, { isLoggedIn: false })).toBe(false);
      expect(canAccess(rules, { isLoggedIn: true })).toBe(true);
    });

    it('should handle logged_out rule', () => {
      const rules = { auth: 'logged_out' };
      expect(canAccess(rules, { isLoggedIn: true })).toBe(false);
      expect(canAccess(rules, { isLoggedIn: false })).toBe(true);
    });
  });

  describe('Subscription Rules', () => {
    it('should handle subscription required rule', () => {
      const rules = { subscription: 'required' };
      expect(canAccess(rules, { hasActiveSubscription: false })).toBe(false);
      expect(canAccess(rules, { hasActiveSubscription: true })).toBe(true);
    });

    it('should handle subscription none rule (e.g. show upsell only to non-subscribers)', () => {
      const rules = { subscription: 'none' };
      expect(canAccess(rules, { hasActiveSubscription: true })).toBe(false);
      expect(canAccess(rules, { hasActiveSubscription: false })).toBe(true);
    });
  });

  describe('Plan-specific Rules', () => {
    const rules = { plans: ['pro', 'enterprise'] };

    it('should deny if user has no subscription', () => {
      expect(canAccess(rules, { hasActiveSubscription: false })).toBe(false);
    });

    it('should allow if user has a matching plan', () => {
      const context = { 
        hasActiveSubscription: true, 
        customer: { subscription: { plan: { slug: 'pro' } } } 
      };
      expect(canAccess(rules, context)).toBe(true);
    });

    it('should deny if user has a non-matching plan', () => {
      const context = { 
        hasActiveSubscription: true, 
        customer: { subscription: { plan: { slug: 'basic' } } } 
      };
      expect(canAccess(rules, context)).toBe(false);
    });
  });

  describe('Combined Rules', () => {
    it('should deny if ANY rule fails (AND logic)', () => {
      const rules = { auth: 'logged_in', subscription: 'required' };
      
      // Fails auth
      expect(canAccess(rules, { isLoggedIn: false, hasActiveSubscription: true })).toBe(false);
      
      // Fails subscription
      expect(canAccess(rules, { isLoggedIn: true, hasActiveSubscription: false })).toBe(false);
      
      // Both pass
      expect(canAccess(rules, { isLoggedIn: true, hasActiveSubscription: true })).toBe(true);
    });
  });
});
