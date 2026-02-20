/**
 * Utility to check if a slug matches any patterns (wildcard support)
 */
export function matchesAnyPattern(slug, patterns) {
  if (!patterns) return true;
  
  const patternArray = typeof patterns === 'string' ? JSON.parse(patterns) : patterns;
  if (!Array.isArray(patternArray) || patternArray.length === 0) return true; 
  
  return patternArray.some(pattern => {
    if (pattern === '*') return true;
    
    // Convert wildcard * to regex .*
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    const regexStr = '^' + escaped.replace(/\\\*/g, '.*') + '$';
    const regex = new RegExp(regexStr);
    return regex.test(slug);
  });
}

/**
 * Pure logic for calculating cart totals.
 * Separated from DB/Express for unit testing.
 */
export function calculateCartTotals(items, options = {}) {
  const { 
    coupon = null, 
    subscriberDiscount = 0, 
    subscriberDiscountSlugs = null,
    taxRate = 0,
    shippingFlatRate = 0,
    isInternational = false
  } = options;

  let subtotal = 0;
  let discount = 0;

  // 1. Calculate base subtotal and per-item discounts
  for (const item of items) {
    const itemBasePrice = (item.price || 0) * (item.quantity || 0);
    subtotal += itemBasePrice;

    let itemDiscount = 0;

    // Apply subscriber discount if eligible
    if (subscriberDiscount > 0 && matchesAnyPattern(item.slug || '', subscriberDiscountSlugs)) {
      itemDiscount += itemBasePrice * (subscriberDiscount / 100);
    }

    // Apply coupon if eligible
    if (coupon && matchesAnyPattern(item.slug || '', coupon.target_slugs)) {
      if (coupon.discount_type === 'percentage') {
        // Apply percentage to the price AFTER subscriber discount (compounding)
        itemDiscount += (itemBasePrice - itemDiscount) * (parseFloat(coupon.discount_value) / 100);
      }
    }

    discount += itemDiscount;
  }

  // 2. Handle fixed-value coupons (applied to whole eligible subtotal)
  if (coupon && coupon.discount_type === 'fixed') {
    const eligibleSubtotal = items.reduce((acc, item) => {
      if (matchesAnyPattern(item.slug || '', coupon.target_slugs)) {
        return acc + (item.price * item.quantity);
      }
      return acc;
    }, 0);

    if (eligibleSubtotal > 0) {
      discount += parseFloat(coupon.discount_value);
    }
  }

  // Ensure discount doesn't exceed subtotal
  discount = Math.min(discount, subtotal);

  const discountedSubtotal = subtotal - discount;
  const tax = discountedSubtotal * taxRate;
  let shipping = shippingFlatRate;

  if (isInternational) {
    shipping += 5; // Simple international bump
  }

  return {
    subtotal: parseFloat(subtotal.toFixed(2)),
    discount: parseFloat(discount.toFixed(2)),
    tax: parseFloat(tax.toFixed(2)),
    shipping: parseFloat(shipping.toFixed(2)),
    total: parseFloat((discountedSubtotal + tax + shipping).toFixed(2))
  };
}
