// Customer Registration Form Handler
document.addEventListener('DOMContentLoaded', function() {
  const registerForm = document.getElementById('register-form');
  if (!registerForm) return;

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const firstName = document.getElementById('firstName').value;
    const lastName = document.getElementById('lastName').value;
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const errorDiv = document.getElementById('error-message');
    const successDiv = document.getElementById('success-message');

    // Hide previous messages
    errorDiv.classList.add('hidden');
    successDiv.classList.add('hidden');

    // Validate form
    if (!email || !password) {
      showError('Email and password are required');
      return;
    }

    if (password.length < 6) {
      showError('Password must be at least 6 characters');
      return;
    }

    if (password !== confirmPassword) {
      showError('Passwords do not match');
      return;
    }

    try {
      const response = await fetch('/api/customer-auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          firstName: firstName || null,
          lastName: lastName || null
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Registration failed');
      }

      const data = await response.json();
      showSuccess('Registration successful! Redirecting...');

      // Check for redirect URL in query params
      const urlParams = new URLSearchParams(window.location.search);
      const redirect = urlParams.get('redirect') || '/customer/account';

      setTimeout(() => {
        window.location.href = redirect;
      }, 1500);
    } catch (err) {
      showError(err.message);
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
