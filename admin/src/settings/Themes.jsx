import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Check, Palette } from 'lucide-react';
import AiThemeGenerator from './AiThemeGenerator';
import { useTranslation } from '../context/TranslationContext';

export default function Themes() {
  const { _ } = useTranslation();
  const [themes, setThemes] = useState([]);
  const [activeTheme, setActiveTheme] = useState('default');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activating, setActivating] = useState(null);
  const [flushContent, setFlushContent] = useState(false);

  useEffect(() => {
    fetchThemes();
  }, []);

  const fetchThemes = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/themes', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (!response.ok) throw new Error(_('themes.error.load_failed', 'Failed to fetch themes'));
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
        body: JSON.stringify({ theme: slug, flushContent })
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || _('themes.error.activate_failed', 'Failed to activate theme'));
      }
      setActiveTheme(slug);
      setFlushContent(false); // Reset after use
    } catch (err) {
      setError(err.message);
    } finally {
      setActivating(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">{_('themes.title', 'Themes')}</h1>
        <label className="flex items-center gap-2 cursor-pointer bg-white px-4 py-2 rounded-lg border border-gray-200 shadow-sm hover:border-red-300 transition-colors group">
          <input 
            type="checkbox" 
            className="rounded border-gray-300 text-red-600 focus:ring-red-600"
            checked={flushContent}
            onChange={(e) => setFlushContent(e.target.checked)}
          />
          <div className="flex flex-col">
            <span className="text-sm font-bold text-gray-700 group-hover:text-red-700">{_('themes.flush_content', 'Flush Content on Activation')}</span>
            <span className="text-[10px] text-gray-400 leading-none">{_('themes.flush_content_hint', 'Wipes all pages, products, blocks and history')}</span>
          </div>
        </label>
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
          <p className="mt-4 text-gray-600">{_('themes.loading', 'Loading themes...')}</p>
        </div>
      ) : themes.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
          <p className="text-gray-600">{_('themes.no_themes', 'No themes found. Add theme directories to the /themes folder.')}</p>
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
                      {_('common.active', 'Active')}
                    </span>
                  )}
                </div>

                <p className="text-sm text-gray-500 mb-3">
                  {theme.description || _('common.no_description', 'No description')}
                </p>

                <div className="text-xs text-gray-400 mb-4">
                  <span>v{theme.version}</span>
                  {theme.inherits && (
                    <span> &middot; {_('themes.extends', 'extends')} <strong>{theme.inherits}</strong></span>
                  )}
                </div>

                <div className="flex gap-2">
                  {theme.slug !== activeTheme && (
                    <button
                      className="btn btn-primary flex-1 py-2 text-sm"
                      onClick={() => handleActivate(theme.slug)}
                      disabled={activating === theme.slug}
                    >
                      {activating === theme.slug ? _('common.activating', 'Activating...') : _('common.activate', 'Activate')}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
