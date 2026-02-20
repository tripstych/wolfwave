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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
          {themes.map((theme) => (
            <div
              key={theme.slug}
              className="bg-white border rounded-lg overflow-hidden"
              style={{
                borderColor: theme.slug === activeTheme ? '#2563eb' : '#e5e7eb',
                borderWidth: theme.slug === activeTheme ? '2px' : '1px'
              }}
            >
              <div style={{
                height: '120px',
                background: 'linear-gradient(135deg, #f0f4ff 0%, #e0e7ff 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Palette style={{ width: '48px', height: '48px', color: '#6366f1', opacity: 0.5 }} />
              </div>

              <div style={{ padding: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                  <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#111827' }}>
                    {theme.name}
                  </h3>
                  {theme.slug === activeTheme && (
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      padding: '0.125rem 0.5rem',
                      borderRadius: '9999px',
                      fontSize: '0.75rem',
                      fontWeight: 500,
                      backgroundColor: '#d1fae5',
                      color: '#065f46'
                    }}>
                      <Check style={{ width: '12px', height: '12px' }} />
                      Active
                    </span>
                  )}
                </div>

                <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.75rem' }}>
                  {theme.description || 'No description'}
                </p>

                <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginBottom: '1rem' }}>
                  <span>v{theme.version}</span>
                  {theme.inherits && (
                    <span> &middot; extends <strong>{theme.inherits}</strong></span>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {theme.slug !== activeTheme && (
                    <button
                      className="btn btn-primary"
                      style={{ flex: 1, padding: '0.5rem 1rem', fontSize: '0.875rem' }}
                      onClick={() => handleActivate(theme.slug)}
                      disabled={activating === theme.slug}
                    >
                      {activating === theme.slug ? 'Activating...' : 'Activate'}
                    </button>
                  )}
                  <Link
                    to={`/themes/${theme.slug}/editor`}
                    className="btn btn-secondary"
                    style={{ flex: 1, padding: '0.5rem 1rem', fontSize: '0.875rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
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
