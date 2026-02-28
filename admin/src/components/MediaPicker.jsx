import { useState, useEffect, useRef } from 'react';
import api from '../lib/api';
import { X, Upload, Check, Image as ImageIcon, Sparkles, Loader2, Video, Play, Search } from 'lucide-react';
import { toast } from 'sonner';
import AiImageOverlay from './AiImageOverlay';

export default function MediaPicker({ onSelect, onClose }) {
  const [media, setMedia] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [showAiOverlay, setShowAiOverlay] = useState(false);
  const [activePrompt, setActivePrompt] = useState('');
  const [type, setType] = useState('image'); // 'all', 'image', 'video'
  const [prompt, setPrompt] = useState('');
  const [selected, setSelected] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    loadMedia();
  }, [type]);

  const loadMedia = async () => {
    try {
      const queryType = type === 'all' ? '' : type;
      const data = await api.get(`/media?type=${queryType}&limit=50`);
      setMedia(data.media || []);
    } catch (err) {
      console.error('Failed to load media:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const result = await api.upload('/media/upload', formData);
      const newItem = { ...result, path: result.path.replace(/^\/uploads/, '') };
      setMedia([newItem, ...media]);
      setSelected(newItem);
    } catch (err) {
      console.error('Upload failed:', err);
      alert('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const isImage = (mimeType) => mimeType?.startsWith('image/');
  const isVideo = (mimeType) => mimeType?.startsWith('video/');

  const handleGenerate = () => {
    if (!prompt.trim()) return;
    setActivePrompt(prompt);
    setShowAiOverlay(true);
  };

  const handleAiConfirm = (path) => {
    setPrompt('');
    loadMedia();
  };

  const handleSelect = () => {
    if (selected) {
      onSelect({
        id: selected.id,
        url: `/uploads${selected.path}`,
        alt: selected.alt_text || '',
        mimeType: selected.mime_type
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <AiImageOverlay 
        isOpen={showAiOverlay}
        prompt={activePrompt}
        onClose={() => setShowAiOverlay(false)}
        onConfirm={handleAiConfirm}
      />
      <div className="absolute inset-0 bg-gray-900/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Select Media</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {/* Actions: Upload & AI */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
              <h3 className="text-xs font-bold uppercase text-gray-500 mb-3 flex items-center gap-2">
                <Upload className="w-3 h-3" /> Upload Local File
              </h3>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.svg"
                onChange={handleUpload}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="btn btn-secondary w-full"
              >
                <Upload className="w-4 h-4 mr-2" />
                {uploading ? 'Uploading...' : 'Upload New'}
              </button>
            </div>

            <div className="p-4 bg-primary-50/30 rounded-lg border border-primary-100">
              <h3 className="text-xs font-bold uppercase text-primary-600 mb-3 flex items-center gap-2">
                <Sparkles className="w-3 h-3" /> Generate with AI
              </h3>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="A professional product photo of..."
                  className="input text-sm py-1.5 flex-1"
                  onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
                />
                <button
                  onClick={handleGenerate}
                  disabled={generating || !prompt.trim()}
                  className="btn btn-primary px-3 py-1.5"
                  title="Generate image"
                >
                  {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="flex items-center gap-2 mb-6 border-b pb-4">
            <button
              onClick={() => setType('image')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                type === 'image' ? 'bg-primary-600 text-white shadow-md' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <ImageIcon className="w-3 h-3" /> Images
              </div>
            </button>
            <button
              onClick={() => setType('video')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                type === 'video' ? 'bg-primary-600 text-white shadow-md' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <Video className="w-3 h-3" /> Videos
              </div>
            </button>
            <button
              onClick={() => setType('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                type === 'all' ? 'bg-primary-600 text-white shadow-md' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              All Media
            </button>
          </div>

          {/* Grid */}
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            </div>
          ) : media.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <ImageIcon className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No images yet. Upload your first image!</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4">
              {media.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setSelected(item)}
                  className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                    selected?.id === item.id
                      ? 'border-primary-500 ring-2 ring-primary-200'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {isImage(item.mime_type) ? (
                    <img
                      src={`/uploads${item.path}`}
                      alt={item.alt_text || ''}
                      className="w-full h-full object-cover"
                    />
                  ) : isVideo(item.mime_type) ? (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-gray-100">
                      <Video className="w-8 h-8 text-primary-400" />
                      <div className="absolute top-1 right-1">
                        <Play className="w-3 h-3 text-primary-600 fill-primary-600" />
                      </div>
                    </div>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gray-100">
                      <FileText className="w-8 h-8 text-gray-400" />
                    </div>
                  )}
                  {selected?.id === item.id && (
                    <div className="absolute inset-0 bg-primary-500/20 flex items-center justify-center">
                      <div className="w-6 h-6 bg-primary-500 rounded-full flex items-center justify-center">
                        <Check className="w-4 h-4 text-white" />
                      </div>
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200">
          <button onClick={onClose} className="btn btn-secondary">
            Cancel
          </button>
          <button
            onClick={handleSelect}
            disabled={!selected}
            className="btn btn-primary"
          >
            Select
          </button>
        </div>
      </div>
    </div>
  );
}
