import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import api, { parseRegions } from '../lib/api';
import slugify from 'slugify';
import RichTextEditor from '../components/RichTextEditor';
import CodeEditor from '../components/CodeEditor';
import MediaPicker from '../components/MediaPicker';
import {
  Save,
  ArrowLeft,
  AlertCircle,
  CheckCircle,
  Plus,
  Trash2,
  Image,
  RefreshCw,
  Lock,
  Unlock,
  Puzzle,
  Copy
} from 'lucide-react';

export default function WidgetEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id;

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const [mediaPickerTarget, setMediaPickerTarget] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [isSlugLocked, setIsSlugLocked] = useState(!isNew);
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [activeTab, setActiveTab] = useState('editor');

  const [widget, setWidget] = useState({
    template_id: '',
    name: '',
    slug: '',
    content_type: 'widgets',
    content: {}
  });

  const [regions, setRegions] = useState([]);

  useEffect(() => {
    loadTemplates();
    if (!isNew) {
      loadWidget();
    }
  }, [id]);

  const loadTemplates = async () => {
    try {
      // Correct the endpoint to fetch widget templates
      const response = await api.get('/templates?content_type=widgets');
      setTemplates(response.data || []);
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

  const loadWidget = async () => {
    try {
      const data = await api.get(`/blocks/${id}`);
      setWidget({
        template_id: data.template_id,
        name: data.name,
        slug: data.slug,
        content_type: 'widgets',
        content: data.content || {}
      });
      setRegions(parseRegions(data.template_regions));

      if (data.content_id) {
        loadHistory(data.content_id);
      }
    } catch (err) {
      console.error('Failed to load widget:', err);
      setError('Failed to load widget');
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async (contentId) => {
    try {
      setLoadingHistory(true);
      const res = await api.get(`/content/${contentId}/history`);
      setHistory(res || []);
    } catch (err) {
      console.error('Failed to load history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const restoreVersion = async (historyId) => {
    if (!confirm('Restore this version? Current unsaved changes will be lost.')) return;
    try {
      setSaving(true);
      await api.post(`/content/history/${historyId}/restore`);
      toast.success('Version restored!');
      await loadWidget();
    } catch (err) {
      toast.error('Failed to restore version');
    } finally {
      setSaving(false);
    }
  };

  const handleNameChange = (name) => {
    if (isSlugLocked) {
      setWidget(w => ({ ...w, name }));
    } else {
      const slug = slugify(name, { lower: true, strict: true });
      setWidget(w => ({ ...w, name, slug }));
    }
  };

  const handleToggleLock = () => {
    if (isSlugLocked) {
      toast.warning('Shortcodes using the old slug will break if you change this!', {
        duration: 6000,
      });
    }
    setIsSlugLocked(!isSlugLocked);
  };

  const handleTemplateChange = (templateId) => {
    const numId = parseInt(templateId);
    const template = templates.find(t => t.id === numId);
    setWidget(w => ({ ...w, template_id: numId }));
    setRegions(parseRegions(template?.regions));
  };

  const handleContentChange = (regionName, value) => {
    setWidget(w => ({
      ...w,
      content: { ...w.content, [regionName]: value }
    }));
  };

  const handleRepeaterAdd = (regionName, fields) => {
    const newItem = {};
    fields.forEach(f => newItem[f.name] = '');
    setWidget(w => ({
      ...w,
      content: {
        ...w.content,
        [regionName]: [...(w.content[regionName] || []), newItem]
      }
    }));
  };

  const handleRepeaterRemove = (regionName, index) => {
    setWidget(w => ({
      ...w,
      content: {
        ...w.content,
        [regionName]: w.content[regionName].filter((_, i) => i !== index)
      }
    }));
  };

  const handleRepeaterChange = (regionName, index, fieldName, value) => {
    setWidget(w => ({
      ...w,
      content: {
        ...w.content,
        [regionName]: w.content[regionName].map((item, i) =>
          i === index ? { ...item, [fieldName]: value } : item
        )
      }
    }));
  };

  const handleSave = async () => {
    setError('');
    setSuccess('');
    setSaving(true);

    try {
      if (isNew) {
        const result = await api.post('/blocks', widget);
        toast.success('Widget created successfully!');
        
        if (result.content_id) {
          loadHistory(result.content_id);
        }
        
        navigate(`/widgets/${result.id}`, { replace: true });
      } else {
        await api.put(`/blocks/${id}`, widget);
        toast.success('Widget saved successfully!');
        
        if (widget.content_id) {
          loadHistory(widget.content_id);
        }
      }
    } catch (err) {
      setError(err.message || 'Failed to save widget');
    } finally {
      setSaving(false);
    }
  };

  const copyShortcode = () => {
    const shortcode = `[[widget:${widget.slug}]]`;
    navigator.clipboard.writeText(shortcode);
    toast.success('Shortcode copied: ' + shortcode);
  };

  const openMediaPicker = (target) => {
    setMediaPickerTarget(target);
    setMediaPickerOpen(true);
  };

  const handleMediaSelect = (media) => {
    if (mediaPickerTarget.startsWith('content.')) {
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
    const value = widget.content[region.name] || '';

    switch (region.type) {
      case 'richtext':
        return (
          <RichTextEditor
            value={value}
            onChange={(val) => handleContentChange(region.name, val)}
          />
        );

      case 'code':
        return (
          <CodeEditor
            value={value}
            onChange={(val) => handleContentChange(region.name, val)}
            mode={region.mode || 'html'}
            height={region.height || '300px'}
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
                {value ? 'Change Image' : 'Select Image'}
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
          </div>
        );

      case 'repeater':
        const items = widget.content[region.name] || [];
        const explicitFields = Array.isArray(region.fields) && region.fields.length > 0 ? region.fields : null;
        const fields = explicitFields || [];
        return (
          <div className="space-y-4">
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
                    ) : field.type === 'code' ? (
                      <CodeEditor
                        value={item[field.name] || ''}
                        onChange={(val) => handleRepeaterChange(region.name, index, field.name, val)}
                        mode={field.mode || 'html'}
                        height={field.height || '200px'}
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/widgets')} className="btn btn-ghost">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <Puzzle className="w-6 h-6 text-primary-600" />
            <h1 className="text-2xl font-bold text-gray-900">
              {isNew ? 'New Widget' : 'Edit Widget'}
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isNew && (
            <button
              onClick={copyShortcode}
              className="btn btn-secondary"
            >
              <Copy className="w-4 h-4 mr-2" />
              Copy Shortcode
            </button>
          )}
          <button
            id="btn-save-widget"
            onClick={handleSave}
            disabled={saving}
            className="btn btn-primary"
          >
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="card p-6 space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-semibold text-gray-900">Widget Identity</h2>
              <button
                type="button"
                onClick={handleToggleLock}
                className="btn btn-ghost px-3"
              >
                {isSlugLocked ? (
                  <Lock className="w-4 h-4 text-gray-600" />
                ) : (
                  <Unlock className="w-4 h-4 text-amber-600" />
                )}
              </button>
            </div>

            <div>
              <label className="label">Name</label>
              <input
                id="input-widget-name"
                type="text"
                value={widget.name}
                onChange={(e) => handleNameChange(e.target.value)}
                className="input"
                placeholder="Widget name"
                disabled={isSlugLocked}
              />
            </div>

            <div>
              <label className="label">Slug / Shortcode ID</label>
              <input
                id="input-widget-slug"
                type="text"
                value={widget.slug}
                onChange={(e) => setWidget(w => ({ ...w, slug: e.target.value }))}
                className="input"
                placeholder="widget-slug"
                disabled={isSlugLocked}
              />
              <p className="text-xs text-gray-500 mt-1">
                Used in shortcode: <code className="text-primary-600">[[widget:{widget.slug || 'slug'}]]</code>
              </p>
            </div>
          </div>

          {/* Tabs */}
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              <button
                id="tab-editor"
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
                id="tab-history"
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
            /* Configurable Properties */
            regions.length > 0 && (
              <div className="card p-6 space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-gray-900">Configurable Properties</h2>
                  <button
                    id="btn-edit-source"
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
                      value={JSON.stringify(widget.content, null, 2)}
                      onChange={(val) => {
                        try {
                          const parsed = JSON.parse(val);
                          setWidget(prev => ({ ...prev, content: parsed }));
                        } catch (e) {
                          // Invalid JSON
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
                        {renderField(region)}
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
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => restoreVersion(ver.id)}
                          className="text-primary-600 hover:text-primary-900 font-medium"
                        >
                          Restore
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
          <div className="card p-6 space-y-4">
            <div>
              <label className="label">Widget Template</label>
              <div className="flex gap-2">
                <select
                  id="select-template"
                  value={widget.template_id || ''}
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
                  id="btn-sync-templates"
                  onClick={syncTemplates}
                  disabled={syncing}
                  className="btn btn-ghost px-3"
                  title="Sync templates from filesystem"
                >
                  <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {mediaPickerOpen && (
        <MediaPicker
          onSelect={handleMediaSelect}
          onClose={() => setMediaPickerOpen(false)}
        />
      )}
    </div>
  );
}
