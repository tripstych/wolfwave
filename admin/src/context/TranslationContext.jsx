import React, { createContext, useContext, useState, useCallback } from 'react';

const TranslationContext = createContext();

export function TranslationProvider({ children }) {
  // In the future, this can load from a JSON file or API
  const [translations] = useState({});
  const [locale, setLocale] = useState('en');

  const _ = useCallback((slug, defaultText) => {
    // Return translation if exists, otherwise default text
    return translations[slug] || defaultText;
  }, [translations]);

  const value = {
    _,
    locale,
    setLocale,
    translations
  };

  return (
    <TranslationContext.Provider value={value}>
      {children}
    </TranslationContext.Provider>
  );
}

export function useTranslation() {
  const context = useContext(TranslationContext);
  if (!context) {
    throw new Error('useTranslation must be used within a TranslationProvider');
  }
  return context;
}
