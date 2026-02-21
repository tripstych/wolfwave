import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api, { parseRegions } from '../lib/api';
import { slugify } from '../lib/slugify';
import { getSiteUrl } from '../lib/urls';
import RichTextEditor from '../components/RichTextEditor';
import MediaPicker from '../components/MediaPicker';
import TitleSlugSection from '../components/TitleSlugSection';
import ContentGroupsWidget from '../components/ContentGroupsWidget';
import {
  Save,
  ArrowLeft,
  Eye,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle,
  Plus,
  Trash2,
  Image,
  RefreshCw,
  Sparkles,
  Loader2,
  Lock,
  Shield
} from 'lucide-react';

export default function PageEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id;

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [subscriptionPlans, setSubscriptionPlans] = useState([]);
  const [seoOpen, setSeoOpen] = useState(false);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [mediaPickerTarget, setMediaPickerTarget] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [syncing, setSyncing] = useState(false);

  const [page, setPage] = useState({
    template_id: '',
    title: '',
    slug: '',
    content_type: 'pages',
    status: 'draft',
    content: {},
    meta_title: '',
    meta_description: '',
    og_title: '',
    og_description: '',
    og_image: '',
    canonical_url: '',
    robots: 'index, follow',
    access_rules: {
      auth: 'any',
      subscription: 'any',
      plans: []
    }
  });

  const [regions, setRegions] = useState([]);
  const [slugEdited, setSlugEdited] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [aiPrompts, setAiPrompts] = useState({}); // Stores image prompts from Auto-Fill
  const [imageGenerating, setImageGenerating] = useState(null); // specific field being generated

  useEffect(() => {
    loadTemplates();
    loadSubscriptionPlans();
    if (!isNew) {
      loadPage();
      setSlugEdited(true); // Existing pages keep their saved slug
    }
  }, [id]);

  const loadSubscriptionPlans = async () => {
    try {
      const response = await api.get('/subscription-plans');
      setSubscriptionPlans(response.data || []);
    } catch (err) {
      console.error('Failed to load subscription plans:', err);
    }
  };

  // Auto-sync slug from title only for new pages when slug hasn't been manually edited
  useEffect(() => {
    if (!slugEdited) {
      setPage(p => ({ ...p, slug: slugify(p.title, 'pages') }));
    }
  }, [page.title, slugEdited]);

  const handleAiGenerate = async () => {
    if (!page.template_id) {
      toast.error('Please select a template first');
      return;
    }

    const prompt = window.prompt(
      '✨ AI Content Generator\n\nWhat kind of content should we generate for this page?', 
      page.title || 'A professional business page'
    );

    if (!prompt) return;

    setGenerating(true);
    try {
      const response = await api.post('/ai/generate-content', {
        templateId: page.template_id,
        prompt: prompt
      });

      if (response.success && response.data) {
        const textContent = {};
        const newAiPrompts = {};

        // Separate text content from image prompts
        Object.keys(response.data).forEach(key => {
          // Heuristic: If it looks like an image prompt (or if we know the field type, but here we just check data)
          // Actually, we should check the region definition. 
          // But since response.data is just k:v, we rely on the fact that for images, 
          // the AI service returns a description string, NOT a URL (except in sim mode).
          // We'll iterate regions to be sure.
          
          const region = regions.find(r => r.name === key);
          if (region && region.type === 'image') {
             // In simulation mode it returns a placeholder URL. In real mode, a prompt string.
             // We'll store it as a prompt regardless.
             newAiPrompts[key] = response.data[key];
          } else if (region && region.type === 'repeater') {
             // For repeaters, it's an array of objects. We need to check subfields.
             // This is complex. For now, let's just apply the repeater data directly 
             // because managing per-item image prompts is a deeper UI change.
             textContent[key] = response.data[key];
          } else {
             textContent[key] = response.data[key];
          }
        });

        setPage(p => ({
          ...p,
          content: {
            ...p.content,
            ...textContent
          }
        }));
        
        setAiPrompts(prev => ({ ...prev, ...newAiPrompts }));
        
        toast.success('✨ Text content generated! Use the magic wand on image fields to generate visuals.');
      } else {
        toast.error('Failed to generate content: ' + (response.error || 'Unknown error'));
      }
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const handleImageGenerate = async (regionName, promptOverride = null) => {
    // 1. Determine Prompt
    // Use the AI suggested prompt if available, otherwise default to page title + field label
    const suggestedPrompt = aiPrompts[regionName];
    const defaultPrompt = `A high quality image for ${page.title || 'website'} - ${regionName}`;
    
    // 2. Ask user to confirm/edit prompt
    const finalPrompt = window.prompt(
      '✨ Generate Image\n\nDescribe the image you want to generate:', 
      promptOverride || suggestedPrompt || defaultPrompt
    );

    if (!finalPrompt) return;

    setImageGenerating(regionName);
    try {
      const response = await api.post('/ai/generate-image', { prompt: finalPrompt });
      if (response.success && response.path) {
        handleContentChange(regionName, response.path);
        toast.success('Image generated!');
      }
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error || 'Image generation failed');
    } finally {
      setImageGenerating(null);
    }
  };

  const loadTemplates = async () => {
    try {
      const data = await api.get('/templates/content_type/pages');
      setTemplates(data.data || []);
    } catch (err) {
      console.error('Failed to load templates:', err);
    }
  };

  const syncTemplates = async () => {
    setSyncing(true);
    setError('');
    setSuccess('');
    try {
      await api.post('/templates/sync');
      await loadTemplates();
      setSuccess('Templates synced successfully!');
    } catch (err) {
      setError(err.message || 'Failed to sync templates');
    } finally {
      setSyncing(false);
    }
  };

  const loadPage = async () => {
    try {
      const data = await api.get(`/pages/${id}`);
      setPage({
        template_id: data.template_id,
        title: data.title,
        slug: data.slug,
        status: data.status,
        content: data.content || {},
        meta_title: data.meta_title || '',
        meta_description: data.meta_description || '',
        og_title: data.og_title || '',
        og_description: data.og_description || '',
        og_image: data.og_image || '',
        canonical_url: data.canonical_url || '',
        robots: data.robots || 'index, follow',
        access_rules: {
          auth: data.access_rules?.auth || 'any',
          subscription: data.access_rules?.subscription || 'any',
          plans: data.access_rules?.plans || []
        }
      });
      setRegions(parseRegions(data.template_regions));
    } catch (err) {
      console.error('Failed to load page:', err);
      setError('Failed to load page');
    } finally {
      setLoading(false);
    }
  };

  const handleTemplateChange = (templateId) => {
    const numId = parseInt(templateId);
    const template = templates.find(t => t.id === numId);
    setPage(p => ({ ...p, template_id: numId }));
    setRegions(parseRegions(template?.regions));
  };

  const handleContentChange = (regionName, value) => {
    setPage(p => ({
      ...p,
      content: { ...p.content, [regionName]: value }
    }));
  };

  const handleRepeaterAdd = (regionName, fields) => {
    const newItem = {};
    fields.forEach(f => newItem[f.name] = '');
    setPage(p => ({
      ...p,
      content: {
        ...p.content,
        [regionName]: [...(p.content[regionName] || []), newItem]
      }
    }));
  };

  const handleRepeaterRemove = (regionName, index) => {
    setPage(p => ({
      ...p,
      content: {
        ...p.content,
        [regionName]: p.content[regionName].filter((_, i) => i !== index)
      }
    }));
  };

  const handleRepeaterChange = (regionName, index, fieldName, value) => {
    setPage(p => ({
      ...p,
      content: {
        ...p.content,
        [regionName]: p.content[regionName].map((item, i) =>
          i === index ? { ...item, [fieldName]: value } : item
        )
      }
    }));
  };

  const handleSave = async (newStatus) => {
    setError('');
    setSuccess('');
    setSaving(true);

    try {
      const payload = {
        ...page,
        status: newStatus || page.status
      };

      if (isNew) {
        const result = await api.post('/pages', payload);
        setSuccess('Page created successfully!');
        navigate(`/pages/${result.id}`, { replace: true });
      } else {
        await api.put(`/pages/${id}`, payload);
        setSuccess('Page saved successfully!');
        setPage(p => ({ ...p, status: newStatus || p.status }));
      }
    } catch (err) {
      setError(err.message || 'Failed to save page');
    } finally {
      setSaving(false);
    }
  };

  const openMediaPicker = (target) => {
    setMediaPickerTarget(target);
    setMediaPickerOpen(true);
  };

  const handleMediaSelect = (media) => {
    if (mediaPickerTarget === 'og_image') {
      setPage(p => ({ ...p, og_image: media.url }));
    } else if (mediaPickerTarget.startsWith('content.')) {
      const remainder = mediaPickerTarget.replace('content.', '');
      const parts = remainder.split('.');
      if (parts.length === 1) {
        const regionName = parts[0];
        handleContentChange(regionName, media.url);
      } else if (parts.length === 3) {
        const [regionName, indexStr, fieldName] = parts;
        const index = Number.parseInt(indexStr, 10);
        if (Number.isFinite(index)) {
          handleRepeaterChange(regionName, index, fieldName, media.url);
        }
      }
    }
    setMediaPickerOpen(false);
    setMediaPickerTarget(null);
  };

  const renderField = (region) => {
    const value = page.content[region.name] || '';

    switch (region.type) {
      case 'richtext':
        return (
          <RichTextEditor
            value={value}
            onChange={(val) => handleContentChange(region.name, val)}
          />
        );

      case 'textarea':
        return (
          <textarea
            value={value}
            onChange={(e) => handleContentChange(region.name, e.target.value)}
            className="input min-h-[100px]"
            placeholder={region.placeholder}
          />
        );

      case 'image':
        return (
          <div className="space-y-2">
            {value && (
              <img src={value} alt="" className="max-w-xs rounded-lg border" />
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => openMediaPicker(`content.${region.name}`)}
                className="btn btn-secondary"
              >
                <Image className="w-4 h-4 mr-2" />
                {value ? 'Change' : 'Select'}
              </button>
              
              <button
                type="button"
                onClick={() => handleImageGenerate(region.name)}
                disabled={imageGenerating === region.name}
                className={`btn ${aiPrompts[region.name] ? 'btn-primary' : 'btn-secondary'} border-indigo-200 text-indigo-700`}
                title={aiPrompts[region.name] ? "Generate from AI suggestion" : "Generate with AI"}
              >
                {imageGenerating === region.name ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4 mr-2" />
                )}
                {aiPrompts[region.name] ? 'Auto-Generate' : 'Generate'}
              </button>

              {value && (
                <button
                  type="button"
                  onClick={() => handleContentChange(region.name, '')}
                  className="btn btn-ghost text-red-600"
                >
                  Remove
                </button>
              )}
            </div>
            {aiPrompts[region.name] && (
              <p className="text-xs text-indigo-600 bg-indigo-50 p-2 rounded border border-indigo-100 mt-1">
                <strong>AI Suggestion:</strong> {aiPrompts[region.name]}
              </p>
            )}
          </div>
        );

      case 'repeater':
        const items = page.content[region.name] || [];
        const explicitFields = Array.isArray(region.fields) && region.fields.length > 0 ? region.fields : null;
        const inferredFields = !explicitFields && items[0] && typeof items[0] === 'object' && !Array.isArray(items[0])
          ? Object.keys(items[0])
              .filter((key) => key !== 'id')
              .map((name) => ({
                name,
                label: name
                  .replace(/[-_]/g, ' ')
                  .replace(/\b\w/g, (c) => c.toUpperCase()),
                type: (() => {
                  const n = name.toLowerCase();
                  if (n.includes('description')) return 'textarea';
                  if (n.includes('image') || n === 'src' || n.endsWith('_src') || n.endsWith('-src')) return 'image';
                  return 'text';
                })()
              }))
          : null;
        const fields = explicitFields || inferredFields || [];
        return (
          <div className="space-y-4">
            {!explicitFields && (
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
                {inferredFields
                  ? 'Repeater field schema missing for this template. Showing fields inferred from existing data.'
                  : 'Repeater field schema missing for this template. Sync templates from filesystem to restore field definitions.'}
              </div>
            )}
            {items.map((item, index) => (
              <div key={index} className="p-4 border border-gray-200 rounded-lg space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-500">Item {index + 1}</span>
                  <button
                    type="button"
                    onClick={() => handleRepeaterRemove(region.name, index)}
                    className="text-red-500 hover:text-red-700"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                {fields.map((field) => (
                  <div key={field.name}>
                    <label className="label">{field.label}</label>
                    {field.type === 'image' ? (
                      <div className="space-y-2">
                        {item[field.name] && (
                          <img src={item[field.name]} alt="" className="max-w-xs rounded-lg border" />
                        )}
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => openMediaPicker(`content.${region.name}.${index}.${field.name}`)}
                            className="btn btn-secondary"
                          >
                            <Image className="w-4 h-4 mr-2" />
                            {item[field.name] ? 'Change Image' : 'Select Image'}
                          </button>
                          {item[field.name] && (
                            <button
                              type="button"
                              onClick={() => handleRepeaterChange(region.name, index, field.name, '')}
                              className="btn btn-ghost text-red-600"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </div>
                    ) : field.type === 'textarea' ? (
                      <textarea
                        value={item[field.name] || ''}
                        onChange={(e) => handleRepeaterChange(region.name, index, field.name, e.target.value)}
                        className="input"
                      />
                    ) : (
                      <input
                        type="text"
                        value={item[field.name] || ''}
                        onChange={(e) => handleRepeaterChange(region.name, index, field.name, e.target.value)}
                        className="input"
                      />
                    )}
                  </div>
                ))}
              </div>
            ))}
            <button
              type="button"
              onClick={() => handleRepeaterAdd(region.name, fields)}
              className="btn btn-secondary w-full"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Item
            </button>
          </div>
        );

      default:
        return (
          <input
            type="text"
            value={value}
            onChange={(e) => handleContentChange(region.name, e.target.value)}
            className="input"
            placeholder={region.placeholder}
          />
        );
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
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
            <a
              href={getSiteUrl(page.slug)}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-ghost"
            >
              <Eye className="w-4 h-4 mr-2" />
              View
            </a>
          )}
          <button
            onClick={() => handleSave('draft')}
            disabled={saving}
            className="btn btn-secondary"
          >
            Save Draft
          </button>
          <button
            onClick={() => handleSave('published')}
            disabled={saving}
            className="btn btn-primary"
          >
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Saving...' : 'Publish'}
          </button>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          {error}
        </div>
      )}
      {success && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700">
          <CheckCircle className="w-5 h-5 flex-shrink-0" />
          {success}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Basic Info */}
          <TitleSlugSection
            title={page.title}
            slug={page.slug}
            onTitleChange={(title) => setPage(p => ({ ...p, title }))}
            onSlugChange={(slug) => { setSlugEdited(true); setPage(p => ({ ...p, slug })); }}
          />

          {/* Content Regions */}
          {regions.length > 0 && (
            <div className="card p-6 space-y-6">
              <h2 className="font-semibold text-gray-900">Content</h2>
              {regions.map((region) => (
                <div key={region.name}>
                  <label className="label">
                    {region.label}
                    {region.required && <span className="text-red-500 ml-1">*</span>}
                  </label>
                  {renderField(region)}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Status & Template */}
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
                    <option key={t.id} value={String(t.id)}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={syncTemplates}
                  disabled={syncing}
                  className="btn btn-ghost px-3"
                  title="Sync templates from filesystem"
                >
                  <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                </button>
              </div>
              <button
                onClick={handleAiGenerate}
                disabled={generating || !page.template_id}
                className="btn btn-secondary w-full mt-2 flex items-center justify-center gap-2 text-indigo-600 border-indigo-200 hover:bg-indigo-50"
              >
                {generating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                Auto-Fill Content
              </button>
            </div>
            <div>
              <label className="label">Status</label>
              <select
                value={page.status}
                onChange={(e) => setPage(p => ({ ...p, status: e.target.value }))}
                className="input"
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>

          {/* Access Control */}
          <div className="card p-6 space-y-4">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <Lock className="w-4 h-4" />
              Access Control
            </h2>
            <div className="space-y-4">
              <div>
                <label className="label">Authentication</label>
                <select
                  value={page.access_rules?.auth || 'any'}
                  onChange={(e) => setPage(p => ({ 
                    ...p, 
                    access_rules: { ...p.access_rules, auth: e.target.value } 
                  }))}
                  className="input"
                >
                  <option value="any">Everyone</option>
                  <option value="logged_in">Logged In Only</option>
                  <option value="logged_out">Logged Out Only</option>
                </select>
              </div>
              <div>
                <label className="label">Subscription</label>
                <select
                  value={page.access_rules?.subscription || 'any'}
                  onChange={(e) => setPage(p => ({ 
                    ...p, 
                    access_rules: { ...p.access_rules, subscription: e.target.value, plans: e.target.value === 'any' ? [] : (p.access_rules.plans || []) } 
                  }))}
                  className="input"
                >
                  <option value="any">No Subscription Required</option>
                  <option value="required">Active Subscription Required</option>
                </select>
              </div>

              {page.access_rules?.subscription === 'required' && (
                <div className="space-y-2">
                  <label className="label text-xs">Required Tiers (Optional)</label>
                  <div className="space-y-1 max-h-32 overflow-y-auto p-2 border border-gray-200 rounded-md">
                    {subscriptionPlans.length === 0 ? (
                      <p className="text-xs text-gray-500 italic">No plans defined</p>
                    ) : (
                      subscriptionPlans.map(plan => (
                        <label key={plan.id} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-50 p-1 rounded">
                          <input
                            type="checkbox"
                            checked={(page.access_rules?.plans || []).includes(plan.slug)}
                            onChange={(e) => {
                              const currentPlans = page.access_rules?.plans || [];
                              const newPlans = e.target.checked
                                ? [...currentPlans, plan.slug]
                                : currentPlans.filter(s => s !== plan.slug);
                              setPage(p => ({
                                ...p,
                                access_rules: { ...p.access_rules, plans: newPlans }
                              }));
                            }}
                          />
                          {plan.name}
                        </label>
                      ))
                    )}
                  </div>
                  <p className="text-[10px] text-gray-500">If no tiers are selected, any active subscription will grant access.</p>
                </div>
              )}

              {page.access_rules?.subscription === 'required' && (
                <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700">
                  <p className="flex items-start gap-2">
                    <Shield className="w-3 h-3 mt-0.5 flex-shrink-0" />
                    Users without an active subscription will be redirected to the pricing page.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* SEO */}
          <div className="card">
            <button
              onClick={() => setSeoOpen(!seoOpen)}
              className="w-full px-6 py-4 flex items-center justify-between text-left"
            >
              <span className="font-semibold text-gray-900">SEO Settings</span>
              {seoOpen ? (
                <ChevronUp className="w-5 h-5 text-gray-500" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-500" />
              )}
            </button>
            {seoOpen && (
              <div className="px-6 pb-6 space-y-4 border-t border-gray-200 pt-4">
                <div>
                  <label className="label">Meta Title</label>
                  <input
                    type="text"
                    value={page.meta_title}
                    onChange={(e) => setPage(p => ({ ...p, meta_title: e.target.value }))}
                    className="input"
                    maxLength={60}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {page.meta_title.length}/60 characters
                  </p>
                </div>
                <div>
                  <label className="label">Meta Description</label>
                  <textarea
                    value={page.meta_description}
                    onChange={(e) => setPage(p => ({ ...p, meta_description: e.target.value }))}
                    className="input"
                    rows={3}
                    maxLength={160}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {page.meta_description.length}/160 characters
                  </p>
                </div>
                <div>
                  <label className="label">OG Image</label>
                  {page.og_image && (
                    <img src={page.og_image} alt="" className="max-w-full rounded-lg border mb-2" />
                  )}
                  <button
                    type="button"
                    onClick={() => openMediaPicker('og_image')}
                    className="btn btn-secondary w-full"
                  >
                    <Image className="w-4 h-4 mr-2" />
                    {page.og_image ? 'Change' : 'Select'} OG Image
                  </button>
                </div>
                <div>
                  <label className="label">Robots</label>
                  <select
                    value={page.robots}
                    onChange={(e) => setPage(p => ({ ...p, robots: e.target.value }))}
                    className="input"
                  >
                    <option value="index, follow">Index, Follow</option>
                    <option value="noindex, follow">No Index, Follow</option>
                    <option value="index, nofollow">Index, No Follow</option>
                    <option value="noindex, nofollow">No Index, No Follow</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Groups Widget */}
      {page.content_id && (
        <div className="mt-8">
          <ContentGroupsWidget contentId={page.content_id} />
        </div>
      )}

      {/* Media Picker Modal */}
      {mediaPickerOpen && (
        <MediaPicker
          onSelect={handleMediaSelect}
          onClose={() => setMediaPickerOpen(false)}
        />
      )}
    </div>
  );
}
