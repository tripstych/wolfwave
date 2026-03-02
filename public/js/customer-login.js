// Customer Login Form Handler
// Prevent duplicate script execution
if (!window.customerLoginFormLoaded) {
  window.customerLoginFormLoaded = true;
  
  document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('customer-login-form');
    
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('customer-email').value;
        const password = document.getElementById('customer-password').value;
        const errorDiv = document.getElementById('customer-login-error');
        const successDiv = document.getElementById('customer-login-success');

        // Hide previous messages
        errorDiv.classList.add('hidden');
        successDiv.classList.add('hidden');

        // Validate
        if (!email || !password) {
          showError('Email and password are required');
          return;
        }

        try {
          const response = await fetch('/api/customer-auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ email, password })
          });
          
          if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Login failed');
          }

          showSuccess('Login successful! Redirecting...');

          const urlParams = new URLSearchParams(window.location.search);
          const redirectUrl = urlParams.get('redirect') || '/customer/account';
          
          setTimeout(() => {
            window.location.href = redirectUrl;
          }, 1000);
        } catch (err) {
          showError(err.message);
        }
      });
    }
  });

  function showError(message) {
    const errorDiv = document.getElementById('customer-login-error');
    const successDiv = document.getElementById('customer-login-success');
    
    if (errorDiv) {
      errorDiv.textContent = message;
      errorDiv.classList.remove('hidden');
    }
    if (successDiv) {
      successDiv.classList.add('hidden');
    }
  }

  function showSuccess(message) {
    const errorDiv = document.getElementById('customer-login-error');
    const successDiv = document.getElementById('customer-login-success');
    
    if (successDiv) {
      successDiv.textContent = message;
      successDiv.classList.remove('hidden');
    }
    if (errorDiv) {
      errorDiv.classList.add('hidden');
    }
  }
}
