import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { getSiteUrl } from '../lib/urls';

// Shared Components
import TitleSlugSection from '../components/TitleSlugSection';
import AccessControlSection from '../components/AccessControlSection';
import SEOSection from '../components/SEOSection';
import DynamicField from '../components/DynamicField';
import RepeaterField from '../components/RepeaterField';
import MediaPicker from '../components/MediaPicker';
import ContentGroupsWidget from '../components/ContentGroupsWidget';
import VisualPickerModal from '../components/VisualPickerModal';

// Hooks
import useContentEditor from '../hooks/useContentEditor';

// Icons
import { 
  Save, ArrowLeft, Eye, RefreshCw, Sparkles, Loader2, Globe, Download, Maximize2
} from 'lucide-react';
import { toast } from 'sonner';

export default function PageEditor() {
  const navigate = useNavigate();
  
  const {
    id,
    isNew,
    data: page,
    setData: setPage,
    templates,
    subscriptionPlans,
    regions,
    loading,
    saving,
    handleFieldChange,
    handleContentChange,
    handleTemplateChange,
    handleSave,
    syncTemplates
  } = useContentEditor({
    contentType: 'pages',
    endpoint: '/pages',
    initialData: {
      content_type: 'pages',
      robots: 'index, follow'
    }
  });

  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [mediaPickerTarget, setMediaPickerTarget] = useState(null);
  const [scraping, setScraping] = useState(false);
  const [scrapeUrl, setScrapeUrl] = useState('');
  const [generating, setGenerating] = useState(false);
  const [aiPrompts, setAiPrompts] = useState({});
  const [imageGenerating, setImageGenerating] = useState(null);

  // Visual Picker State
  const [showPicker, setShowPicker] = useState(false);
  const [selectorMap, setSelectorMap] = useState({});

  const openMediaPicker = (target) => {
    setMediaPickerTarget(target);
    setMediaPickerOpen(true);
  };

  const handleMediaSelect = (media) => {
    if (mediaPickerTarget === 'og_image') {
      handleFieldChange('og_image', media.url);
    } else if (mediaPickerTarget.startsWith('content.')) {
      const remainder = mediaPickerTarget.replace('content.', '');
      const parts = remainder.split('.');
      if (parts.length === 1) {
        handleContentChange(parts[0], media.url);
      } else if (parts.length === 3) {
        const [regionName, indexStr, fieldName] = parts;
        const index = parseInt(indexStr, 10);
        const newRepeaterValue = [...(page.content[regionName] || [])];
        newRepeaterValue[index] = { ...newRepeaterValue[index], [fieldName]: media.url };
        handleContentChange(regionName, newRepeaterValue);
      }
    } else {
        handleContentChange(mediaPickerTarget, media.url);
    }
    setMediaPickerOpen(false);
  };

  const handleExtractContent = async () => {
    if (!scrapeUrl || Object.keys(selectorMap).length === 0) return;
    setScraping(true);
    try {
      const res = await api.post('/import/extract', { url: scrapeUrl, selector_map: selectorMap });
      if (res.success && res.data) {
        const extracted = res.data;
        setPage(prev => {
          const newContent = { ...prev.content };
          const updates = {};
          Object.keys(extracted).forEach(key => {
            if (key === 'title') updates.title = extracted[key];
            else if (key === 'description') newContent.description = extracted[key];
            else newContent[key] = extracted[key];
          });
          return { ...prev, ...updates, content: newContent };
        });
        toast.success('Live content extracted!');
      }
    } catch (err) {
      toast.error('Extraction failed: ' + err.message);
    } finally {
      setScraping(false);
      setShowPicker(false);
    }
  };

  const handleScrape = async () => {
    if (!scrapeUrl.trim()) return toast.error('Please enter a URL');
    setScraping(true);
    try {
      const response = await api.post('/import/url', { url: scrapeUrl });
      if (response.success && response.data) {
        const scraped = response.data;
        setPage(prev => ({
          ...prev,
          title: prev.title || scraped.title || '',
          meta_title: prev.meta_title || scraped.title || '',
          meta_description: prev.meta_description || scraped.description || '',
          content: {
            ...prev.content,
            ...Object.fromEntries(
              regions.map(r => [r.name, prev.content[r.name] || scraped[r.name] || scraped.content || '']).filter(([_, v]) => v)
            )
          }
        }));
        toast.success('Content scraped!');
        setScrapeUrl('');
      }
    } catch (err) {
      toast.error(err.message || 'Scrape failed');
    } finally {
      setScraping(false);
    }
  };

  const handleAiGenerate = async () => {
    if (!page.template_id) return toast.error('Select a template first');
    const prompt = window.prompt('What content should we generate?', page.title);
    if (!prompt) return;

    setGenerating(true);
    try {
      const response = await api.post('/ai/generate-content', { templateId: page.template_id, prompt });
      if (response.success && response.data) {
        const textContent = {};
        const newAiPrompts = {};
        Object.keys(response.data).forEach(key => {
          const region = regions.find(r => r.name === key);
          if (region?.type === 'image') newAiPrompts[key] = response.data[key];
          else textContent[key] = response.data[key];
        });
        setPage(p => ({ ...p, content: { ...p.content, ...textContent } }));
        setAiPrompts(prev => ({ ...prev, ...newAiPrompts }));
        toast.success('Content generated!');
      }
    } catch (err) {
      toast.error('Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const handleImageGenerate = async (regionName) => {
    const prompt = window.prompt('Describe the image:', aiPrompts[regionName] || `Image for ${page.title}`);
    if (!prompt) return;
    setImageGenerating(regionName);
    try {
      const response = await api.post('/ai/generate-image', { prompt });
      if (response.success && response.path) {
        handleContentChange(regionName, response.path);
        toast.success('Image generated!');
      }
    } catch (err) {
      toast.error('Image generation failed');
    } finally {
      setImageGenerating(null);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between sticky top-16 bg-gray-50 z-20 -mx-6 px-6 py-4 border-b border-gray-200">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/pages')} className="btn btn-ghost">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h1 className="text-2xl font-bold text-gray-900">
            {isNew ? 'New Page' : 'Edit Page'}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {page.status === 'published' && (
            <a href={getSiteUrl(page.slug)} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
              <Eye className="w-4 h-4 mr-2" /> View
            </a>
          )}
          <button onClick={() => handleSave('draft')} disabled={saving} className="btn btn-secondary">
            Save Draft
          </button>
          <button onClick={() => handleSave('published')} disabled={saving} className="btn btn-primary">
            <Save className="w-4 h-4 mr-2" /> {saving ? 'Saving...' : 'Publish'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <TitleSlugSection
            title={page.title}
            slug={page.slug}
            onTitleChange={(val) => handleFieldChange('title', val)}
            onSlugChange={(val) => handleFieldChange('slug', val)}
          />

          {regions.length > 0 && (
            <div className="card p-6 space-y-6">
              <h2 className="font-semibold text-gray-900">Content</h2>
              {regions.map((region) => (
                <div key={region.name}>
                  <label className="label">
                    {region.label}
                    {region.required && <span className="text-red-500 ml-1">*</span>}
                  </label>
                  {region.type === 'repeater' ? (
                    <RepeaterField
                      region={region}
                      value={page.content[region.name]}
                      onChange={handleContentChange}
                      openMediaPicker={openMediaPicker}
                    />
                  ) : (
                    <DynamicField
                      region={region}
                      value={page.content[region.name]}
                      onChange={handleContentChange}
                      openMediaPicker={openMediaPicker}
                      onImageGenerate={handleImageGenerate}
                      imageGenerating={imageGenerating}
                      aiPrompt={aiPrompts[region.name]}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="card p-6 space-y-4 border-amber-200 bg-amber-50/30">
            <h2 className="font-semibold text-amber-700 flex items-center gap-2 text-xs uppercase tracking-wider">
              <Globe className="w-4 h-4" /> Live Visual Scrape
            </h2>
            <div className="space-y-3">
              <input
                type="url"
                value={scrapeUrl}
                onChange={(e) => setScrapeUrl(e.target.value)}
                placeholder="https://example.com/page"
                className="input text-sm bg-white"
                disabled={scraping}
              />
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleScrape}
                  disabled={scraping || !scrapeUrl.trim()}
                  className="btn btn-secondary flex items-center justify-center gap-2 text-xs"
                >
                  {scraping ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                  Scrape
                </button>
                <button
                  onClick={() => setShowPicker(true)}
                  disabled={scraping || !scrapeUrl.trim()}
                  className="btn btn-secondary flex items-center justify-center gap-2 text-xs"
                >
                  <Maximize2 className="w-3 h-3" />
                  Visual
                </button>
              </div>
            </div>
          </div>

          <div className="card p-6 space-y-4">
            <div>
              <label className="label">Template</label>
              <div className="flex gap-2">
                <select
                  value={page.template_id || ''}
                  onChange={(e) => handleTemplateChange(e.target.value)}
                  className="input flex-1"
                >
                  <option value="">Select template</option>
                  {templates.map((t) => (
                    <option key={t.id} value={String(t.id)}>{t.name}</option>
                  ))}
                </select>
                <button onClick={syncTemplates} className="btn btn-ghost px-3" title="Sync templates">
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
              <button
                onClick={handleAiGenerate}
                disabled={generating || !page.template_id}
                className="btn btn-secondary w-full mt-2 flex items-center justify-center gap-2 text-indigo-600 border-indigo-200"
              >
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Auto-Fill Content
              </button>
            </div>
            <div>
              <label className="label">Status</label>
              <select
                value={page.status}
                onChange={(e) => handleFieldChange('status', e.target.value)}
                className="input"
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>

          <AccessControlSection
            accessRules={page.access_rules}
            subscriptionPlans={subscriptionPlans}
            onChange={(rules) => handleFieldChange('access_rules', rules)}
          />

          <SEOSection
            data={page}
            onChange={(newData) => setPage(newData)}
            openMediaPicker={openMediaPicker}
          />
        </div>
      </div>

      {page.id && <ContentGroupsWidget contentId={page.content_id || page.id} />}

      {mediaPickerOpen && (
        <MediaPicker
          onSelect={handleMediaSelect}
          onClose={() => setMediaPickerOpen(false)}
        />
      )}

      <VisualPickerModal
        isOpen={showPicker}
        onClose={() => setShowPicker(false)}
        url={scrapeUrl}
        fields={[
          { id: 'title', label: 'Title' },
          { id: 'description', label: 'Description' },
          ...regions.map(r => ({ id: r.name, label: r.label || r.name }))
        ]}
        selectorMap={selectorMap}
        onSelectorPicked={(field, selector) => setSelectorMap(prev => ({ ...prev, [field]: selector }))}
        onDone={handleExtractContent}
      />
    </div>
  );
}
