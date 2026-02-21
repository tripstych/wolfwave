import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api, { parseRegions } from '../lib/api';
import { Save, ArrowLeft, Maximize2, X, Globe, Loader2 } from 'lucide-react';

export default function ContentEditor() {
  const { contentType: contentTypeName, id } = useParams();
  const navigate = useNavigate();
  const isNew = !id;

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [regions, setRegions] = useState([]);
  const [contentType, setContentType] = useState(null);
  const [item, setItem] = useState({
    template_id: '',
    title: '',
    slug: '',
    content: {},
    status: 'draft',
    meta_title: '',
    meta_description: ''
  });

  // Visual Picker State
  const [showPicker, setShowPicker] = useState(false);
  const [pickerUrl, setPickerUrl] = useState('');
  const [scrapeUrl, setScrapeUrl] = useState('');
  const [selectorMap, setSelectorMap] = useState({});
  const [scraping, setScrapeLoading] = useState(false);

  const endpoint = contentTypeName === 'blocks' ? '/blocks' : '/pages';

  useEffect(() => {
    loadContentType();
    loadTemplates();
    if (!isNew) {
      loadItem();
    }
  }, [id, contentTypeName]);

  // 2. Message Listener for Visual Picker
  useEffect(() => {
    const handleMessage = (e) => {
      if (e.data.type === 'WOLFWAVE_SELECTOR_PICKED') {
        const { field, selector } = e.data;
        setSelectorMap(prev => ({ ...prev, [field]: selector }));
      }
      if (e.data.type === 'WOLFWAVE_PICKER_DONE') {
        setShowPicker(false);
        handleExtractContent();
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [selectorMap, scrapeUrl]);

  const handleExtractContent = async () => {
    if (!scrapeUrl || Object.keys(selectorMap).length === 0) return;
    
    setScrapeLoading(true);
    try {
      const res = await api.post('/import/extract', { url: scrapeUrl, selector_map: selectorMap });
      if (res.success && res.data) {
        const extracted = res.data;
        
        setItem(prev => {
          const newContent = { ...prev.content };
          Object.keys(extracted).forEach(key => {
            if (key === 'title') {
              // Special case for title
            } else {
              newContent[key] = extracted[key];
            }
          });
          
          return {
            ...prev,
            title: extracted.title || prev.title,
            content: newContent
          };
        });

        if (extracted.title) handleTitleChange(extracted.title);
      }
    } catch (err) {
      alert('Extraction failed: ' + err.message);
    } finally {
      setScrapeLoading(false);
    }
  };

  const openVisualPicker = () => {
    if (!scrapeUrl) return alert('Please enter a URL to scrape');
    let targetUrl = scrapeUrl.trim();
    if (!/^https?:\/\//i.test(targetUrl)) targetUrl = 'https://' + targetUrl;
    setScrapeUrl(targetUrl);
    
    setPickerUrl(`/api/import/proxy?url=${encodeURIComponent(targetUrl)}`);
    setShowPicker(true);
    setSelectorMap({});
  };

  const handlePickerLoad = () => {
    if (regions.length > 0) {
      const fields = [
        { id: 'title', label: 'Set as Title' },
        ...regions.map(r => ({
          id: r.name,
          label: `Set as ${r.label || r.name}`
        }))
      ];
      
      const iframe = document.getElementById('wolfwave-picker-iframe');
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({
          type: 'WOLFWAVE_SET_FIELDS',
          fields: fields
        }, '*');
      }
    }
  };

  const loadContentType = async () => {
    try {
      const data = await api.get(`/content-types/${contentTypeName}`);
      setContentType(data);
    } catch (err) {
      console.error('Failed to load content type:', err);
    }
  };

  const loadTemplates = async () => {
    try {
      const data = await api.get(`/templates/content_type/${contentTypeName}`);
      setTemplates(data.data || []);
    } catch (err) {
      console.error('Failed to load templates:', err);
    }
  };

  const loadItem = async () => {
    try {
      const data = await api.get(`${endpoint}/${id}`);
      setItem({
        template_id: data.template_id,
        title: data.title || data.name,
        slug: data.slug,
        content: data.content || {},
        status: data.status || 'draft',
        meta_title: data.meta_title || '',
        meta_description: data.meta_description || ''
      });
      setRegions(parseRegions(data.regions));
    } catch (err) {
      console.error('Failed to load item:', err);
    } finally {
      setLoading(false);
    }
  };

  const generateSlug = (title) => {
    return title
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_]+/g, '-')
      .replace(/^-+|-+$/g, '');
  };

  const handleTitleChange = (title) => {
    const slug = generateSlug(title);
    setItem(i => ({ ...i, title, slug }));
  };

  const handleTemplateChange = (templateId) => {
    const numId = parseInt(templateId);
    const template = templates.find(t => t.id === numId);
    setItem(i => ({ ...i, template_id: numId }));
    setRegions(parseRegions(template?.regions));
  };

  const handleContentChange = (regionName, value) => {
    setItem(i => ({
      ...i,
      content: { ...i.content, [regionName]: value }
    }));
  };

  const handleSave = async () => {
    if (!item.template_id) {
      alert('Please select a template');
      return;
    }

    setSaving(true);

    try {
      const payload = {
        ...item,
        content_type: contentTypeName
      };

      if (isNew) {
        const result = await api.post(endpoint, payload);
        navigate(`/${contentTypeName}/${result.id}`, { replace: true });
      } else {
        await api.put(`${endpoint}/${id}`, payload);
        alert('Saved successfully!');
      }
    } catch (err) {
      alert('Failed to save');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  if (loading || !contentType) {
    return <div>Loading...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between sticky top-16 bg-gray-50 z-20 -mx-6 px-6 py-4 border-b border-gray-200">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(`/${contentTypeName}`)} className="btn btn-ghost">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h1 className="text-2xl font-bold">
            {isNew ? `New ${contentType.label}` : `Edit ${contentType.label}`}
          </h1>
        </div>
        <button onClick={handleSave} disabled={saving} className="btn btn-primary">
          <Save className="w-4 h-4 mr-2" />
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Basic Info */}
          <div className="card p-6 space-y-4">
            <div>
              <label className="label">Title</label>
              <input
                type="text"
                value={item.title}
                onChange={(e) => handleTitleChange(e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="label">Slug</label>
              <input
                type="text"
                value={item.slug}
                onChange={(e) => setItem(i => ({ ...i, slug: e.target.value }))}
                className="input"
              />
            </div>
          </div>

          {/* Content Regions */}
          {regions.length > 0 && (
            <div className="card p-6 space-y-6">
              <h2 className="font-semibold text-gray-900">Content</h2>
              {regions.map((region) => (
                <div key={region.name}>
                  <label className="label">{region.label}</label>
                  {region.type === 'richtext' ? (
                    <textarea
                      value={item.content[region.name] || ''}
                      onChange={(e) => handleContentChange(region.name, e.target.value)}
                      className="input h-48"
                      placeholder="Enter rich text content..."
                    />
                  ) : region.type === 'textarea' ? (
                    <textarea
                      value={item.content[region.name] || ''}
                      onChange={(e) => handleContentChange(region.name, e.target.value)}
                      className="input h-32"
                      placeholder={region.placeholder || ''}
                    />
                  ) : (
                    <input
                      type="text"
                      value={item.content[region.name] || ''}
                      onChange={(e) => handleContentChange(region.name, e.target.value)}
                      className="input"
                      placeholder={region.placeholder || ''}
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* SEO Section (conditional) */}
          {contentType.has_seo && (
            <div className="card p-6 space-y-4">
              <h2 className="font-semibold text-gray-900">SEO</h2>
              <div>
                <label className="label">Meta Title</label>
                <input
                  type="text"
                  value={item.meta_title}
                  onChange={(e) => setItem(i => ({ ...i, meta_title: e.target.value }))}
                  className="input"
                />
              </div>
              <div>
                <label className="label">Meta Description</label>
                <textarea
                  value={item.meta_description}
                  onChange={(e) => setItem(i => ({ ...i, meta_description: e.target.value }))}
                  className="input h-24"
                />
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Visual Scrape */}
          <div className="card p-6 space-y-4 border-amber-200 bg-amber-50/30">
            <div className="flex items-center gap-2 text-amber-700 font-bold text-xs uppercase tracking-wider">
              <Globe className="w-4 h-4" />
              Live Visual Scrape
            </div>
            <div className="space-y-2">
              <input 
                type="text" 
                placeholder="Enter URL to pull from..." 
                value={scrapeUrl}
                onChange={e => setScrapeUrl(e.target.value)}
                className="input text-sm bg-white"
              />
              <button 
                type="button"
                onClick={openVisualPicker}
                disabled={scraping}
                className="btn btn-secondary w-full py-2 text-xs"
              >
                {scraping ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : <Maximize2 className="w-3 h-3 mr-2" />}
                Visual Scrape
              </button>
            </div>
            <p className="text-[10px] text-amber-600/70 italic">Pick elements visually to auto-fill fields.</p>
          </div>

          {/* Template */}
          <div className="card p-6 space-y-4">
            <div>
              <label className="label">Template</label>
              <select
                value={item.template_id || ''}
                onChange={(e) => handleTemplateChange(e.target.value)}
                className="input"
              >
                <option value="">Select template</option>
                {templates.map((t) => (
                  <option key={t.id} value={String(t.id)}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Status (conditional) */}
          {contentType.has_status && (
            <div className="card p-6 space-y-4">
              <div>
                <label className="label">Status</label>
                <select
                  value={item.status}
                  onChange={(e) => setItem(i => ({ ...i, status: e.target.value }))}
                  className="input"
                >
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
            </div>
          )}
        </div>
      </div>

      {showPicker && (
        <div className="fixed inset-0 z-[100] bg-black bg-opacity-75 flex flex-col !mt-0 !top-0">
          <div className="bg-white p-4 flex justify-between items-center border-b">
            <div className="flex items-center gap-4 flex-1">
              <h2 className="font-bold shrink-0">Live Content Picker</h2>
              <div className="text-xs text-gray-500 truncate font-mono bg-gray-100 px-2 py-1 rounded">
                Source: {scrapeUrl}
              </div>
              <div className="flex gap-2">
                {Object.entries(selectorMap).map(([field, selector]) => (
                  <span key={field} className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-mono rounded border border-green-200">
                    {field} mapped
                  </span>
                ))}
              </div>
            </div>
            <button onClick={() => setShowPicker(false)} className="btn btn-ghost"><X className="w-5 h-5" /></button>
          </div>
          <div className="flex-1 bg-white">
            <iframe 
              id="wolfwave-picker-iframe"
              src={pickerUrl} 
              onLoad={handlePickerLoad}
              className="w-full h-full border-none"
              title="Visual Picker"
            />
          </div>
        </div>
      )}
    </div>
  );
}
