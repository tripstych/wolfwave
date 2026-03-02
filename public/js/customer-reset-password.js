// Customer Reset Password Form Handler
document.addEventListener('DOMContentLoaded', function() {
  const resetPasswordForm = document.getElementById('reset-password-form');
  if (!resetPasswordForm) return;

  resetPasswordForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirm_password').value;
    const token = document.getElementById('token').value;
    const errorDiv = document.getElementById('error-message');
    const successDiv = document.getElementById('success-message');
    const btn = e.target.querySelector('button');

    // Hide previous messages
    errorDiv.classList.add('hidden');
    successDiv.classList.add('hidden');

    // Validate
    if (!password || !confirmPassword) {
      showError('Both password fields are required');
      return;
    }

    if (password.length < 8) {
      showError('Password must be at least 8 characters');
      return;
    }

    if (password !== confirmPassword) {
      showError('Passwords do not match');
      return;
    }

    if (!token) {
      showError('Invalid reset token');
      return;
    }

    try {
      btn.disabled = true;
      btn.textContent = 'Resetting...';

      const response = await fetch('/api/customer-auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password, confirmPassword })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to reset password');
      }

      showSuccess('Password reset successfully! Redirecting to login...');

      setTimeout(() => {
        window.location.href = '/customer/login';
      }, 2000);

    } catch (err) {
      showError(err.message);
    } finally {
      if (!successDiv.classList.contains('hidden')) {
        btn.disabled = false;
        btn.textContent = 'Reset Password';
      }
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
