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
import MenuWidget from '../components/MenuWidget';
import VisualPickerModal from '../components/VisualPickerModal';
import HistoryPreviewModal from '../components/HistoryPreviewModal';
import CodeEditor from '../components/CodeEditor';

// Hooks
import useContentEditor from '../hooks/useContentEditor';

// Icons
import { 
  Save, ArrowLeft, Eye, RefreshCw, Sparkles, Loader2, Globe, Download, Maximize2, Code
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
    history,
    loadingHistory,
    handleFieldChange,
    handleContentChange,
    handleTemplateChange,
    handleSave,
    syncTemplates,
    restoreVersion,
    partialRestore
  } = useContentEditor({
    contentType: 'pages',
    endpoint: '/pages',
    initialData: {
      content_type: 'pages',
      robots: 'index, follow'
    }
  });

  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const [activeTab, setActiveTab] = useState('editor');
  const [previewingVersion, setPreviewingVersion] = useState(null);
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
    const toastId = toast.loading('Extracting content from live site...');
    try {
      const field_types = Object.fromEntries(regions.map(r => [r.name, r.type]));
      field_types.title = 'text'; // title is always text

      const res = await api.post('/import/extract', { 
        url: scrapeUrl, 
        selector_map: selectorMap,
        field_types
      });
      if (res.success && res.data) {
        const extracted = res.data;
        setPage(prev => {
          const newContent = { ...prev.content };
          const updates = {};
          Object.keys(extracted).forEach(key => {
            if (key === 'title') updates.title = extracted[key];
            else if (key === 'description') newContent.description = extracted[key];
            else if (key === 'images') {
              const urls = Array.isArray(extracted[key]) ? extracted[key] : [extracted[key]];
              newContent.images = [...(newContent.images || []), ...urls];
            }
            else if (key === 'videos') {
              const urls = Array.isArray(extracted[key]) ? extracted[key] : [extracted[key]];
              newContent.videos = [...(newContent.videos || []), ...urls];
            }
            else newContent[key] = extracted[key];
          });
          return { ...prev, ...updates, content: newContent };
        });
        toast.success('Live content extracted!', { id: toastId });
      }
    } catch (err) {
      toast.error('Extraction failed: ' + err.message, { id: toastId });
    } finally {
      setScraping(false);
      setShowPicker(false);
    }
  };

  const handleScrape = async () => {
    if (!scrapeUrl.trim()) return toast.error('Please enter a URL');
    setScraping(true);
    const toastId = toast.loading('Scraping URL...');
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
        toast.success('Content scraped!', { id: toastId });
        setScrapeUrl('');
      }
    } catch (err) {
      toast.error(err.message || 'Scrape failed', { id: toastId });
    } finally {
      setScraping(false);
    }
  };

  const handleAiGenerate = async () => {
    if (!page.template_id) return toast.error('Select a template first');
    const prompt = window.prompt('What content should we generate?', page.title);
    if (!prompt) return;

    setGenerating(true);
    const toastId = toast.loading('Generating content, please wait...');
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
        toast.success('Content generated!', { id: toastId });
      }
    } catch (err) {
      toast.error('Generation failed', { id: toastId });
    } finally {
      setGenerating(false);
    }
  };

  const handleImageGenerate = async (regionName) => {
    const prompt = window.prompt('Describe the image:', aiPrompts[regionName] || `Image for ${page.title}`);
    if (!prompt) return;
    setImageGenerating(regionName);
    const toastId = toast.loading('Generating image, please wait...');
    try {
      const response = await api.post('/ai/generate-image', { prompt });
      if (response.success && response.path) {
        handleContentChange(regionName, response.path);
        toast.success('Image generated!', { id: toastId });
      }
    } catch (err) {
      toast.error('Image generation failed', { id: toastId });
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

          {/* Tabs */}
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab('editor')}
                className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
                  activeTab === 'editor'
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Editor
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
                  activeTab === 'history'
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                History {history.length > 0 && <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-[10px]">{history.length}</span>}
              </button>
            </nav>
          </div>

          {activeTab === 'editor' ? (
            regions.length > 0 && (
              <div className="card p-6 space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-gray-900">Content</h2>
                  <button
                    type="button"
                    onClick={() => setShowSource(!showSource)}
                    className={`btn btn-sm ${showSource ? 'btn-primary' : 'btn-ghost text-gray-500'} flex items-center gap-2`}
                    title={showSource ? "Switch to Visual Editor" : "Edit Raw JSON Source"}
                  >
                    <Code className="w-4 h-4" />
                    {showSource ? 'View Editor' : 'Edit Source'}
                  </button>
                </div>

                {showSource ? (
                  <div className="space-y-2">
                    <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded border border-amber-100">
                      <strong>Warning:</strong> Editing raw JSON can break the visual editor if the structure doesn't match the template regions.
                    </p>
                    <CodeEditor
                      mode="json"
                      value={JSON.stringify(page.content, null, 2)}
                      onChange={(val) => {
                        try {
                          const parsed = JSON.parse(val);
                          handleFieldChange('content', parsed);
                        } catch (e) {
                          // Invalid JSON, don't update state yet to prevent crashes
                        }
                      }}
                      height="500px"
                    />
                  </div>
                ) : (
                  <div className="space-y-6">
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
            )
          ) : (
            <div className="card overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-6 py-3 font-bold text-gray-500 uppercase text-xs">Version</th>
                    <th className="px-6 py-3 font-bold text-gray-500 uppercase text-xs">Date</th>
                    <th className="px-6 py-3 font-bold text-gray-500 uppercase text-xs">Title</th>
                    <th className="px-6 py-3 text-right"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {history.map((ver) => (
                    <tr key={ver.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 font-medium">v{ver.version_number}</td>
                      <td className="px-6 py-4 text-gray-500">{new Date(ver.created_at).toLocaleString()}</td>
                      <td className="px-6 py-4">{ver.title}</td>
                      <td className="px-6 py-4 text-right space-x-2">
                        <button
                          onClick={() => setPreviewingVersion(ver)}
                          className="btn btn-xs btn-secondary"
                        >
                          <Eye className="w-3 h-3 mr-1" /> Preview & Select
                        </button>
                        <button
                          onClick={() => restoreVersion(ver.id)}
                          className="text-primary-600 hover:text-primary-900 font-medium text-xs"
                        >
                          Full Restore
                        </button>
                      </td>
                    </tr>
                  ))}
                  {history.length === 0 && (
                    <tr>
                      <td colSpan="4" className="px-6 py-12 text-center text-gray-400 italic">No version history yet. Updates will create recovery points.</td>
                    </tr>
                  )}
                </tbody>
              </table>
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

          <MenuWidget
            pageId={page.id}
            title={page.title}
            url={page.slug}
            contentType={page.content_type}
          />

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
          { id: 'images', label: 'Gallery Images' },
          { id: 'videos', label: 'Gallery Videos' },
          ...regions.map(r => ({ id: r.name, label: r.label || r.name }))
        ]}
        selectorMap={selectorMap}
        onSelectorPicked={(field, selector) => setSelectorMap(prev => ({ ...prev, [field]: selector }))}
        onDone={handleExtractContent}
      />

      <HistoryPreviewModal
        isOpen={!!previewingVersion}
        onClose={() => setPreviewingVersion(null)}
        version={previewingVersion}
        regions={regions}
        onRestore={partialRestore}
      />
    </div>
  );
}
