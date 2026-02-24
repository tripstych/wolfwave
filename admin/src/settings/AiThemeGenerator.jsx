import React, { useState } from 'react';
import { Sparkles, Loader2, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';

export default function AiThemeGenerator({ onThemeGenerated }) {
  const [industry, setIndustry] = useState('');
  const [generating, setGenerating] = useState(false);
  const [status, setStatus] = useState(''); // 'text', 'image', 'done'
  const [error, setError] = useState(null);

  const handleGenerate = async (e) => {
    e.preventDefault();
    if (!industry.trim()) return;

    setGenerating(true);
    setError(null);
    setStatus('text'); // "Drafting content..."
    const toastId = toast.loading('Architecting your theme, please wait...');

    try {
      const response = await fetch('/api/ai/generate-theme', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ industry })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Generation failed');
      }

      setStatus('done');
      if (onThemeGenerated) {
        onThemeGenerated(data.slug);
      }
      
      // Feedback for cache hits
      if (data.cached) {
        toast.success('Theme loaded instantly from library!', { id: toastId });
      } else {
        toast.success('Theme generated successfully!', { id: toastId });
      }
      
      setIndustry('');
    } catch (err) {
      console.error(err);
      setError(err.message);
      toast.error('Generation failed: ' + err.message, { id: toastId });
    } finally {
      setGenerating(false);
      setStatus('');
    }
  };

  return (
    <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100 rounded-xl p-6 mb-8">
      <div className="flex items-start gap-4">
        <div className="p-3 bg-white rounded-lg shadow-sm">
          <Sparkles className="w-6 h-6 text-indigo-600" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">AI Theme Generator</h2>
          <p className="text-sm text-gray-600 mb-4">
            Describe your business or industry, and our AI Architect will build a custom theme with 
            tailored content, branding, and imagery automatically.
          </p>

          <form onSubmit={handleGenerate} className="flex gap-2">
            <input
              type="text"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              placeholder="e.g. 'Cyberpunk Coffee Shop', 'Luxury Pet Hotel', 'Minimalist Law Firm'..."
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              disabled={generating}
            />
            <button
              type="submit"
              disabled={generating || !industry.trim()}
              className="px-6 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {generating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {status === 'text' ? 'Drafting...' : 'Painting...'}
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Generate
                </>
              )}
            </button>
          </form>

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
