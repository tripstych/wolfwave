import React, { useState } from 'react';
import { Sparkles, Loader2, Image as ImageIcon, Palette, Layout, Type } from 'lucide-react';
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
    const toastId = toast.loading('Architecting your theme plan...');

    try {
      const response = await fetch('/api/ai/draft-theme', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ industry })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Drafting failed');

      setPreviewData(data.plan);
      await fetchScaffolds();
      toast.success('Theme plan ready for review!', { id: toastId });
    } catch (err) {
      setError(err.message);
      toast.error('Drafting failed: ' + err.message, { id: toastId });
    } finally {
      setGenerating(false);
      setStatus('');
    }
  };

  const handleFinalGenerate = async () => {
    setGenerating(true);
    const toastId = toast.loading('Building and activating your theme...');
    
    try {
      const response = await fetch('/api/ai/generate-theme', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ 
          industry,
          plan: previewData
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Generation failed');

      if (onThemeGenerated) onThemeGenerated(data.slug);
      
      toast.success('Theme activated successfully!', { id: toastId });
      setPreviewData(null);
      setIndustry('');
      setIsExpanded(false);
    } catch (err) {
      toast.error('Generation failed: ' + err.message, { id: toastId });
    } finally {
      setGenerating(false);
    }
  };

  const updatePreviewField = (key, value) => {
    setPreviewData(prev => ({
      ...prev,
      content: { ...prev.content, [key]: value }
    }));
  };

  const updateColor = (key, value) => {
    setPreviewData(prev => ({
      ...prev,
      css_variables: { ...prev.css_variables, [key]: value }
    }));
  };

  return (
    <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100 rounded-xl p-6 mb-8 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="p-3 bg-white rounded-lg shadow-sm">
          <Sparkles className="w-6 h-6 text-indigo-600" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">AI Theme Architect</h2>
          <p className="text-sm text-gray-600 mb-4">
            Describe your business or industry in detail. Our AI will select a layout blueprint and 
            draft custom branding and content for you to approve.
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
                  {generating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Architecting...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Draft Plan
                    </>
                  )}
                </button>
              </div>
            </form>
          ) : (
            <div className="bg-white border border-indigo-200 rounded-xl p-6 mt-2 space-y-8 shadow-xl animate-in fade-in slide-in-from-top-4 duration-500">
              <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                <div className="flex items-center gap-2 text-indigo-900">
                  <Palette className="w-5 h-5" />
                  <h3 className="font-bold text-lg">Theme Blueprint & Strategy</h3>
                </div>
                <button 
                  onClick={() => setPreviewData(null)}
                  className="px-3 py-1 text-sm text-gray-400 hover:text-red-500 font-medium transition-colors"
                >
                  Cancel & Reset
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Layout Column */}
                <div className="space-y-6">
                  <div className="flex items-center gap-2 text-gray-700 font-bold text-xs uppercase tracking-widest">
                    <Layout className="w-4 h-4" /> Layout blueprint
                  </div>
                  <div>
                    <select 
                      value={previewData.scaffold}
                      onChange={(e) => setPreviewData({...previewData, scaffold: e.target.value})}
                      className="w-full text-sm border-gray-200 rounded-lg p-2.5 bg-gray-50 focus:bg-white transition-colors"
                    >
                      {scaffolds.map(s => <option key={s.name} value={s.name}>{s.name.replace(/-/g, ' ')}</option>)}
                    </select>
                    <p className="mt-2 text-xs text-gray-400">Chosen by AI based on your industry description.</p>
                  </div>

                  <div className="space-y-4 pt-2">
                    <div className="flex items-center gap-2 text-gray-700 font-bold text-xs uppercase tracking-widest">
                      <Palette className="w-4 h-4" /> Color Swatch
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      {Object.entries(previewData.css_variables).map(([key, value]) => (
                        <div key={key} className="space-y-1">
                          <label className="block text-[10px] text-gray-400 font-medium">{key.replace('--nano-', '')}</label>
                          <div className="flex items-center gap-2 bg-gray-50 p-1.5 rounded-lg border border-gray-100">
                            <input 
                              type="color" 
                              value={value}
                              onChange={(e) => updateColor(key, e.target.value)}
                              className="h-6 w-6 rounded border-0 cursor-pointer p-0 bg-transparent"
                            />
                            <span className="text-[10px] font-mono text-gray-600">{value}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Content Column */}
                <div className="lg:col-span-2 space-y-6">
                  <div className="flex items-center gap-2 text-gray-700 font-bold text-xs uppercase tracking-widest">
                    <Type className="w-4 h-4" /> Generated Copy
                  </div>
                  
                  <div className="space-y-4">
                    <div className="group">
                      <label className="block text-[10px] text-gray-400 font-bold uppercase mb-1 ml-1">Hero Headline</label>
                      <input 
                        type="text"
                        value={previewData.content.headline}
                        onChange={(e) => updatePreviewField('headline', e.target.value)}
                        className="w-full text-base font-bold border-gray-200 rounded-lg p-3 group-hover:border-indigo-200 transition-colors shadow-sm focus:ring-2 focus:ring-indigo-100"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-400 font-bold uppercase mb-1 ml-1">Hero Subtext</label>
                      <textarea 
                        value={previewData.content.subtext}
                        onChange={(e) => updatePreviewField('subtext', e.target.value)}
                        className="w-full text-sm leading-relaxed border-gray-200 rounded-lg p-3 h-24 shadow-sm focus:ring-2 focus:ring-indigo-100"
                      />
                    </div>
                    
                    {/* Render other fields if they exist */}
                    {Object.entries(previewData.content).map(([key, value]) => {
                      if (['headline', 'subtext', 'hero_image_prompt'].includes(key)) return null;
                      if (typeof value !== 'string') return null; // Skip repeaters for now
                      return (
                        <div key={key}>
                          <label className="block text-[10px] text-gray-400 font-bold uppercase mb-1 ml-1">{key.replace(/_/g, ' ')}</label>
                          <textarea 
                            value={value}
                            onChange={(e) => updatePreviewField(key, e.target.value)}
                            className="w-full text-sm border-gray-200 rounded-lg p-3 h-20 shadow-sm focus:ring-2 focus:ring-indigo-100"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="bg-indigo-600 p-6 rounded-xl flex flex-col md:flex-row items-center justify-between gap-4 shadow-lg shadow-indigo-200">
                <div className="text-white">
                  <h4 className="font-bold">Ready to build?</h4>
                  <p className="text-indigo-100 text-sm">We'll generate your theme files, assets, and DALL-E imagery now.</p>
                </div>
                <button
                  onClick={handleFinalGenerate}
                  disabled={generating}
                  className="w-full md:w-auto px-10 py-3 bg-white text-indigo-600 font-black rounded-lg hover:bg-indigo-50 shadow-md flex items-center justify-center gap-2 transform transition hover:-translate-y-0.5 active:translate-y-0"
                >
                  {generating ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Building...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5" />
                      CONFIRM & ACTIVATE THEME
                    </>
                  )}
                </button>
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
