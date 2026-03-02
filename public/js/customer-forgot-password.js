// Customer Forgot Password Form Handler
document.addEventListener('DOMContentLoaded', function() {
  const forgotPasswordForm = document.getElementById('forgot-password-form');
  if (!forgotPasswordForm) return;

  forgotPasswordForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('email').value;
    const errorDiv = document.getElementById('error-message');
    const successDiv = document.getElementById('success-message');
    const btn = e.target.querySelector('button');

    // Hide previous messages
    errorDiv.classList.add('hidden');
    successDiv.classList.add('hidden');

    if (!email) {
      showError('Email address is required');
      return;
    }

    try {
      btn.disabled = true;
      btn.textContent = 'Sending...';

      const response = await fetch('/api/customer-auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to send reset link');
      }

      showSuccess('Reset link sent! Check your email for instructions.');
      forgotPasswordForm.reset();

    } catch (err) {
      showError(err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Send Reset Link';
    }
  });

  function showError(message) {
    const errorDiv = document.getElementById('error-message');
    const successDiv = document.getElementById('success-message');
    
    errorDiv.textContent = message;
    errorDiv.classList.remove('hidden');
    successDiv.classList.add('hidden');
  }

  function showSuccess(message) {
    const errorDiv = document.getElementById('error-message');
    const successDiv = document.getElementById('success-message');
    
    successDiv.textContent = message;
    successDiv.classList.remove('hidden');
    errorDiv.classList.add('hidden');
  }
});
