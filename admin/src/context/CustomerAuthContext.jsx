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
      const response = await api.get('/customer/auth/me', { 
        // Don't redirect to login on 401, just return null
        validateStatus: (status) => status < 500 
      });
      setCustomer(response);
    } catch (err) {
      // Customer not logged in or error
      setCustomer(null);
    } finally {
      setLoading(false);
    }
  };

  const customerLogin = async (email, password) => {
    const response = await api.post('/customer/auth/login', { email, password });
    setCustomer(response.customer);
    return response;
  };

  const customerLogout = async () => {
    try {
      await api.post('/customer/auth/logout');
    } catch (err) {
      // Continue even if logout fails
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
