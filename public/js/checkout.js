/**
 * Checkout Flow Manager
 * Handles multi-step checkout with Stripe Checkout redirect
 */

class CheckoutManager {
  constructor() {
    this.customer = window.__CHECKOUT_CUSTOMER__ || null;
    this.currentStep = this.customer ? 2 : 1;
    this.checkoutData = {
      email: this.customer?.email || '',
      first_name: '',
      last_name: '',
      phone: '',
      address1: '',
      address2: '',
      city: '',
      province: '',
      postal_code: '',
      country: 'US'
    };
    this.init();
  }

  init() {
    this.showStep(this.currentStep);
    this.updateSummary();

    if (window.cart) {
      window.cart.subscribe(() => this.updateSummary());
    }

    // Prevent form submission
    document.getElementById('checkout-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
    });
  }

  /**
   * Go to a specific step
   */
  goToStep(step) {
    if (!this.validateStep(this.currentStep)) {
      return;
    }
    this.currentStep = step;
    this.showStep(step);
  }

  /**
   * Show a specific step
   */
  showStep(step) {
    document.querySelectorAll('.checkout-step').forEach(el => {
      el.classList.add('hidden');
    });

    const stepEl = document.querySelector(`[data-step="${step}"]`);
    if (stepEl) {
      stepEl.classList.remove('hidden');
    }

    document.querySelector('.checkout-form')?.scrollIntoView({ behavior: 'smooth' });
  }

  /**
   * Validate current step data
   */
  validateStep(step) {
    if (step === 1) {
      const email = document.getElementById('email')?.value;
      if (!email || !this.isValidEmail(email)) {
        alert('Please enter a valid email address');
        return false;
      }
      this.checkoutData.email = email;
    }

    if (step === 2) {
      const firstName = document.getElementById('first_name')?.value;
      const lastName = document.getElementById('last_name')?.value;
      const address1 = document.getElementById('address1')?.value;
      const city = document.getElementById('city')?.value;
      const province = document.getElementById('province')?.value;
      const postalCode = document.getElementById('postal_code')?.value;
      const country = document.getElementById('country')?.value;

      if (!firstName || !lastName || !address1 || !city || !province || !postalCode || !country) {
        alert('Please fill in all required fields');
        return false;
      }

      this.checkoutData.first_name = firstName;
      this.checkoutData.last_name = lastName;
      this.checkoutData.address1 = address1;
      this.checkoutData.address2 = document.getElementById('address2')?.value || '';
      this.checkoutData.city = city;
      this.checkoutData.province = province;
      this.checkoutData.postal_code = postalCode;
      this.checkoutData.country = country;
      this.checkoutData.phone = document.getElementById('phone')?.value || '';
    }

    return true;
  }

  /**
   * Proceed to payment — validates shipping and redirects to Stripe Checkout
   */
  async proceedToPayment() {
    const btn = document.getElementById('place-order-btn');
    if (!btn) return;

    if (btn.dataset.submitting === 'true') return;

    try {
      if (!this.validateStep(this.currentStep)) return;

      // Get cart data
      if (!window.cart) throw new Error('Cart not available');

      const cart = window.cart.getCart();
      const cartItems = cart.items || [];

      if (cartItems.length === 0) {
        throw new Error('Your cart is empty');
      }

      btn.disabled = true;
      btn.dataset.submitting = 'true';
      btn.textContent = 'Redirecting to payment...';

      // Build checkout request
      const payload = {
        email: this.checkoutData.email || this.customer?.email,
        first_name: this.checkoutData.first_name,
        last_name: this.checkoutData.last_name,
        phone: this.checkoutData.phone,
        shipping_address: {
          first_name: this.checkoutData.first_name,
          last_name: this.checkoutData.last_name,
          address1: this.checkoutData.address1,
          address2: this.checkoutData.address2,
          city: this.checkoutData.city,
          province: this.checkoutData.province,
          postal_code: this.checkoutData.postal_code,
          country: this.checkoutData.country
        },
        cart_items: cartItems.map(item => ({
          product_id: item.productId,
          variant_id: item.variantId || null,
          product_title: item.title || item.productTitle || 'Product',
          variant_title: item.variantTitle || null,
          sku: item.sku || '',
          price: item.price,
          quantity: item.quantity,
          subtotal: (item.price * item.quantity)
        })),
        subtotal: cart.totals.subtotal,
        tax: cart.totals.tax,
        shipping: cart.totals.shipping,
        total: cart.totals.total
      };

      const response = await fetch('/api/orders/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create checkout session');
      }

      const data = await response.json();

      // Clear cart before redirecting
      await window.cart.clear();

      // Redirect to Stripe Checkout
      if (data.checkout_url) {
        window.location.href = data.checkout_url;
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (error) {
      console.error('Checkout error:', error);
      alert(`Checkout failed: ${error.message}`);
      btn.disabled = false;
      btn.dataset.submitting = 'false';
      btn.textContent = 'Proceed to Payment';
    }
  }

  /**
   * Update order summary
   */
  updateSummary() {
    if (!window.cart) return;

    const cart = window.cart.getCart();
    const items = cart.items || [];
    const totals = cart.totals || {};

    const summaryItems = document.getElementById('summary-items');
    if (!summaryItems) return;

    if (items.length === 0) {
      summaryItems.innerHTML = '<div class="loading">Your cart is empty</div>';
      return;
    }

    const itemsHtml = items.map(item => `
      <div class="summary-item">
        <span>${item.quantity}x ${item.title || item.productTitle || 'Product'}</span>
        <span>$${(item.price * item.quantity).toFixed(2)}</span>
      </div>
    `).join('');

    summaryItems.innerHTML = itemsHtml;

    document.getElementById('summary-subtotal').textContent = '$' + parseFloat(totals.subtotal || 0).toFixed(2);
    document.getElementById('summary-shipping').textContent = '$' + parseFloat(totals.shipping || 0).toFixed(2);
    document.getElementById('summary-tax').textContent = '$' + parseFloat(totals.tax || 0).toFixed(2);
    document.getElementById('summary-total').textContent = '$' + parseFloat(totals.total || 0).toFixed(2);
  }

  /**
   * Validate email format
   */
  isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }
}

// Create global instance
window.checkoutManager = new CheckoutManager();
