import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../lib/api';

// Shared Components
import TitleSlugSection from '../components/TitleSlugSection';
import SEOSection from '../components/SEOSection';
import DynamicField from '../components/DynamicField';
import VisualPickerModal from '../components/VisualPickerModal';
import MediaPicker from '../components/MediaPicker';

// Hooks
import useContentEditor from '../hooks/useContentEditor';

// Icons
import { 
  Save, ArrowLeft, Globe, Loader2, Maximize2 
} from 'lucide-react';
import { toast } from 'sonner';

export default function ContentEditor() {
  const { contentType: contentTypeName } = useParams();
  const navigate = useNavigate();

  const [contentType, setContentType] = useState(null);
  
  const {
    id,
    isNew,
    data: item,
    setData: setItem,
    templates,
    regions,
    loading,
    saving,
    handleFieldChange,
    handleContentChange,
    handleTemplateChange,
    handleSave,
  } = useContentEditor({
    contentType: contentTypeName,
    endpoint: contentTypeName === 'blocks' ? '/blocks' : '/pages',
    initialData: {
      content_type: contentTypeName,
      status: 'draft'
    }
  });

  // Visual Picker State
  const [showPicker, setShowPicker] = useState(false);
  const [scrapeUrl, setScrapeUrl] = useState('');
  const [selectorMap, setSelectorMap] = useState({});
  const [scraping, setScraping] = useState(false);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [mediaPickerTarget, setMediaPickerTarget] = useState(null);

  useEffect(() => {
    loadContentType();
  }, [contentTypeName]);

  const loadContentType = async () => {
    try {
      const data = await api.get(`/content-types/${contentTypeName}`);
      setContentType(data);
    } catch (err) {
      console.error('Failed to load content type:', err);
    }
  };

  const handleExtractContent = async () => {
    if (!scrapeUrl || Object.keys(selectorMap).length === 0) return;
    setScraping(true);
    try {
      const res = await api.post('/import/extract', { url: scrapeUrl, selector_map: selectorMap });
      if (res.success && res.data) {
        const extracted = res.data;
        setItem(prev => {
          const newContent = { ...prev.content };
          Object.keys(extracted).forEach(key => {
            if (key !== 'title') newContent[key] = extracted[key];
          });
          return { ...prev, title: extracted.title || prev.title, content: newContent };
        });
        toast.success('Content extracted!');
      }
    } catch (err) {
      toast.error('Extraction failed');
    } finally {
      setScraping(false);
      setShowPicker(false);
    }
  };

  const openMediaPicker = (target) => {
    setMediaPickerTarget(target);
    setMediaPickerOpen(true);
  };

  const handleMediaSelect = (media) => {
    if (mediaPickerTarget === 'og_image') {
      handleFieldChange('og_image', media.url);
    } else {
      handleContentChange(mediaPickerTarget, media.url);
    }
    setMediaPickerOpen(false);
  };

  if (loading || !contentType) return <div className="p-8 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary-600" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between sticky top-16 bg-gray-50 z-20 -mx-6 px-6 py-4 border-b border-gray-200">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(`/${contentTypeName}`)} className="btn btn-ghost">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h1 className="text-2xl font-bold">
            {isNew ? `New ${contentType.label}` : `Edit ${contentType.label}`}
          </h1>
        </div>
        <button onClick={() => handleSave()} disabled={saving} className="btn btn-primary">
          <Save className="w-4 h-4 mr-2" />
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <TitleSlugSection
            title={item.title}
            slug={item.slug}
            onTitleChange={(val) => handleFieldChange('title', val)}
            onSlugChange={(val) => handleFieldChange('slug', val)}
          />

          {regions.length > 0 && (
            <div className="card p-6 space-y-6">
              <h2 className="font-semibold text-gray-900">Content</h2>
              {regions.map((region) => (
                <div key={region.name}>
                  <label className="label">{region.label}</label>
                  <DynamicField
                    region={region}
                    value={item.content[region.name]}
                    onChange={handleContentChange}
                    openMediaPicker={openMediaPicker}
                  />
                </div>
              ))}
            </div>
          )}

          {contentType.has_seo && (
            <SEOSection
              data={item}
              onChange={(newData) => setItem(newData)}
              openMediaPicker={openMediaPicker}
            />
          )}
        </div>

        <div className="space-y-6">
          <div className="card p-6 space-y-4 border-amber-200 bg-amber-50/30">
            <div className="flex items-center gap-2 text-amber-700 font-bold text-xs uppercase"><Globe className="w-4 h-4" /> Live Visual Scrape</div>
            <input type="text" placeholder="URL..." value={scrapeUrl} onChange={e => setScrapeUrl(e.target.value)} className="input text-sm" />
            <button onClick={() => setShowPicker(true)} className="btn btn-secondary w-full py-2 text-xs"><Maximize2 className="w-3 h-3 mr-2" /> Visual Scrape</button>
          </div>

          <div className="card p-6 space-y-4">
            <div>
              <label className="label">Template</label>
              <select value={item.template_id || ''} onChange={(e) => handleTemplateChange(e.target.value)} className="input">
                <option value="">Select template</option>
                {templates.map(t => <option key={t.id} value={String(t.id)}>{t.name}</option>)}
              </select>
            </div>
          </div>

          {contentType.has_status && (
            <div className="card p-6 space-y-4">
              <label className="label">Status</label>
              <select value={item.status} onChange={(e) => handleFieldChange('status', e.target.value)} className="input">
                <option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option>
              </select>
            </div>
          )}
        </div>
      </div>

      <VisualPickerModal
        isOpen={showPicker}
        onClose={() => setShowPicker(false)}
        url={scrapeUrl}
        fields={[
          { id: 'title', label: 'Title' },
          ...regions.map(r => ({ id: r.name, label: r.label || r.name }))
        ]}
        selectorMap={selectorMap}
        onSelectorPicked={(field, selector) => setSelectorMap(prev => ({ ...prev, [field]: selector }))}
        onDone={handleExtractContent}
      />

      {mediaPickerOpen && (
        <MediaPicker
          onSelect={handleMediaSelect}
          onClose={() => setMediaPickerOpen(false)}
        />
      )}
    </div>
  );
}
