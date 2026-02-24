import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Check, Palette, Code, Upload, FolderOpen, Loader2, CheckCircle2, AlertCircle, ArrowRight, FileCode, X, Type } from 'lucide-react';
import AiThemeGenerator from './AiThemeGenerator';
import api from '../lib/api';

export default function Themes() {
  const [themes, setThemes] = useState([]);
  const [activeTheme, setActiveTheme] = useState('default');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activating, setActivating] = useState(null);

  // WP Theme Import state
  const [wpFile, setWpFile] = useState(null);
  const [wpPreview, setWpPreview] = useState(null);
  const [wpLoading, setWpLoading] = useState(false);
  const [wpResult, setWpResult] = useState(null);
  const [wpSelectedFiles, setWpSelectedFiles] = useState(new Set());
  const [showWpImport, setShowWpImport] = useState(false);

  const handleWpFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setWpFile(file);
    setWpPreview(null);
    setWpResult(null);
    setWpLoading(true);
    try {
      const formData = new FormData();
      formData.append('theme', file);
      const data = await api.post('/import/wp-theme/preview', formData);
      if (data.success) {
        setWpPreview(data);
        setWpSelectedFiles(new Set(data.detectedFiles.filter(f => f.hasMapping).map(f => f.basename)));
      } else {
        alert('Preview failed: ' + (data.error || 'Unknown error'));
      }
    } catch (err) { alert('Preview failed: ' + err.message); }
    finally { setWpLoading(false); }
  };

  const handleWpConvert = async () => {
    if (!wpFile) return;
    setWpLoading(true);
    try {
      const formData = new FormData();
      formData.append('theme', wpFile);
      formData.append('selectedFiles', JSON.stringify(Array.from(wpSelectedFiles)));
      const data = await api.post('/import/wp-theme/convert', formData);
      if (data.success) {
        setWpResult(data);
        fetchThemes();
      } else {
        alert('Conversion failed: ' + (data.error || 'Unknown error'));
      }
    } catch (err) { alert('Conversion failed: ' + err.message); }
    finally { setWpLoading(false); }
  };

  const toggleWpFile = (basename) => {
    const next = new Set(wpSelectedFiles);
    if (next.has(basename)) next.delete(basename);
    else next.add(basename);
    setWpSelectedFiles(next);
  };

  const resetWpImport = () => {
    setWpResult(null);
    setWpPreview(null);
    setWpFile(null);
    setWpSelectedFiles(new Set());
  };

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
        <button
          onClick={() => setShowWpImport(!showWpImport)}
          className={`btn ${showWpImport ? 'btn-secondary' : 'btn-ghost border border-gray-200'} flex items-center gap-2`}
        >
          <Upload className="w-4 h-4" />
          {showWpImport ? 'Hide WP Import' : 'Import WP Theme'}
        </button>
      </div>

      <AiThemeGenerator onThemeGenerated={() => fetchThemes()} />

      {showWpImport && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-4">
            <div className="card p-6">
              <h2 className="font-semibold mb-4 flex items-center gap-2">
                <FolderOpen className="w-5 h-5 text-primary-600" />
                Import WordPress Theme
              </h2>
              <p className="text-sm text-gray-500 mb-4">Upload a WordPress theme ZIP to convert its PHP templates into Nunjucks.</p>

              <label className="block border-2 border-dashed border-gray-200 rounded-lg p-8 text-center cursor-pointer hover:border-primary-300 hover:bg-primary-50/30 transition-colors">
                <input type="file" accept=".zip" onChange={handleWpFileSelect} className="hidden" />
                {wpFile ? (
                  <div>
                    <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-2" />
                    <p className="font-medium text-sm">{wpFile.name}</p>
                    <p className="text-xs text-gray-400 mt-1">{(wpFile.size / 1024 / 1024).toFixed(1)} MB</p>
                  </div>
                ) : (
                  <div>
                    <Upload className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">Click to select a <strong>.zip</strong> file</p>
                    <p className="text-xs text-gray-400 mt-1">Max 50MB</p>
                  </div>
                )}
              </label>

              {wpLoading && !wpPreview && (
                <div className="flex items-center justify-center gap-2 mt-4 text-sm text-gray-500">
                  <Loader2 className="w-4 h-4 animate-spin" /> Analyzing theme...
                </div>
              )}
            </div>

            {wpPreview && wpPreview.metadata && (
              <div className="card p-4 space-y-3">
                <h3 className="font-bold text-lg">{wpPreview.metadata.theme_name || 'Unknown Theme'}</h3>
                {wpPreview.metadata.author && <p className="text-sm text-gray-500">By {wpPreview.metadata.author}</p>}
                {wpPreview.metadata.version && <p className="text-xs text-gray-400">v{wpPreview.metadata.version}</p>}
                {wpPreview.metadata.description && <p className="text-sm text-gray-600 mt-2">{wpPreview.metadata.description}</p>}
                {wpPreview.isChildTheme && (
                  <div className="bg-amber-50 border border-amber-200 rounded p-2 text-xs text-amber-700">
                    <AlertCircle className="w-3 h-3 inline mr-1" />
                    Child theme of <strong>{wpPreview.parentTheme}</strong> — parent theme templates not included.
                  </div>
                )}
                {wpPreview.themeStyles && (
                  <div className="border-t pt-3 mt-3 space-y-2">
                    <h4 className="text-xs font-bold uppercase text-gray-400">Detected Styles</h4>
                    {wpPreview.themeStyles.primaryColor && (
                      <div className="flex items-center gap-2 text-sm">
                        <div className="w-5 h-5 rounded border" style={{ background: wpPreview.themeStyles.primaryColor }}></div>
                        <span className="text-gray-600">Primary: <code className="text-xs bg-gray-100 px-1 rounded">{wpPreview.themeStyles.primaryColor}</code></span>
                      </div>
                    )}
                    {wpPreview.themeStyles.secondaryColor && (
                      <div className="flex items-center gap-2 text-sm">
                        <div className="w-5 h-5 rounded border" style={{ background: wpPreview.themeStyles.secondaryColor }}></div>
                        <span className="text-gray-600">Secondary: <code className="text-xs bg-gray-100 px-1 rounded">{wpPreview.themeStyles.secondaryColor}</code></span>
                      </div>
                    )}
                    {wpPreview.themeStyles.fonts?.length > 0 && (
                      <div className="flex items-center gap-2 text-sm">
                        <Type className="w-4 h-4 text-gray-400" />
                        <span className="text-gray-600">{wpPreview.themeStyles.fonts.join(', ')}</span>
                      </div>
                    )}
                  </div>
                )}
                <div className="flex gap-2 text-xs text-gray-500 pt-2">
                  <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">{wpPreview.templateCount} templates</span>
                  <span className="bg-gray-100 px-2 py-0.5 rounded-full">{wpPreview.partialCount} partials</span>
                  <span className="bg-gray-100 px-2 py-0.5 rounded-full">{wpPreview.layoutCount} layout files</span>
                </div>
              </div>
            )}
          </div>

          <div className="lg:col-span-2">
            {!wpPreview && !wpResult ? (
              <div className="card h-full flex flex-col items-center justify-center p-12 text-gray-400 border-dashed border-2">
                <Upload className="w-12 h-12 mb-4 opacity-20" />
                <p>Upload a WordPress theme ZIP to preview.</p>
              </div>
            ) : wpResult ? (
              <div className="space-y-4">
                <div className="card p-6 bg-green-50 border-green-200">
                  <div className="flex items-center gap-3 mb-4">
                    <CheckCircle2 className="w-8 h-8 text-green-600" />
                    <div>
                      <h2 className="font-bold text-lg text-green-900">Theme Converted Successfully</h2>
                      <p className="text-sm text-green-700">{wpResult.templates?.length || 0} templates generated from {wpResult.themeName}</p>
                    </div>
                  </div>
                  {wpResult.warnings?.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded p-3 mb-4">
                      <h4 className="text-xs font-bold text-amber-700 mb-1">Warnings</h4>
                      {wpResult.warnings.map((w, i) => <p key={i} className="text-xs text-amber-600">{w}</p>)}
                    </div>
                  )}
                </div>
                <div className="card overflow-hidden">
                  <div className="p-3 bg-gray-50 border-b">
                    <h3 className="font-bold text-sm text-gray-700">Generated Templates</h3>
                  </div>
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                      <tr>
                        <th className="px-4 py-2 text-left">Source</th>
                        <th className="px-4 py-2 text-left">Generated File</th>
                        <th className="px-4 py-2 text-left">Content Type</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {(wpResult.templates || []).map((t, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-mono text-xs text-gray-500">{t.source}</td>
                          <td className="px-4 py-3"><span className="font-medium text-primary-700">{t.filename}</span></td>
                          <td className="px-4 py-3"><span className="text-xs bg-gray-100 px-2 py-0.5 rounded-full">{t.contentType}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button onClick={resetWpImport} className="btn btn-secondary">Import Another Theme</button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="card overflow-hidden">
                  <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                    <h3 className="font-bold text-gray-700">Template Files</h3>
                    <button onClick={handleWpConvert} disabled={wpLoading || wpSelectedFiles.size === 0} className="btn btn-primary">
                      {wpLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ArrowRight className="w-4 h-4 mr-2" />}
                      Convert {wpSelectedFiles.size} Templates
                    </button>
                  </div>

                  {wpPreview.detectedFiles.filter(f => f.isLayout).length > 0 && (
                    <div>
                      <div className="px-4 py-2 bg-slate-50 border-b">
                        <h4 className="text-[10px] uppercase font-bold text-gray-400">Layout Files (auto-merged into base layout)</h4>
                      </div>
                      {wpPreview.detectedFiles.filter(f => f.isLayout).map((f, i) => (
                        <div key={i} className="px-4 py-2.5 flex items-center gap-3 border-b text-sm bg-slate-50/50">
                          <CheckCircle2 className="w-4 h-4 text-green-400" />
                          <span className="font-mono text-xs text-gray-500">{f.source}</span>
                          <ArrowRight className="w-3 h-3 text-gray-300" />
                          <span className="text-xs text-green-700 font-medium">layouts/wp-{wpPreview.metadata?.theme_name?.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'theme'}.njk</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div>
                    <div className="px-4 py-2 bg-gray-50 border-b">
                      <h4 className="text-[10px] uppercase font-bold text-gray-400">Content Templates (select which to convert)</h4>
                    </div>
                    {wpPreview.detectedFiles.filter(f => f.hasMapping && !f.isLayout).map((f, i) => (
                      <div
                        key={i}
                        onClick={() => toggleWpFile(f.basename)}
                        className={`px-4 py-3 flex items-center gap-3 border-b cursor-pointer hover:bg-gray-50 ${wpSelectedFiles.has(f.basename) ? 'bg-primary-50' : ''}`}
                      >
                        <input type="checkbox" className="rounded border-gray-300 text-primary-600 focus:ring-primary-600 pointer-events-none" checked={wpSelectedFiles.has(f.basename)} readOnly />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-gray-600">{f.source}</span>
                            <ArrowRight className="w-3 h-3 text-gray-300 shrink-0" />
                            <span className="text-xs text-primary-700 font-medium">{f.targetDir}/wp-*-{f.targetName}.njk</span>
                          </div>
                        </div>
                        <span className="text-[10px] bg-gray-100 px-2 py-0.5 rounded-full text-gray-500 shrink-0">{f.contentType}</span>
                      </div>
                    ))}
                  </div>

                  {wpPreview.detectedFiles.filter(f => f.isTemplatePart).length > 0 && (
                    <div>
                      <div className="px-4 py-2 bg-gray-50 border-b">
                        <h4 className="text-[10px] uppercase font-bold text-gray-400">Template Parts (auto-converted to components)</h4>
                      </div>
                      {wpPreview.detectedFiles.filter(f => f.isTemplatePart).map((f, i) => (
                        <div key={i} className="px-4 py-2 flex items-center gap-3 border-b text-sm opacity-60">
                          <FileCode className="w-4 h-4 text-gray-400" />
                          <span className="font-mono text-xs text-gray-500">{f.source}</span>
                          <ArrowRight className="w-3 h-3 text-gray-300" />
                          <span className="text-xs text-gray-500">components/wp-*-{f.basename.replace('.php', '')}.njk</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {wpPreview.detectedFiles.filter(f => !f.hasMapping && !f.isTemplatePart && !f.isLayout).length > 0 && (
                    <div>
                      <div className="px-4 py-2 bg-gray-50 border-b">
                        <h4 className="text-[10px] uppercase font-bold text-gray-400">Other PHP files (skipped)</h4>
                      </div>
                      {wpPreview.detectedFiles.filter(f => !f.hasMapping && !f.isTemplatePart && !f.isLayout).map((f, i) => (
                        <div key={i} className="px-4 py-2 flex items-center gap-2 border-b text-xs text-gray-400 opacity-50">
                          <X className="w-3 h-3" />
                          <span className="font-mono">{f.source}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

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
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
