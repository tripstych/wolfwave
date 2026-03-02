import React, { useState, useEffect } from 'react';
import api from '../lib/api';
import { Save, ArrowLeft, Type, Layout, Palette, Loader2, Code, FileCode, Plus, Trash2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import CodeEditor from '../components/CodeEditor';

const FONT_OPTIONS = [
  { label: 'System Sans', value: "system-ui, -apple-system, sans-serif" },
  { label: 'Inter', value: "'Inter', sans-serif" },
  { label: 'Roboto', value: "'Roboto', sans-serif" },
  { label: 'Open Sans', value: "'Open Sans', sans-serif" },
  { label: 'Serif', value: "Georgia, serif" },
  { label: 'Monospace', value: "monospace" }
];

export default function StyleEditor() {
  const [templates, setTemplates] = useState([]);
  const [selectedId, setSelectedId] = useState('global');
  const [options, setOptions] = useState({});
  const [customCss, setCustomCss] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('visual');
  const [stylesheets, setStylesheets] = useState([]);
  const [selectedStylesheet, setSelectedStylesheet] = useState(null);
  const [stylesheetContent, setStylesheetContent] = useState('');
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    loadTemplates();
    loadCustomCss();
    loadStylesheets();
  }, []);

  const loadCustomCss = async () => {
    try {
      const data = await api.get('/settings/global_custom_css');
      setCustomCss(data.value || '');
    } catch (err) {
      console.error('Failed to load custom CSS:', err);
    }
  };

  const loadStylesheets = async () => {
    try {
      const data = await api.get('/stylesheets');
      setStylesheets(data.stylesheets || []);
    } catch (err) {
      console.error('Failed to load stylesheets:', err);
      toast.error('Failed to load stylesheets');
    }
  };

  const handleSelectStylesheet = async (stylesheet) => {
    setSelectedStylesheet(stylesheet);
    setStylesheetContent(stylesheet.content || '');
  };

  const handleSaveStylesheet = async () => {
    if (!selectedStylesheet) return;
    try {
      setSaving(true);
      await api.put(`/stylesheets/${selectedStylesheet.id}`, { content: stylesheetContent });
      toast.success('Stylesheet saved successfully');
      await loadStylesheets();
    } catch (err) {
      toast.error('Failed to save stylesheet');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteStylesheet = async (id) => {
    if (!confirm('Are you sure you want to delete this stylesheet?')) return;
    try {
      await api.delete(`/stylesheets/${id}`);
      toast.success('Stylesheet deleted');
      if (selectedStylesheet?.id === id) {
        setSelectedStylesheet(null);
        setStylesheetContent('');
      }
      await loadStylesheets();
    } catch (err) {
      toast.error('Failed to delete stylesheet');
    }
  };

  const handleSyncFromFilesystem = async () => {
    try {
      setSyncing(true);
      const result = await api.post('/stylesheets/sync-from-filesystem');
      toast.success(`Synced ${result.synced} stylesheets from filesystem`);
      await loadStylesheets();
    } catch (err) {
      toast.error('Failed to sync stylesheets');
    } finally {
      setSyncing(false);
    }
  };

  const handleCreateStylesheet = async () => {
    const filename = prompt('Enter stylesheet filename (e.g., custom-styles.css):');
    if (!filename) return;
    try {
      await api.post('/stylesheets', {
        filename,
        content: '/* New stylesheet */\n',
        description: 'Custom stylesheet',
        type: 'custom',
        is_active: true
      });
      toast.success('Stylesheet created');
      await loadStylesheets();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create stylesheet');
    }
  };

  useEffect(() => {
    if (selectedId === 'global') {
      loadGlobalStyles();
    } else {
      const t = templates.find(t => String(t.id) === selectedId);
      if (t) handleSelectTemplate(t);
    }
  }, [selectedId, templates]);

  const loadTemplates = async () => {
    try {
      const data = await api.get('/templates?content_type=pages');
      setTemplates(data.data || []);
    } catch (err) {
      toast.error('Failed to load templates');
    } finally {
      setLoading(false);
    }
  };

  const loadGlobalStyles = async () => {
    try {
      const data = await api.get('/settings/global_styles');
      let globalOpts = {};
      if (data && data.value) {
        try {
          globalOpts = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
        } catch (e) {}
      }
      applyStyles(globalOpts);
    } catch (err) {
      applyStyles({});
    }
  };

  const applyStyles = (opts) => {
    const defaults = {
      body_font: "system-ui, -apple-system, sans-serif",
      body_size: "16px",
      body_color: "#1e293b",
      h1_size: "2.5rem",
      h1_color: "#0f172a",
      h1_weight: "700",
      h2_size: "2rem",
      h2_color: "#0f172a",
      h2_weight: "700",
      h3_size: "1.5rem",
      h3_color: "#0f172a",
      h3_weight: "600",
      p_size: "1rem",
      p_color: "#1e293b",
      link_color: "#2563eb",
      google_font_body: "",
      google_font_heading: "",
      primary_color: "#2563eb",
      secondary_color: "#64748b",
      container_width: "1200px"
    };
    setOptions({ ...defaults, ...opts });
  };

  const handleSelectTemplate = (template) => {
    let opts = {};
    if (template.options) {
      try {
        opts = typeof template.options === 'string' ? JSON.parse(template.options) : template.options;
      } catch (e) { opts = {}; }
    }
    applyStyles(opts);
  };

  const updateOption = (key, value) => {
    setOptions(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      if (activeTab === 'css') {
        await api.put('/settings/global_custom_css', { value: customCss });
        toast.success('Custom CSS saved');
      } else if (activeTab === 'stylesheets') {
        await handleSaveStylesheet();
        return;
      } else if (selectedId === 'global') {
        await api.put('/settings/global_styles', { value: JSON.stringify(options) });
        toast.success('Global site styles saved');
      } else {
        // Clean template options: don't save "Inter" as an override if it's the default
        const cleanedOptions = { ...options };
        if (cleanedOptions.google_font_body === 'Inter' || cleanedOptions.google_font_body === '') {
          delete cleanedOptions.google_font_body;
        }
        if (cleanedOptions.google_font_heading === 'Inter' || cleanedOptions.google_font_heading === '') {
          delete cleanedOptions.google_font_heading;
        }

        await api.put(`/templates/${selectedId}`, { options: cleanedOptions });
        toast.success('Template specific styles saved');
        setTemplates(prev => prev.map(t => String(t.id) === selectedId ? { ...t, options: JSON.stringify(cleanedOptions) } : t));
      }
    } catch (err) {
      console.error('STYLE_SAVE_ERROR:', err);
      toast.error('Failed to save styles');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="sticky top-[64px] z-20 bg-gray-50/95 backdrop-blur-sm -mx-6 px-6 py-4 border-b border-gray-200 mb-2">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Style Editor</h1>
            <p className="text-xs text-gray-500">Configure global typography, colors and custom CSS for your site.</p>
          </div>
          <button 
            id="style-editor-save"
            onClick={handleSave} 
            disabled={saving}
            className="btn btn-primary shadow-sm"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Save {activeTab === 'css' ? 'CSS' : 'Styles'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            id="style-editor-tab-visual"
            onClick={() => setActiveTab('visual')}
            className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
              activeTab === 'visual'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Palette className="w-4 h-4" />
            Visual Editor
          </button>
          <button
            id="style-editor-tab-css"
            onClick={() => setActiveTab('css')}
            className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
              activeTab === 'css'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Code className="w-4 h-4" />
            Custom CSS
          </button>
          <button
            id="style-editor-tab-stylesheets"
            onClick={() => setActiveTab('stylesheets')}
            className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
              activeTab === 'stylesheets'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <FileCode className="w-4 h-4" />
            Stylesheets
          </button>
        </nav>
      </div>

      {activeTab === 'css' ? (
        <div className="space-y-4">
          <div className="card p-0 overflow-hidden">
            <CodeEditor
              mode="css"
              value={customCss}
              onChange={setCustomCss}
              height="600px"
              theme="monokai"
            />
          </div>
          <p className="text-xs text-gray-500 bg-gray-50 p-3 rounded border border-gray-200">
            <strong>Note:</strong> This CSS will be injected into the <code>&lt;head&gt;</code> of all pages, after all other styles.
          </p>
        </div>
      ) : activeTab === 'stylesheets' ? (
        <div className="space-y-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">Manage Stylesheets</h2>
            <div className="flex gap-2">
              <button id="style-editor-sync-filesystem" onClick={handleSyncFromFilesystem} disabled={syncing} className="btn btn-secondary">
                <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Syncing...' : 'Sync from Filesystem'}
              </button>
              <button id="style-editor-create-stylesheet" onClick={handleCreateStylesheet} className="btn btn-primary">
                <Plus className="w-4 h-4 mr-2" />
                New Stylesheet
              </button>
            </div>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1">
              <div className="card overflow-hidden">
                <div className="divide-y divide-gray-200">
                  {stylesheets.length === 0 ? (
                    <div className="p-6 text-center text-gray-500">
                      <FileCode className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>No stylesheets found.</p>
                    </div>
                  ) : (
                    stylesheets.map((stylesheet) => (
                      <div
                        key={stylesheet.id}
                        className={`p-4 flex items-center justify-between hover:bg-gray-50 cursor-pointer ${
                          selectedStylesheet?.id === stylesheet.id ? 'bg-primary-50 ring-1 ring-inset ring-primary-500' : ''
                        }`}
                        onClick={() => handleSelectStylesheet(stylesheet)}
                      >
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium truncate ${
                            selectedStylesheet?.id === stylesheet.id ? 'text-primary-900' : 'text-gray-900'
                          }`}>
                            {stylesheet.filename}
                          </p>
                          <p className="text-xs text-gray-500 truncate">{stylesheet.type || 'custom'}</p>
                          {stylesheet.is_active && (
                            <span className="inline-block mt-1 px-2 py-0.5 text-[10px] font-medium bg-green-100 text-green-800 rounded">
                              Active
                            </span>
                          )}
                        </div>
                        <button
                          id="style-editor-delete-stylesheet-"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteStylesheet(stylesheet.id);
                          }}
                          className="ml-2 p-1 text-red-600 hover:bg-red-50 rounded"
                          title="Delete stylesheet"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
            
            <div className="lg:col-span-2">
              {selectedStylesheet ? (
                <div className="space-y-4">
                  <div className="card p-4">
                    <h3 className="font-semibold text-gray-900 mb-2">{selectedStylesheet.filename}</h3>
                    {selectedStylesheet.description && (
                      <p className="text-sm text-gray-600 mb-2">{selectedStylesheet.description}</p>
                    )}
                    {selectedStylesheet.source_file && (
                      <p className="text-xs text-gray-500">
                        Source: <code className="bg-gray-100 px-1 rounded">{selectedStylesheet.source_file}</code>
                      </p>
                    )}
                  </div>
                  <div className="card p-0 overflow-hidden">
                    <CodeEditor
                      mode="css"
                      value={stylesheetContent}
                      onChange={setStylesheetContent}
                      height="500px"
                      theme="monokai"
                    />
                  </div>
                </div>
              ) : (
                <div className="card p-12 text-center text-gray-500">
                  <FileCode className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Select a stylesheet to edit</p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Selector */}
            <div className="lg:col-span-1 space-y-4">
              <div className="card p-4">
                <label className="label">Editing Scope</label>
                <select 
                  className="input"
                  value={selectedId}
                  onChange={(e) => setSelectedId(e.target.value)}
                >
                  <option value="global" className="font-bold">🌍 Global Site Styles</option>
                  <optgroup label="Template Overrides">
                    {templates.map(t => (
                      <option key={t.id} value={String(t.id)}>{t.name}</option>
                    ))}
                  </optgroup>
                </select>
                {selectedId !== 'global' && (
                  <p className="mt-2 text-[10px] text-amber-600 font-medium bg-amber-50 p-2 rounded border border-amber-100">
                    You are overriding global styles for the <strong>{templates.find(t => String(t.id) === selectedId)?.name}</strong> template.
                  </p>
                )}
              </div>
            </div>

            {/* Editor Panels */}
            <div className="lg:col-span-3 space-y-6">
              
              {/* Typography */}
              <div className="card p-6 space-y-6">
                <h2 className="font-bold text-lg flex items-center gap-2 border-b pb-2">
                  <Type className="w-5 h-5 text-primary-600" />
                  Typography
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
                  {/* Column 1 */}
                  <div className="space-y-8">
                    <div className="space-y-4">
                      <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500">Body & Paragraphs</h3>
                      <div>
                        <label className="label">Font Family</label>
                        <select 
                          className="input"
                          value={options.body_font}
                          onChange={(e) => updateOption('body_font', e.target.value)}
                        >
                          {FONT_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                        </select>
                      </div>
                      <div className="flex gap-4">
                        <div className="flex-1">
                          <label className="label">Body Size</label>
                          <input type="text" className="input" value={options.body_size} onChange={(e) => updateOption('body_size', e.target.value)} />
                        </div>
                        <div className="flex-1">
                          <label className="label">Body Color</label>
                          <div className="flex gap-2">
                            <input type="color" value={options.body_color} onChange={(e) => updateOption('body_color', e.target.value)} className="h-10 w-10 p-1 rounded border border-gray-300" />
                            <input type="text" className="input flex-1 text-xs" value={options.body_color} onChange={(e) => updateOption('body_color', e.target.value)} />
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-4">
                        <div className="flex-1">
                          <label className="label">Paragraph (P) Size</label>
                          <input type="text" className="input" value={options.p_size} onChange={(e) => updateOption('p_size', e.target.value)} />
                        </div>
                        <div className="flex-1">
                          <label className="label">Link Color</label>
                          <div className="flex gap-2">
                            <input type="color" value={options.link_color} onChange={(e) => updateOption('link_color', e.target.value)} className="h-10 w-10 p-1 rounded border border-gray-300" />
                            <input type="text" className="input flex-1 text-xs" value={options.link_color} onChange={(e) => updateOption('link_color', e.target.value)} />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4 pt-4 border-t border-gray-100">
                      <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500">Google Fonts</h3>
                      <div>
                        <label className="label">Body Google Font</label>
                        <div className="space-y-2">
                          <select 
                            className="input"
                            value={options.google_font_body}
                            onChange={(e) => updateOption('google_font_body', e.target.value)}
                          >
                            <option value="">None / System</option>
                            <option value="Inter">Inter</option>
                            <option value="Roboto">Roboto</option>
                            <option value="Open Sans">Open Sans</option>
                            <option value="Lato">Lato</option>
                            <option value="Montserrat">Montserrat</option>
                            <option value="Playfair Display">Playfair Display</option>
                            <option value="Merriweather">Merriweather</option>
                            <option value="Poppins">Poppins</option>
                            <option value="Source Sans Pro">Source Sans Pro</option>
                          </select>
                          <input 
                            type="text" 
                            placeholder="Custom Font Name (e.g. Oswald)" 
                            className="input text-xs" 
                            value={options.google_font_body} 
                            onChange={(e) => updateOption('google_font_body', e.target.value)}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="label">Heading Google Font</label>
                        <div className="space-y-2">
                          <select 
                            className="input"
                            value={options.google_font_heading}
                            onChange={(e) => updateOption('google_font_heading', e.target.value)}
                          >
                            <option value="">None / Same as Body</option>
                            <option value="Inter">Inter</option>
                            <option value="Montserrat">Montserrat</option>
                            <option value="Playfair Display">Playfair Display</option>
                            <option value="Oswald">Oswald</option>
                            <option value="Raleway">Raleway</option>
                            <option value="Bebas Neue">Bebas Neue</option>
                            <option value="Lora">Lora</option>
                            <option value="Work Sans">Work Sans</option>
                          </select>
                          <input 
                            type="text" 
                            placeholder="Custom Heading Font Name" 
                            className="input text-xs" 
                            value={options.google_font_heading} 
                            onChange={(e) => updateOption('google_font_heading', e.target.value)}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500">Heading 2 (H2)</h3>
                      <div className="flex gap-4">
                        <div className="flex-1">
                          <label className="label">H2 Size</label>
                          <input type="text" className="input" value={options.h2_size} onChange={(e) => updateOption('h2_size', e.target.value)} />
                        </div>
                        <div className="flex-1">
                          <label className="label">H2 Weight</label>
                          <select className="input" value={options.h2_weight} onChange={(e) => updateOption('h2_weight', e.target.value)}>
                            <option value="400">400</option>
                            <option value="500">500</option>
                            <option value="600">600</option>
                            <option value="700">700</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="label">H2 Color</label>
                        <div className="flex gap-2">
                          <input type="color" value={options.h2_color} onChange={(e) => updateOption('h2_color', e.target.value)} className="h-10 w-10 p-1 rounded border border-gray-300" />
                          <input type="text" className="input flex-1 text-xs" value={options.h2_color} onChange={(e) => updateOption('h2_color', e.target.value)} />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Column 2 */}
                  <div className="space-y-8">
                    <div className="space-y-4">
                      <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500">Heading 1 (H1)</h3>
                      <div className="flex gap-4">
                        <div className="flex-1">
                          <label className="label">H1 Size</label>
                          <input type="text" className="input" value={options.h1_size} onChange={(e) => updateOption('h1_size', e.target.value)} />
                        </div>
                        <div className="flex-1">
                          <label className="label">H1 Weight</label>
                          <select className="input" value={options.h1_weight} onChange={(e) => updateOption('h1_weight', e.target.value)}>
                            <option value="400">400</option>
                            <option value="500">500</option>
                            <option value="600">600</option>
                            <option value="700">700</option>
                            <option value="800">800</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="label">H1 Color</label>
                        <div className="flex gap-2">
                          <input type="color" value={options.h1_color} onChange={(e) => updateOption('h1_color', e.target.value)} className="h-10 w-10 p-1 rounded border border-gray-300" />
                          <input type="text" className="input flex-1 text-xs" value={options.h1_color} onChange={(e) => updateOption('h1_color', e.target.value)} />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500">Heading 3 (H3)</h3>
                      <div className="flex gap-4">
                        <div className="flex-1">
                          <label className="label">H3 Size</label>
                          <input type="text" className="input" value={options.h3_size} onChange={(e) => updateOption('h3_size', e.target.value)} />
                        </div>
                        <div className="flex-1">
                          <label className="label">H3 Weight</label>
                          <select className="input" value={options.h3_weight} onChange={(e) => updateOption('h3_weight', e.target.value)}>
                            <option value="400">400</option>
                            <option value="500">500</option>
                            <option value="600">600</option>
                            <option value="700">700</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="label">H3 Color</label>
                        <div className="flex gap-2">
                          <input type="color" value={options.h3_color} onChange={(e) => updateOption('h3_color', e.target.value)} className="h-10 w-10 p-1 rounded border border-gray-300" />
                          <input type="text" className="input flex-1 text-xs" value={options.h3_color} onChange={(e) => updateOption('h3_color', e.target.value)} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Theme Colors */}
              <div className="card p-6 space-y-6">
                <h2 className="font-bold text-lg flex items-center gap-2 border-b pb-2">
                  <Palette className="w-5 h-5 text-primary-600" />
                  Theme Colors
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="label">Primary Branding Color</label>
                    <div className="flex gap-2">
                      <input type="color" value={options.primary_color} onChange={(e) => updateOption('primary_color', e.target.value)} className="h-10 w-10 p-1 rounded border border-gray-300" />
                      <input type="text" className="input flex-1" value={options.primary_color} onChange={(e) => updateOption('primary_color', e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <label className="label">Secondary / Muted Color</label>
                    <div className="flex gap-2">
                      <input type="color" value={options.secondary_color} onChange={(e) => updateOption('secondary_color', e.target.value)} className="h-10 w-10 p-1 rounded border border-gray-300" />
                      <input type="text" className="input flex-1" value={options.secondary_color} onChange={(e) => updateOption('secondary_color', e.target.value)} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Layout */}
              <div className="card p-6 space-y-6">
                <h2 className="font-bold text-lg flex items-center gap-2 border-b pb-2">
                  <Layout className="w-5 h-5 text-primary-600" />
                  Global Layout
                </h2>
                <div className="max-w-xs">
                  <label className="label">Max Container Width</label>
                  <input 
                    type="text" 
                    className="input" 
                    value={options.container_width} 
                    onChange={(e) => updateOption('container_width', e.target.value)} 
                    placeholder="1200px"
                  />
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
