import { describe, it, expect } from 'vitest';
import { calculateCartTotals } from '../server/lib/discountEngine.js';

describe('Discount Engine', () => {
  const mockItems = [
    { slug: '/products/tshirt', price: 20, quantity: 2 }, // $40
    { slug: '/products/jeans', price: 50, quantity: 1 }   // $50
  ];

  it('should calculate base subtotal correctly', () => {
    const totals = calculateCartTotals(mockItems);
    expect(totals.subtotal).toBe(90);
    expect(totals.total).toBe(90);
  });

  it('should apply subscriber discount to matching items', () => {
    const totals = calculateCartTotals(mockItems, {
      subscriberDiscount: 10,
      subscriberDiscountSlugs: ['/products/tshirt']
    });
    // $40 * 0.10 = $4 discount
    expect(totals.discount).toBe(4);
    expect(totals.total).toBe(86);
  });

  it('should apply global subscriber discount using wildcard (*)', () => {
    const totals = calculateCartTotals(mockItems, {
      subscriberDiscount: 20,
      subscriberDiscountSlugs: ['*']
    });
    // $90 total * 0.20 = $18 discount
    expect(totals.discount).toBe(18);
  });

  it('should NOT apply subscriber discount to non-matching slugs', () => {
    const totals = calculateCartTotals(mockItems, {
      subscriberDiscount: 50,
      subscriberDiscountSlugs: ['/products/other-category/*']
    });
    expect(totals.discount).toBe(0);
  });

  it('should apply percentage coupon correctly (compounded)', () => {
    const coupon = {
      discount_type: 'percentage',
      discount_value: 10,
      target_slugs: ['/products/tshirt', '/products/jeans']
    };
    
    const totals = calculateCartTotals(mockItems, { coupon });
    // $90 * 0.10 = $9 discount
    expect(totals.discount).toBe(9);
    expect(totals.total).toBe(81);
  });

  it('should apply fixed value coupon correctly', () => {
    const coupon = {
      discount_type: 'fixed',
      discount_value: 15,
      target_slugs: ['*'] // Global
    };
    
    const totals = calculateCartTotals(mockItems, { coupon });
    expect(totals.discount).toBe(15);
    expect(totals.total).toBe(75);
  });

  it('should correctly compound subscriber and coupon discounts', () => {
    const coupon = {
      discount_type: 'percentage',
      discount_value: 10,
      target_slugs: ['*']
    };
    
    const totals = calculateCartTotals(mockItems, {
      subscriberDiscount: 50,
      subscriberDiscountSlugs: ['/products/tshirt'],
      coupon
    });

    // Tshirt: $40 -> $20 (subscriber) -> $18 (coupon 10% of 20)
    // Jeans: $50 -> $50 (no subscriber) -> $45 (coupon 10% of 50)
    // Total Discount: $20 + $2 (tshirt) + $5 (jeans) = $27
    expect(totals.discount).toBe(27);
    expect(totals.total).toBe(63);
  });

  it('should not allow discount to exceed subtotal', () => {
    const coupon = {
      discount_type: 'fixed',
      discount_value: 500,
      target_slugs: ['*']
    };
    const totals = calculateCartTotals(mockItems, { coupon });
    expect(totals.discount).toBe(90);
    expect(totals.total).toBe(0);
  });

  it('should apply tax correctly after discounts', () => {
    const totals = calculateCartTotals(mockItems, {
      taxRate: 0.10 // 10% tax
    });
    // $90 subtotal * 0.10 = $9 tax
    expect(totals.tax).toBe(9);
    expect(totals.total).toBe(99);
  });

  it('should apply flat rate shipping', () => {
    const totals = calculateCartTotals(mockItems, {
      shippingFlatRate: 10
    });
    expect(totals.shipping).toBe(10);
    expect(totals.total).toBe(100);
  });

  it('should add international shipping premium', () => {
    const totals = calculateCartTotals(mockItems, {
      shippingFlatRate: 10,
      isInternational: true
    });
    // 10 + 5 international = 15
    expect(totals.shipping).toBe(15);
  });

  it('should calculate complex order correctly (Discount + Tax + Shipping)', () => {
    const coupon = {
      discount_type: 'percentage',
      discount_value: 10,
      target_slugs: ['*']
    };
    
    const totals = calculateCartTotals(mockItems, {
      coupon,
      taxRate: 0.10,
      shippingFlatRate: 10
    });

    // Subtotal: $90
    // Discount: $9 (10%)
    // Taxable Subtotal: $81
    // Tax: $8.1 (10% of 81)
    // Shipping: $10
    // Total: 81 + 8.1 + 10 = $99.1
    expect(totals.discount).toBe(9);
    expect(totals.tax).toBe(8.1);
    expect(totals.total).toBe(99.1);
  });
});
