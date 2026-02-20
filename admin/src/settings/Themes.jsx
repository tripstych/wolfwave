import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Check, Palette, Code } from 'lucide-react';
import AiThemeGenerator from './AiThemeGenerator';

export default function Themes() {
  const [themes, setThemes] = useState([]);
  const [activeTheme, setActiveTheme] = useState('default');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activating, setActivating] = useState(null);

  useEffect(() => {
    fetchThemes();
  }, []);

  const fetchThemes = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/themes', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (!response.ok) throw new Error('Failed to fetch themes');
      const data = await response.json();
      setThemes(data.themes || []);
      setActiveTheme(data.active || 'default');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleActivate = async (slug) => {
    try {
      setActivating(slug);
      setError(null);
      const response = await fetch('/api/themes/active', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ theme: slug })
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to activate theme');
      }
      setActiveTheme(slug);
    } catch (err) {
      setError(err.message);
    } finally {
      setActivating(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Themes</h1>
      </div>

      <AiThemeGenerator onThemeGenerated={() => fetchThemes()} />

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error}
          <button onClick={() => setError(null)} className="float-right font-bold">&times;</button>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
          <p className="mt-4 text-gray-600">Loading themes...</p>
        </div>
      ) : themes.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
          <p className="text-gray-600">No themes found. Add theme directories to the /themes folder.</p>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-6">
          {themes.map((theme) => (
            <div
              key={theme.slug}
              className={`bg-white rounded-lg overflow-hidden ${
                theme.slug === activeTheme
                  ? 'border-2 border-blue-600'
                  : 'border border-gray-200'
              }`}
            >
              <div className="h-[120px] bg-gradient-to-br from-indigo-50 to-indigo-100 flex items-center justify-center">
                <Palette className="w-12 h-12 text-indigo-500 opacity-50" />
              </div>

              <div className="p-5">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="text-lg font-semibold text-gray-900">
                    {theme.name}
                  </h3>
                  {theme.slug === activeTheme && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      <Check className="w-3 h-3" />
                      Active
                    </span>
                  )}
                </div>

                <p className="text-sm text-gray-500 mb-3">
                  {theme.description || 'No description'}
                </p>

                <div className="text-xs text-gray-400 mb-4">
                  <span>v{theme.version}</span>
                  {theme.inherits && (
                    <span> &middot; extends <strong>{theme.inherits}</strong></span>
                  )}
                </div>

                <div className="flex gap-2">
                  {theme.slug !== activeTheme && (
                    <button
                      className="btn btn-primary flex-1 py-2 text-sm"
                      onClick={() => handleActivate(theme.slug)}
                      disabled={activating === theme.slug}
                    >
                      {activating === theme.slug ? 'Activating...' : 'Activate'}
                    </button>
                  )}
                  <Link
                    to={`/themes/${theme.slug}/editor`}
                    className="btn btn-secondary flex-1 py-2 text-sm flex items-center justify-center gap-2"
                  >
                    <Code className="w-4 h-4" />
                    Edit Code
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
