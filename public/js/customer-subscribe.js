// Customer Subscribe Form Handler
document.addEventListener('DOMContentLoaded', function() {
  // Show signup form when "Subscribe" is clicked for non-logged in users
  document.querySelectorAll('.show-signup-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const planId = btn.dataset.planId;
      const form = document.getElementById(`signup-${planId}`);
      
      // Hide all other signup forms
      document.querySelectorAll('.quick-signup-form').forEach(f => f.style.display = 'none');
      document.querySelectorAll('.show-signup-btn').forEach(b => b.style.display = 'block');
      
      form.style.display = 'block';
      btn.style.display = 'none';
      form.querySelector('.signup-email').focus();
    });
  });

  // Handle Quick Signup & Subscribe
  document.querySelectorAll('.quick-subscribe-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const planId = btn.dataset.planId;
      const form = btn.closest('.quick-signup-form');
      const email = form.querySelector('.signup-email').value;
      const password = form.querySelector('.signup-password').value;

      if (!email || !password) {
        alert('Please enter both email and password.');
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Creating account...';

      try {
        // 1. Register
        const regResponse = await fetch('/api/customer-auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });

        const regData = await regResponse.json();
        if (!regResponse.ok) throw new Error(regData.error || 'Registration failed');

        // 2. Checkout (now that we are logged in)
        btn.textContent = 'Redirecting to checkout...';
        await startCheckout(planId);
      } catch (err) {
        alert(err.message);
        btn.disabled = false;
        btn.textContent = 'Sign Up & Subscribe';
      }
    });
  });

  // Handle Subscribe for logged-in users
  document.querySelectorAll('.subscribe-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const planId = btn.dataset.planId;
      btn.disabled = true;
      btn.textContent = 'Redirecting...';
      try {
        await startCheckout(planId);
      } catch (err) {
        alert(err.message);
        btn.disabled = false;
        btn.textContent = 'Subscribe';
      }
    });
  });

  async function startCheckout(planId) {
    const response = await fetch('/api/customer-subscriptions/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ plan_id: parseInt(planId) })
    });

    const data = await response.json();
    if (data.checkout_url) {
      window.location.href = data.checkout_url;
    } else {
      throw new Error(data.error || 'Failed to start checkout');
    }
  }
});
