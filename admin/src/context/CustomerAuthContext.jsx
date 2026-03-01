import { createContext, useContext, useState, useEffect } from 'react';
import api from '../lib/api';

const CustomerAuthContext = createContext(null);

export function CustomerAuthProvider({ children }) {
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkCustomerAuth();
  }, []);

  const checkCustomerAuth = async () => {
    try {
      // Check if customer is logged in by calling customer auth endpoint
      const response = await fetch('/api/customer-auth/me', {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setCustomer(data);
        console.log('Customer auth successful:', data);
      } else if (response.status === 401) {
        // Customer not logged in - this is expected
        setCustomer(null);
        console.log('Customer not logged in (401)');
      } else {
        // Other error
        console.log('Customer auth error:', response.status, response.statusText);
        setCustomer(null);
      }
    } catch (err) {
      // Network error or other issue
      console.log('Customer auth network error:', err);
      setCustomer(null);
    } finally {
      setLoading(false);
    }
  };

  const customerLogin = async (email, password) => {
    const response = await fetch('/api/customer-auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });
    
    if (response.ok) {
      const data = await response.json();
      setCustomer(data.customer);
      return data;
    } else {
      throw new Error('Login failed');
    }
  };

  const customerLogout = async () => {
    try {
      await fetch('/api/customer-auth/logout', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        }
      });
    } catch (err) {
      // Continue even if logout fails
      console.log('Customer logout error:', err);
    }
    setCustomer(null);
  };

  return (
    <CustomerAuthContext.Provider value={{ 
      customer, 
      loading, 
      customerLogin, 
      customerLogout, 
      checkCustomerAuth 
    }}>
      {children}
    </CustomerAuthContext.Provider>
  );
}

export function useCustomerAuth() {
  const context = useContext(CustomerAuthContext);
  if (!context) {
    throw new Error('useCustomerAuth must be used within a CustomerAuthProvider');
  }
  return context;
}
