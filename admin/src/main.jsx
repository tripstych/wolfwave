import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { ContentTypesProvider } from './context/ContentTypesContext';
import { SettingsProvider } from './context/SettingsContext';
import { TranslationProvider } from './context/TranslationContext';
import { CustomerAuthProvider } from './context/CustomerAuthContext';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter 
      basename={import.meta.env.BASE_URL}
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <TranslationProvider>
        <CustomerAuthProvider>
          <AuthProvider>
            <SettingsProvider>
              <ContentTypesProvider>
                <App />
                <Toaster position="top-right" richColors />
              </ContentTypesProvider>
            </SettingsProvider>
          </AuthProvider>
        </CustomerAuthProvider>
      </TranslationProvider>
    </BrowserRouter>
  </React.StrictMode>
);
