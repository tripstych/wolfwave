import React, { useState, useEffect, useRef } from 'react';
import { X, Search, Loader2 } from 'lucide-react';
import api from '../lib/api';

export default function SlugAutocomplete({ value = [], onChange, placeholder = "Search for a product slug..." }) {
  const safeValue = Array.isArray(value) ? value : [];
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!query.trim()) {
        setSuggestions([]);
        return;
      }

      setLoading(true);
      try {
        const results = await api.get(`/content/slugs?q=${encodeURIComponent(query)}`);
        setSuggestions(results || []);
        setIsOpen(true);
      } catch (err) {
        console.error('Failed to fetch slugs:', err);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  const addSlug = (slug) => {
    if (!safeValue.includes(slug)) {
      onChange([...safeValue, slug]);
    }
    setQuery('');
    setIsOpen(false);
  };

  const removeSlug = (slugToRemove) => {
    onChange(safeValue.filter(s => s !== slugToRemove));
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (query.trim()) {
        addSlug(query.trim());
      }
    }
  };

  return (
    <div className="space-y-2" ref={wrapperRef}>
      <div className="flex flex-wrap gap-2 p-2 border border-gray-300 rounded-md bg-white focus-within:ring-2 focus-within:ring-primary-500 focus-within:border-primary-500">
        {safeValue.map((slug) => (
          <span 
            key={slug} 
            className="inline-flex items-center gap-1 px-2 py-1 bg-primary-100 text-primary-700 text-xs font-medium rounded"
          >
            {slug}
            <button 
              type="button" 
              onClick={() => removeSlug(slug)}
              className="hover:text-primary-900"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <div className="flex-1 min-w-[150px] relative">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => query.trim() && setIsOpen(true)}
            placeholder={safeValue.length === 0 ? placeholder : ""}
            className="w-full border-none p-0 focus:ring-0 text-sm h-full"
          />
          
          {loading && (
            <div className="absolute right-0 top-1/2 -translate-y-1/2">
              <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
            </div>
          )}

          {isOpen && (suggestions.length > 0 || query.trim()) && (
            <div className="absolute left-0 right-0 top-full mt-2 bg-white border border-gray-200 rounded-md shadow-lg z-50 max-h-60 overflow-y-auto">
              {suggestions.map((item) => (
                <button
                  key={item.slug}
                  type="button"
                  onClick={() => addSlug(item.slug)}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 flex flex-col"
                >
                  <span className="font-medium text-gray-900">{item.title}</span>
                  <span className="text-xs text-gray-500">{item.slug}</span>
                </button>
              ))}
              {query.trim() && !suggestions.find(s => s.slug === query.trim()) && (
                <button
                  type="button"
                  onClick={() => addSlug(query.trim())}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 text-primary-600 border-t border-gray-100"
                >
                  Add custom pattern: <strong>{query.trim()}</strong>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      <p className="text-[10px] text-gray-500">
        Type to search slugs, press Enter to add custom patterns or wildcards like <code className="bg-gray-100 px-1">/shop/*</code>
      </p>
    </div>
  );
}
