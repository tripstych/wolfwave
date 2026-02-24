import { useState, useEffect } from 'react';
import { Loader2, Check, X, Sparkles, AlertCircle } from 'lucide-react';
import api from '../lib/api';
import { toast } from 'sonner';

export default function AiImageOverlay({ prompt, isOpen, onClose, onConfirm }) {
  const [loading, setLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen && prompt) {
      handleGenerate();
    }
  }, [isOpen, prompt]);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    setPreviewUrl(null);
    try {
      const result = await api.post('/ai/generate-image', { prompt, preview: true });
      if (result.success) {
        setPreviewUrl(result.path);
      } else {
        throw new Error(result.error || 'Failed to generate image');
      }
    } catch (err) {
      console.error('Generation failed:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    setSaving(true);
    const toastId = toast.loading('Saving to media library...');
    try {
      const result = await api.post('/ai/save-generated-image', { url: previewUrl, prompt });
      if (result.success) {
        toast.success('Image saved!', { id: toastId });
        onConfirm(result.path);
        onClose();
      } else {
        throw new Error(result.error || 'Failed to save image');
      }
    } catch (err) {
      console.error('Save failed:', err);
      toast.error('Save failed: ' + err.message, { id: toastId });
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-primary-100 rounded-lg">
              <Sparkles className="w-5 h-5 text-primary-600" />
            </div>
            <h3 className="font-bold text-gray-900">AI Image Generation</h3>
          </div>
          {!loading && !saving && (
            <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-full transition-colors">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-8 flex flex-col items-center justify-center min-h-[400px]">
          {loading ? (
            <div className="flex flex-col items-center gap-6 text-center">
              <div className="relative">
                <div className="w-20 h-20 border-4 border-primary-100 border-t-primary-600 rounded-full animate-spin" />
                <Sparkles className="w-8 h-8 text-primary-600 absolute inset-0 m-auto animate-pulse" />
              </div>
              <div className="space-y-2">
                <p className="text-xl font-semibold text-gray-900 italic">"Painting your vision..."</p>
                <p className="text-sm text-gray-500 max-w-xs mx-auto">
                  Processing prompt: <span className="text-gray-900 font-medium">{prompt}</span>
                </p>
              </div>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="p-4 bg-red-50 rounded-full">
                <AlertCircle className="w-12 h-12 text-red-500" />
              </div>
              <div className="space-y-2">
                <p className="text-lg font-bold text-gray-900">Generation Failed</p>
                <p className="text-sm text-red-600 bg-red-50 px-4 py-2 rounded-lg border border-red-100">{error}</p>
              </div>
              <button 
                onClick={handleGenerate}
                className="btn btn-primary mt-4"
              >
                Try Again
              </button>
            </div>
          ) : previewUrl ? (
            <div className="w-full space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="relative group aspect-square rounded-xl overflow-hidden shadow-lg border border-gray-200 bg-gray-50">
                <img 
                  src={previewUrl} 
                  alt="AI Preview" 
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              
              <div className="space-y-4">
                <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                  <p className="text-xs text-blue-700 uppercase tracking-wider font-bold mb-1">Prompt</p>
                  <p className="text-sm text-gray-700 leading-relaxed italic">{prompt}</p>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={onClose}
                    disabled={saving}
                    className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <X className="w-4 h-4" />
                    Discard
                  </button>
                  <button
                    onClick={handleApprove}
                    disabled={saving}
                    className="flex-1 px-4 py-3 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition-all shadow-md hover:shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        Approve & Save
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer info */}
        <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 text-center">
          <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">
            Powered by WebWolf AI Studio
          </p>
        </div>
      </div>
    </div>
  );
}
