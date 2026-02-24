import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Check, Palette, Code, Upload, FolderOpen, Loader2, CheckCircle2, AlertCircle, ArrowRight, FileCode, X, Type, Zap, Cpu, Globe, Sparkles } from 'lucide-react';
import AiThemeGenerator from './AiThemeGenerator';
import api from '../lib/api';
import { useTranslation } from '../context/TranslationContext';

export default function Themes() {
  const { _ } = useTranslation();
  const [themes, setThemes] = useState([]);
  const [activeTheme, setActiveTheme] = useState('default');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activating, setActivating] = useState(null);
  const [flushContent, setFlushContent] = useState(false);

  // WP Theme Import state
  const [wpFile, setWpFile] = useState(null);
  const [wpPreview, setWpPreview] = useState(null);
  const [wpLoading, setWpLoading] = useState(false);
  const [wpResult, setWpResult] = useState(null);
  const [wpSelectedFiles, setWpSelectedFiles] = useState(new Set());
  const [wpScanFunctions, setWpScanFunctions] = useState(false);

  // Live Theme Import state
  const [liveUrl, setLiveUrl] = useState('');
  const [liveName, setLiveName] = useState('');
  const [liveImporting, setLiveImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(null);
  const [nonsenseBlurb, setNonsenseBlurb] = useState('');

  const nonsenseBlurbs = [
    'Reticulating splines...',
    'Generating semantic meaningfulness...',
    'Decompressing layout photons...',
    'Consulting the AI architect...',
    'Optimizing the CSS flavor profiles...',
    'Localizing asset gravity...',
    'Buffering digital vibes...',
    'Aligning template chakras...',
    'Teaching the LLM how to code...',
    'Scanning for hidden easter eggs...',
    'Polishing the pixels...'
  ];

  useEffect(() => {
    let interval;
    if (liveImporting || wpLoading) {
      setNonsenseBlurb(nonsenseBlurbs[0]);
      interval = setInterval(() => {
        setNonsenseBlurb(prev => {
          const idx = nonsenseBlurbs.indexOf(prev);
          return nonsenseBlurbs[(idx + 1) % nonsenseBlurbs.length];
        });
      }, 3500);
    }
    return () => clearInterval(interval);
  }, [liveImporting, wpLoading]);

  const pollProgress = async (taskId) => {
    try {
      const res = await api.get(`/import/progress/${taskId}`);
      if (res && res.status) {
        setImportProgress(res);
        if (res.status === 'Theme import complete!' || res.status.startsWith('Error:')) {
          return true; // Stop polling
        }
      }
    } catch (e) { console.warn('Progress poll failed', e); }
    return false;
  };

  const handleLiveImport = async (e) => {
    e.preventDefault();
    if (!liveUrl) return;
    const taskId = `live-import-${Date.now()}`;
    setLiveImporting(true);
    setImportProgress({ status: 'Connecting to site...' });
    
    // Start polling
    const pollInterval = setInterval(async () => {
      const shouldStop = await pollProgress(taskId);
      if (shouldStop) clearInterval(pollInterval);
    }, 2000);

    try {
      const res = await api.post('/import/wp-theme/live-import', { url: liveUrl, name: liveName, taskId });
      if (res.success) {
        clearInterval(pollInterval);
        setImportProgress(null);
        alert(_('themes.live_import.success', 'Theme imported successfully from live site!'));
        setLiveUrl('');
        setLiveName('');
        fetchThemes();
      }
    } catch (err) { 
      clearInterval(pollInterval);
      alert(_('themes.live_import.failed', 'Live import failed: ') + err.message); 
    }
    finally { 
      setLiveImporting(false); 
      setImportProgress(null);
    }
  };

  const handleWpFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setWpFile(file);
    setWpPreview(null);
    setWpResult(null);
    setWpLoading(true);
    setWpScanFunctions(false);
    try {
      const formData = new FormData();
      formData.append('theme', file);
      const data = await api.post('/import/wp-theme/preview', formData);
      if (data.success) {
        setWpPreview(data);
        setWpSelectedFiles(new Set(data.detectedFiles.filter(f => f.hasMapping).map(f => f.basename)));
      } else {
        alert(_('themes.wp_import.preview_failed', 'Preview failed: ') + (data.error || _('common.unknown_error', 'Unknown error')));
      }
    } catch (err) { alert(_('themes.wp_import.preview_failed', 'Preview failed: ') + err.message); }
    finally { setWpLoading(false); }
  };

  const handleWpConvert = async () => {
    if (!wpFile) return;
    const taskId = `wp-convert-${Date.now()}`;
    setWpLoading(true);
    setImportProgress({ status: 'Starting conversion...' });

    // Start polling
    const pollInterval = setInterval(async () => {
      const shouldStop = await pollProgress(taskId);
      if (shouldStop) clearInterval(pollInterval);
    }, 2000);

    try {
      const formData = new FormData();
      formData.append('theme', wpFile);
      formData.append('selectedFiles', JSON.stringify(Array.from(wpSelectedFiles)));
      formData.append('scanFunctions', wpScanFunctions);
      formData.append('taskId', taskId);
      const data = await api.post('/import/wp-theme/convert', formData);
      if (data.success) {
        clearInterval(pollInterval);
        setImportProgress(null);
        setWpResult(data);
        fetchThemes();
      } else {
        clearInterval(pollInterval);
        alert(_('themes.wp_import.conversion_failed', 'Conversion failed: ') + (data.error || _('common.unknown_error', 'Unknown error')));
      }
    } catch (err) { 
      clearInterval(pollInterval);
      alert(_('themes.wp_import.conversion_failed', 'Conversion failed: ') + err.message); 
    }
    finally { 
      setWpLoading(false); 
      setImportProgress(null);
    }
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-4">
            <div className="card p-6">
              <h2 className="font-semibold mb-4 flex items-center gap-2">
                <Globe className="w-5 h-5 text-primary-600" />
                {_('themes.live_import.title', 'Import Theme from URL')}
              </h2>
              <p className="text-sm text-gray-500 mb-4">{_('themes.live_import.subtitle', 'Crawl a live website to extract its CSS/JS and generate matching templates.')}</p>
              
              <form onSubmit={handleLiveImport} className="space-y-3">
                <input 
                  id="input-live-url"
                  type="text" 
                  className="input text-sm" 
                  placeholder="https://example.com" 
                  value={liveUrl}
                  onChange={e => setLiveUrl(e.target.value)}
                  onBlur={e => {
                    let v = e.target.value.trim();
                    if (v && !/^https?:\/\//i.test(v)) setLiveUrl('https://' + v);
                  }}
                  required
                />
                <input 
                  id="input-live-theme-name"
                  type="text" 
                  className="input text-sm" 
                  placeholder="Theme Name (Optional)" 
                  value={liveName}
                  onChange={e => setLiveName(e.target.value)}
                />
                <button id="btn-live-import" type="submit" disabled={liveImporting} className="btn btn-primary w-full">
                  {liveImporting ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> {_('themes.live_import.importing', 'Importing...')}</> : _('themes.live_import.btn', 'Import from URL')}
                </button>
              </form>

              {importProgress && (
                <div className="mt-4 p-3 bg-blue-50 border border-blue-100 rounded-lg animate-pulse">
                  <div className="flex items-center gap-2 text-blue-700 font-medium text-xs mb-1">
                    <Sparkles className="w-3 h-3" />
                    {importProgress.status}
                  </div>
                  {importProgress.steps && importProgress.steps.length > 1 && (
                    <div className="text-[10px] text-blue-500 overflow-hidden h-4 italic">
                      {importProgress.steps[importProgress.steps.length - 2]}
                    </div>
                  )}
                  <div className="text-[9px] text-blue-400 mt-2 font-mono uppercase tracking-widest text-center opacity-70">
                    {nonsenseBlurb}
                  </div>
                </div>
              )}
            </div>

            <div className="card p-6">
              <h2 className="font-semibold mb-4 flex items-center gap-2">
                <FolderOpen className="w-5 h-5 text-primary-600" />
                {_('themes.wp_import.title', 'Import WordPress Theme')}
              </h2>
              <p className="text-sm text-gray-500 mb-4">{_('themes.wp_import.subtitle', 'Upload a WordPress theme ZIP to convert its PHP templates into Nunjucks.')}</p>

              <label className="block border-2 border-dashed border-gray-200 rounded-lg p-8 text-center cursor-pointer hover:border-primary-300 hover:bg-primary-50/30 transition-colors">
                <input id="input-wp-theme-zip" type="file" accept=".zip" onChange={handleWpFileSelect} className="hidden" />
                {wpFile ? (
                  <div>
                    <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-2" />
                    <p className="font-medium text-sm">{wpFile.name}</p>
                    <p className="text-xs text-gray-400 mt-1">{(wpFile.size / 1024 / 1024).toFixed(1)} MB</p>
                  </div>
                ) : (
                  <div>
                    <Upload className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">{_('themes.wp_import.select_prompt_prefix', 'Click to select a')} <strong>.zip</strong> {_('themes.wp_import.select_prompt_suffix', 'file')}</p>
                    <p className="text-xs text-gray-400 mt-1">{_('common.max_size', 'Max 50MB')}</p>
                  </div>
                )}
              </label>

              {wpLoading && !wpPreview && (
                <div className="flex items-center justify-center gap-2 mt-4 text-sm text-gray-500">
                  <Loader2 className="w-4 h-4 animate-spin" /> {_('themes.wp_import.analyzing', 'Analyzing theme...')}
                </div>
              )}

              {importProgress && wpLoading && (
                <div className="mt-4 p-3 bg-indigo-50 border border-indigo-100 rounded-lg animate-pulse">
                  <div className="flex items-center gap-2 text-indigo-700 font-medium text-xs mb-1">
                    <Zap className="w-3 h-3" />
                    {importProgress.status}
                  </div>
                  {importProgress.steps && importProgress.steps.length > 1 && (
                    <div className="text-[10px] text-indigo-500 overflow-hidden h-4 italic">
                      {importProgress.steps[importProgress.steps.length - 2]}
                    </div>
                  )}
                  <div className="text-[9px] text-indigo-400 mt-2 font-mono uppercase tracking-widest text-center opacity-70">
                    {nonsenseBlurb}
                  </div>
                </div>
              )}
            </div>

            {wpPreview && wpPreview.metadata && (
              <div className="card p-4 space-y-3">
                <h3 className="font-bold text-lg">{wpPreview.metadata.theme_name || _('themes.wp_import.unknown_theme', 'Unknown Theme')}</h3>
                {wpPreview.metadata.author && <p className="text-sm text-gray-500">{_('common.by', 'By')} {wpPreview.metadata.author}</p>}
                {wpPreview.metadata.version && <p className="text-xs text-gray-400">v{wpPreview.metadata.version}</p>}
                {wpPreview.metadata.description && <p className="text-sm text-gray-600 mt-2">{wpPreview.metadata.description}</p>}
                {wpPreview.isChildTheme && (
                  <div className={`p-2 rounded border text-xs flex flex-col gap-1 ${wpPreview.parentThemeFound ? 'bg-green-50 border-green-200 text-green-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
                    <div className="flex items-center gap-1 font-bold">
                      <AlertCircle className="w-3 h-3" />
                      {_('themes.wp_import.child_of', 'Child theme of:')} {wpPreview.parentTheme}
                    </div>
                    {wpPreview.parentThemeFound ? (
                      <p>{_('themes.wp_import.parent_found', 'Parent found! This theme will automatically inherit all parent templates.')}</p>
                    ) : (
                      <p>{_('themes.wp_import.parent_not_found', 'Warning: Parent theme not found in /themes directory. You should import the parent theme first for best results.')}</p>
                    )}
                  </div>
                )}
                {wpPreview.themeStyles && (
                  <div className="border-t pt-3 mt-3 space-y-2">
                    <h4 className="text-xs font-bold uppercase text-gray-400">{_('themes.wp_import.detected_styles', 'Detected Styles')}</h4>
                    {wpPreview.themeStyles.primaryColor && (
                      <div className="flex items-center gap-2 text-sm">
                        <div className="w-5 h-5 rounded border" style={{ background: wpPreview.themeStyles.primaryColor }}></div>
                        <span className="text-gray-600">{_('common.primary', 'Primary')}: <code className="text-xs bg-gray-100 px-1 rounded">{wpPreview.themeStyles.primaryColor}</code></span>
                      </div>
                    )}
                    {wpPreview.themeStyles.secondaryColor && (
                      <div className="flex items-center gap-2 text-sm">
                        <div className="w-5 h-5 rounded border" style={{ background: wpPreview.themeStyles.secondaryColor }}></div>
                        <span className="text-gray-600">{_('common.secondary', 'Secondary')}: <code className="text-xs bg-gray-100 px-1 rounded">{wpPreview.themeStyles.secondaryColor}</code></span>
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
                <div className="flex gap-2 text-xs text-gray-500 pt-2 flex-wrap">
                  <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">{wpPreview.templateCount} {_('themes.wp_import.templates_count', 'templates')}</span>
                  <span className="bg-gray-100 px-2 py-0.5 rounded-full">{wpPreview.partialCount} {_('themes.wp_import.partials_count', 'partials')}</span>
                  <span className="bg-gray-100 px-2 py-0.5 rounded-full">{wpPreview.layoutCount} {_('themes.wp_import.layouts_count', 'layout files')}</span>
                </div>

                {wpPreview.plugins?.length > 0 && (
                  <div className="border-t pt-3 mt-3 space-y-2">
                    <h4 className="text-xs font-bold uppercase text-gray-400">{_('themes.wp_import.detected_plugins', 'Detected Plugins')}</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {wpPreview.plugins.map((plugin, i) => (
                        <span key={i} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium bg-purple-50 text-purple-700 border border-purple-200">
                          <Zap className="w-3 h-3" />
                          {plugin}
                        </span>
                      ))}
                    </div>
                    {wpPreview.needsLLM && (
                      <div className="bg-indigo-50 border border-indigo-200 rounded p-2 text-xs text-indigo-700 flex items-start gap-2 mt-2">
                        <Cpu className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>
                          <strong>{wpPreview.filesNeedingLLM}</strong> {_('themes.wp_import.ai_conversion_prefix', 'file(s) will use AI-assisted conversion for')} {wpPreview.plugins.filter(p => ['Elementor', 'ACF'].includes(p)).join(' & ')} {_('themes.wp_import.ai_conversion_suffix', 'support.')}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="lg:col-span-2">
            {!wpPreview && !wpResult ? (
              <div className="card h-full flex flex-col items-center justify-center p-12 text-gray-400 border-dashed border-2">
                <Upload className="w-12 h-12 mb-4 opacity-20" />
                <p>{_('themes.wp_import.preview_placeholder', 'Upload a WordPress theme ZIP to preview.')}</p>
              </div>
            ) : wpResult ? (
              <div className="space-y-4">
                <div className="card p-6 bg-green-50 border-green-200">
                  <div className="flex items-center gap-3 mb-4">
                    <CheckCircle2 className="w-8 h-8 text-green-600" />
                    <div>
                      <h2 className="font-bold text-lg text-green-900">{_('themes.wp_import.success_title', 'Theme Converted Successfully')}</h2>
                      <p className="text-sm text-green-700">{wpResult.templates?.length || 0} {_('themes.wp_import.templates_generated', 'templates generated from')} {wpResult.themeName}</p>
                    </div>
                  </div>
                  {wpResult.warnings?.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded p-3 mb-4">
                      <h4 className="text-xs font-bold text-amber-700 mb-1">{_('common.warnings', 'Warnings')}</h4>
                      {wpResult.warnings.map((w, i) => <p key={i} className="text-xs text-amber-600">{w}</p>)}
                    </div>
                  )}
                </div>
                <div className="card overflow-hidden">
                  <div className="p-3 bg-gray-50 border-b">
                    <h3 className="font-bold text-sm text-gray-700">{_('themes.wp_import.generated_templates', 'Generated Templates')}</h3>
                  </div>
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                      <tr>
                        <th className="px-4 py-2 text-left">{_('common.source', 'Source')}</th>
                        <th className="px-4 py-2 text-left">{_('themes.wp_import.generated_file', 'Generated File')}</th>
                        <th className="px-4 py-2 text-left">{_('common.content_type', 'Content Type')}</th>
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
                <button onClick={resetWpImport} className="btn btn-secondary">{_('themes.wp_import.import_another', 'Import Another Theme')}</button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="card overflow-hidden">
                  <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                    <h3 className="font-bold text-gray-700">{_('themes.wp_import.template_files', 'Template Files')}</h3>
                    <div className="flex items-center gap-4">
                      {wpPreview.hasFunctionsPhp && (
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input 
                            type="checkbox" 
                            className="rounded border-gray-300 text-primary-600 focus:ring-primary-600"
                            checked={wpScanFunctions}
                            onChange={(e) => setWpScanFunctions(e.target.checked)}
                          />
                          <span className="text-xs text-gray-600 font-medium">{_('themes.wp_import.scan_functions', 'Scan functions.php for extra assets')}</span>
                        </label>
                      )}
                      <button 
                        id="btn-wp-convert"
                        onClick={handleWpConvert} 
                        disabled={wpLoading || (wpPreview.templateCount > 0 && wpSelectedFiles.size === 0)} 
                        className="btn btn-primary"
                      >
                        {wpLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ArrowRight className="w-4 h-4 mr-2" />}
                        {wpSelectedFiles.size > 0 
                          ? `${_('themes.wp_import.convert_btn', 'Convert')} ${wpSelectedFiles.size} ${_('themes.wp_import.convert_btn_suffix', 'Templates')}`
                          : _('themes.wp_import.convert_theme_btn', 'Convert Theme')
                        }
                      </button>
                    </div>
                  </div>

                  {wpPreview.detectedFiles.filter(f => f.isLayout).length > 0 && (
                    <div>
                      <div className="px-4 py-2 bg-slate-50 border-b">
                        <h4 className="text-[10px] uppercase font-bold text-gray-400">{_('themes.wp_import.layouts_info', 'Layout Files (auto-merged into base layout)')}</h4>
                      </div>
                      {wpPreview.detectedFiles.filter(f => f.isLayout).map((f, i) => (
                        <div key={i} className="px-4 py-2.5 flex items-center gap-3 border-b text-sm bg-slate-50/50">
                          <CheckCircle2 className="w-4 h-4 text-green-400" />
                          <span className="font-mono text-xs text-gray-500">{f.source}</span>
                          <ArrowRight className="w-3 h-3 text-gray-300" />
                          <span className="text-xs text-green-700 font-medium">themes/{wpPreview.metadata?.theme_name?.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'theme'}/layouts/main.njk</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div>
                    <div className="px-4 py-2 bg-gray-50 border-b">
                      <h4 className="text-[10px] uppercase font-bold text-gray-400">{_('themes.wp_import.templates_info', 'Content Templates (select which to convert)')}</h4>
                    </div>
                    {wpPreview.detectedFiles.filter(f => f.hasMapping && !f.isLayout).length === 0 && (
                      <div className="px-4 py-8 text-center text-gray-500 italic text-sm">
                        {_('themes.wp_import.no_content_templates', 'No content templates detected. This is common for child themes.')}
                      </div>
                    )}
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
                            <span className="text-xs text-primary-700 font-medium">themes/{wpPreview.metadata?.theme_name?.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'theme'}/{f.targetDir}/{f.targetName}.njk</span>
                          </div>
                        </div>
                        <span className="text-[10px] bg-gray-100 px-2 py-0.5 rounded-full text-gray-500 shrink-0">{f.contentType}</span>
                      </div>
                    ))}
                  </div>

                  {wpPreview.detectedFiles.filter(f => f.isTemplatePart).length > 0 && (
                    <div>
                      <div className="px-4 py-2 bg-gray-50 border-b">
                        <h4 className="text-[10px] uppercase font-bold text-gray-400">{_('themes.wp_import.partials_info', 'Template Parts (auto-converted to components)')}</h4>
                      </div>
                      {wpPreview.detectedFiles.filter(f => f.isTemplatePart).map((f, i) => (
                        <div key={i} className="px-4 py-2 flex items-center gap-3 border-b text-sm opacity-60">
                          <FileCode className="w-4 h-4 text-gray-400" />
                          <span className="font-mono text-xs text-gray-500">{f.source}</span>
                          <ArrowRight className="w-3 h-3 text-gray-300" />
                          <span className="text-xs text-gray-500">themes/{wpPreview.metadata?.theme_name?.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'theme'}/components/{f.basename.replace('.php', '')}.njk</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {wpPreview.detectedFiles.filter(f => !f.hasMapping && !f.isTemplatePart && !f.isLayout).length > 0 && (
                    <div>
                      <div className="px-4 py-2 bg-gray-50 border-b">
                        <h4 className="text-[10px] uppercase font-bold text-gray-400">{_('themes.wp_import.skipped_info', 'Other PHP files (skipped)')}</h4>
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
