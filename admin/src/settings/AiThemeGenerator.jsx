import React, { useState, useEffect } from 'react';
import { Sparkles, Loader2, Image as ImageIcon, Palette, Layout, Type, RefreshCw, Eye } from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';

export default function AiThemeGenerator({ onThemeGenerated }) {
  const [industry, setIndustry] = useState('');
  const [generating, setGenerating] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState(null);
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Preview State
  const [previewData, setPreviewData] = useState(null);
  const [scaffolds, setScaffolds] = useState([]);
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [activePreview, setActivePreview] = useState('homepage');

  const fetchScaffolds = async () => {
    try {
      const resp = await api.get('/ai/scaffolds');
      setScaffolds(resp || []);
    } catch (e) {
      console.error('Failed to fetch scaffolds', e);
    }
  };

  const handleInitialDraft = async (e) => {
    e.preventDefault();
    if (!industry.trim()) return;

    setGenerating(true);
    setError(null);
    setStatus('text');
    setPreviewHtml('');
    const toastId = toast.loading('Architecting your theme plan...');

    try {
      const response = await api.post('/ai/draft-theme', { industry });
      setPreviewData(response.plan);
      await fetchScaffolds();
      toast.success('Theme plan ready for review!', { id: toastId });
      
      // Auto-generate initial preview
      handlePreview(response.plan);
    } catch (err) {
      setError(err.message);
      toast.error('Drafting failed: ' + err.message, { id: toastId });
    } finally {
      setGenerating(false);
      setStatus('');
    }
  };

  const handlePreview = async (plan, page = 'homepage') => {
    setPreviewLoading(true);
    try {
      const response = await api.post('/ai/preview-theme', { plan, page });
      setPreviewHtml(response.html);
      setActivePreview(page);
    } catch (err) {
      toast.error('Preview failed: ' + err.message);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleFinalGenerate = async () => {
    setGenerating(true);
    const toastId = toast.loading('Building and activating your theme...');
    
    try {
      const data = await api.post('/ai/generate-theme', { industry, plan: previewData });
      if (onThemeGenerated) onThemeGenerated(data.slug);
      
      toast.success('Theme activated successfully!', { id: toastId });
      setPreviewData(null);
      setPreviewHtml('');
      setIndustry('');
      setIsExpanded(false);
    } catch (err) {
      toast.error('Generation failed: ' + err.message, { id: toastId });
    } finally {
      setGenerating(false);
    }
  };

  const updatePreviewField = (page, key, value) => {
    setPreviewData(prev => ({
      ...prev,
      pages: {
        ...prev.pages,
        [page]: {
          ...prev.pages[page],
          content: {
            ...prev.pages[page].content,
            [key]: value
          }
        }
      }
    }));
  };

  const updateColor = (key, value) => {
    setPreviewData(prev => ({
      ...prev,
      css_variables: { ...prev.css_variables, [key]: value }
    }));
  };
  
  const resetAll = () => {
    setPreviewData(null);
    setPreviewHtml('');
    setIndustry('');
    setIsExpanded(false);
  }
  
  const activePageContent = previewData?.pages[activePreview]?.content;

  return (
    <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100 rounded-xl p-6 mb-8 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="p-3 bg-white rounded-lg shadow-sm">
          <Sparkles className="w-6 h-6 text-indigo-600" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">AI Theme Architect</h2>
          <p className="text-sm text-gray-600 mb-4">
            Describe your business or industry. Our AI will draft a complete theme with multiple pages for you to preview and approve.
          </p>

          {!previewData ? (
            <form onSubmit={handleInitialDraft} className="space-y-3">
              <textarea
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                onFocus={() => setIsExpanded(true)}
                placeholder="e.g. 'Cyberpunk Coffee Shop with neon green accents, dark background, and 3 feature sections for coffee, events, and membership...'"
                className={`w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-inner transition-all duration-300 ease-in-out ${
                  isExpanded ? 'h-32' : 'h-14'
                }`}
                disabled={generating}
              />
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-400 italic">Try being as specific as possible about sections and "vibe".</span>
                <button
                  type="submit"
                  disabled={generating || !industry.trim()}
                  className="px-6 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-md hover:shadow-lg transition-all"
                >
                  {generating ? <><Loader2 className="w-4 h-4 animate-spin" /> Architecting...</> : <><Sparkles className="w-4 h-4" /> Draft Plan</>}
                </button>
              </div>
            </form>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 mt-4">
              {/* --- CONTROL PANEL --- */}
              <div className="bg-white border border-indigo-200 rounded-xl p-6 space-y-8 shadow-xl animate-in fade-in slide-in-from-top-4 duration-500">
                <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                  <div className="flex items-center gap-2 text-indigo-900">
                    <Palette className="w-5 h-5" />
                    <h3 className="font-bold text-lg">Theme Blueprint & Strategy</h3>
                  </div>
                  <button onClick={resetAll} className="px-3 py-1 text-sm text-gray-400 hover:text-red-500 font-medium transition-colors">
                    Cancel & Reset
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  {/* Layout Column */}
                  <div className="space-y-6">
                    <div className="flex items-center gap-2 text-gray-700 font-bold text-xs uppercase tracking-widest">
                      <Palette className="w-4 h-4" /> Color Swatch
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      {Object.entries(previewData.css_variables).map(([key, value]) => (
                        <div key={key} className="space-y-1">
                          <label className="block text-[10px] text-gray-400 font-medium">{key.replace('--nano-', '')}</label>
                          <div className="flex items-center gap-2 bg-gray-50 p-1.5 rounded-lg border border-gray-100">
                            <input type="color" value={value} onChange={(e) => updateColor(key, e.target.value)} className="h-6 w-6 rounded border-0 cursor-pointer p-0 bg-transparent" />
                            <span className="text-[10px] font-mono text-gray-600">{value}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Content Column */}
                  <div className="lg:col-span-2 space-y-6">
                    <div className="flex items-center gap-2 text-gray-700 font-bold text-xs uppercase tracking-widest">
                      <Type className="w-4 h-4" /> Generated Copy ({activePreview})
                    </div>
                    
                    {activePageContent && Object.entries(activePageContent).map(([key, value]) => {
                      if (typeof value !== 'string') return null; // Skip repeaters for now
                      const Tag = value.length > 100 ? 'textarea' : 'input';
                      return (
                        <div key={key}>
                          <label className="block text-[10px] text-gray-400 font-bold uppercase mb-1 ml-1">{key.replace(/_/g, ' ')}</label>
                          <Tag
                            type="text"
                            value={value}
                            onChange={(e) => updatePreviewField(activePreview, key, e.target.value)}
                            className="w-full text-sm border-gray-200 rounded-lg p-3 shadow-sm focus:ring-2 focus:ring-indigo-100"
                            rows={Tag === 'textarea' ? 3 : undefined}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-indigo-600 p-6 rounded-xl flex flex-col md:flex-row items-center justify-between gap-4 shadow-lg shadow-indigo-200">
                  <div className="text-white">
                    <h4 className="font-bold">Ready to build?</h4>
                    <p className="text-indigo-100 text-sm">We'll generate your theme files, assets, and DALL-E imagery now.</p>
                  </div>
                  <button onClick={handleFinalGenerate} disabled={generating} className="w-full md:w-auto px-10 py-3 bg-white text-indigo-600 font-black rounded-lg hover:bg-indigo-50 shadow-md flex items-center justify-center gap-2 transform transition hover:-translate-y-0.5 active:translate-y-0">
                    {generating ? <><Loader2 className="w-5 h-5 animate-spin" /> Building...</> : <><Sparkles className="w-5 h-5" /> CONFIRM & ACTIVATE</>}
                  </button>
                </div>
              </div>

              {/* --- PREVIEW PANEL --- */}
              <div className="bg-white rounded-xl shadow-2xl shadow-indigo-200/50 border border-gray-200 flex flex-col animate-in fade-in slide-in-from-right-8 duration-700">
                <div className="flex items-center justify-between p-3 border-b bg-gray-50/50 rounded-t-xl">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <span className="w-3 h-3 bg-red-400 rounded-full"></span>
                      <span className="w-3 h-3 bg-yellow-400 rounded-full"></span>
                      <span className="w-3 h-3 bg-green-400 rounded-full"></span>
                    </div>
                    <div className="flex items-center gap-2">
                       <div className="relative">
                          <select 
                            value={activePreview} 
                            onChange={(e) => handlePreview(previewData, e.target.value)}
                            className="text-xs font-bold text-gray-600 pl-2 pr-6 py-1 appearance-none bg-transparent"
                            disabled={previewLoading}
                          >
                          {Object.keys(previewData.pages).map(pageKey => (
                            <option key={pageKey} value={pageKey}>{pageKey.replace(/-/g, ' ')}</option>
                          ))}
                          </select>
                           <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-1 text-gray-700">
                            <svg className="fill-current h-3 w-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                          </div>
                       </div>
                    </div>
                  </div>
                  <button onClick={() => handlePreview(previewData, activePreview)} disabled={previewLoading} className="p-2 rounded-md hover:bg-gray-200 text-gray-500 hover:text-gray-800 transition-colors">
                    {previewLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  </button>
                </div>
                <div className="flex-1 relative bg-gray-100">
                  {previewLoading && (
                    <div className="absolute inset-0 bg-white/60 backdrop-blur-sm flex items-center justify-center z-10">
                      <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                    </div>
                  )}
                  <iframe srcDoc={previewHtml} className="w-full h-full border-0" title="AI Theme Preview" />
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-100 rounded-lg flex items-center gap-2 text-sm text-red-600">
              <span className="font-bold">Error:</span> {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
