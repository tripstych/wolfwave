import React, { useState } from 'react';
import { Sparkles, Loader2, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';

export default function AiThemeGenerator({ onThemeGenerated }) {
  const [industry, setIndustry] = useState('');
  const [generating, setGenerating] = useState(false);
  const [status, setStatus] = useState(''); // 'text', 'image', 'done'
  const [error, setError] = useState(null);
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Preview State
  const [previewData, setPreviewData] = useState(null);
  const [scaffolds, setScaffolds] = useState([]);

  const fetchScaffolds = async () => {
    try {
      const resp = await api.get('/ai/scaffolds');
      setScaffolds(resp.data || []);
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
      // We'll create a new 'draft' endpoint for the preview step
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
          plan: previewData // Pass the adjusted plan back
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

  return (
    <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100 rounded-xl p-6 mb-8">
      <div className="flex items-start gap-4">
        <div className="p-3 bg-white rounded-lg shadow-sm">
          <Sparkles className="w-6 h-6 text-indigo-600" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">AI Theme Architect</h2>
          <p className="text-sm text-gray-600 mb-4">
            Describe your vision. Our AI will draft a complete theme strategy including layout, 
            branding, and content for your review.
          </p>

          {!previewData ? (
            <form onSubmit={handleInitialDraft} className="space-y-3">
              <textarea
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                onFocus={() => setIsExpanded(true)}
                placeholder="e.g. 'I want a luxury watch boutique theme with a dark aesthetic, professional photography, and sections for heritage, craftsmanship, and a newsletter signup...'"
                className={`w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-300 ease-in-out ${
                  isExpanded ? 'h-32' : 'h-12'
                }`}
                disabled={generating}
              />
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={generating || !industry.trim()}
                  className="px-6 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm"
                >
                  {generating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Architecting...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Draft Theme Plan
                    </>
                  )}
                </button>
              </div>
            </form>
          ) : (
            <div className="bg-white border border-indigo-200 rounded-lg p-5 mt-2 space-y-6 shadow-sm animate-in fade-in slide-in-from-top-4 duration-300">
              <div className="flex items-center justify-between border-b pb-3">
                <h3 className="font-bold text-indigo-900 flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  Proposed Theme Strategy
                </h3>
                <button 
                  onClick={() => setPreviewData(null)}
                  className="text-xs text-gray-500 hover:text-gray-700"
                >
                  Cancel
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Base Layout (Scaffold)</label>
                    <select 
                      value={previewData.scaffold}
                      onChange={(e) => setPreviewData({...previewData, scaffold: e.target.value})}
                      className="w-full text-sm border-gray-300 rounded-md"
                    >
                      {scaffolds.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
                    </select>
                  </div>

                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Brand Color</label>
                      <div className="flex items-center gap-2">
                        <input 
                          type="color" 
                          value={previewData.css_variables['--nano-brand']}
                          onChange={(e) => setPreviewData({
                            ...previewData, 
                            css_variables: { ...previewData.css_variables, '--nano-brand': e.target.value }
                          })}
                          className="h-8 w-8 rounded cursor-pointer"
                        />
                        <span className="text-sm font-mono">{previewData.css_variables['--nano-brand']}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Headline</label>
                    <input 
                      type="text"
                      value={previewData.content.headline}
                      onChange={(e) => updatePreviewField('headline', e.target.value)}
                      className="w-full text-sm border-gray-300 rounded-md"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Subtext</label>
                    <textarea 
                      value={previewData.content.subtext}
                      onChange={(e) => updatePreviewField('subtext', e.target.value)}
                      className="w-full text-sm border-gray-300 rounded-md h-20"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-indigo-50 p-4 rounded-lg flex items-center justify-between">
                <p className="text-sm text-indigo-700 italic">
                  "Looks like a great start! Clicking generate will create the theme files and imagery."
                </p>
                <button
                  onClick={handleFinalGenerate}
                  disabled={generating}
                  className="px-8 py-2.5 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 shadow-md flex items-center gap-2"
                >
                  {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  Confirm & Build Theme
                </button>
              </div>
            </div>
          )}

          {error && (
            <p className="mt-3 text-sm text-red-600 bg-red-50 px-3 py-1 rounded inline-block">
              Error: {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
