import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api, { parseRegions } from '../lib/api';
import { RefreshCw, Layers, FileText, ChevronRight, CheckCircle, Code, Search, ChevronDown, ChevronUp, Maximize2, Minimize2, Loader2, Save } from 'lucide-react';
import CodeEditor from '../components/CodeEditor';
import { toast } from 'sonner';

export default function Templates() {
  const [templates, setTemplates] = useState([]);
  const [activeTheme, setActiveTheme] = useState('default');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [syncMessage, setSyncMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedTypes, setCollapsedTypes] = useState(new Set());
  const [editorContent, setEditorContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [loadingEditor, setLoadingEditor] = useState(false);
  const [savingEditor, setSavingEditor] = useState(false);

  useEffect(() => {
    loadTemplates();
    fetchActiveTheme();
  }, []);

  const fetchActiveTheme = async () => {
    try {
      const response = await fetch('/api/themes', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (response.ok) {
        const data = await response.json();
        setActiveTheme(data.active || 'default');
      }
    } catch (err) {
      console.error('Failed to fetch active theme:', err);
    }
  };

  const loadTemplates = async () => {
    try {
      const data = await api.get('/templates?limit=100');
      const templatesList = data.data || [];
      setTemplates(templatesList);
      if (!selectedTemplate && templatesList.length > 0) {
        setSelectedTemplate(templatesList[0]);
      }
    } catch (err) {
      console.error('Failed to load templates:', err);
    } finally {
      setLoading(false);
    }
  };

  // Group and sort templates
  const groupedTemplates = templates.reduce((acc, template) => {
    const type = template.content_type || 'other';
    if (!acc[type]) acc[type] = [];
    acc[type].push(template);
    return acc;
  }, {});

  // Filter templates by search query
  const filteredTemplates = templates.filter(template => 
    template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    template.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (template.content_type || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Group filtered templates
  const filteredGroupedTemplates = filteredTemplates.reduce((acc, template) => {
    const type = template.content_type || 'other';
    if (!acc[type]) acc[type] = [];
    acc[type].push(template);
    return acc;
  }, {});

  // Sort logic: Pages first, then Products, then Blocks, then others
  const typeOrder = ['pages', 'products', 'blocks', 'widgets', 'other'];
  const sortedTypes = Object.keys(filteredGroupedTemplates).sort((a, b) => {
    const idxA = typeOrder.indexOf(a);
    const idxB = typeOrder.indexOf(b);
    return (idxA !== -1 ? idxA : 99) - (idxB !== -1 ? idxB : 99);
  });

  const handleTemplateSelect = (template) => {
    setSelectedTemplate(template);
    loadTemplateContent(template);
  };

  const toggleTypeCollapse = (type) => {
    const newCollapsed = new Set(collapsedTypes);
    if (newCollapsed.has(type)) {
      newCollapsed.delete(type);
    } else {
      newCollapsed.add(type);
    }
    setCollapsedTypes(newCollapsed);
  };

  const expandAll = () => {
    setCollapsedTypes(new Set());
  };

  const collapseAll = () => {
    setCollapsedTypes(new Set(sortedTypes));
  };

  const loadTemplateContent = async (template) => {
    try {
      setLoadingEditor(true);
      const response = await api.get(`/templates/files/${encodeURIComponent(template.filename)}`);
      setEditorContent(response.content || '');
      setOriginalContent(response.content || '');
    } catch (err) {
      console.error('Failed to load template content:', err);
      setEditorContent('');
      setOriginalContent('');
    } finally {
      setLoadingEditor(false);
    }
  };

  const saveTemplateContent = async () => {
    if (!selectedTemplate) return;
    
    try {
      setSavingEditor(true);
      await api.post(`/templates/files/${encodeURIComponent(selectedTemplate.filename)}`, {
        content: editorContent
      });
      
      setOriginalContent(editorContent);
      toast.success('Template saved successfully!');
    } catch (err) {
      console.error('Failed to save template:', err);
      toast.error('Failed to save template');
    } finally {
      setSavingEditor(false);
    }
  };

  const hasUnsavedChanges = editorContent !== originalContent;

  const handleSync = async () => {
    setSyncing(true);
    setSyncMessage('');
    try {
      const result = await api.post('/templates/sync');
      setSyncMessage(result.message);
      loadTemplates();
    } catch (err) {
      setSyncMessage('Sync failed: ' + err.message);
    } finally {
      setSyncing(false);
    }
  };

  const handleReload = async () => {
    setReloading(true);
    setSyncMessage('');
    try {
      const result = await api.post('/templates/reload');
      setSyncMessage(result.message);
    } catch (err) {
      setSyncMessage('Reload failed: ' + err.message);
    } finally {
      setReloading(false);
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
        <h1 className="text-2xl font-bold text-gray-900">Templates</h1>
        <div className="flex items-center gap-2">
          <button onClick={handleReload} disabled={reloading} id="admin-templates-reload-cache-button" className="btn btn-secondary">
            <RefreshCw className={`w-4 h-4 mr-2 ${reloading ? 'animate-spin' : ''}`} />
            {reloading ? 'Reloading...' : 'Reload Cache'}
          </button>
          <button onClick={handleSync} disabled={syncing} id="admin-templates-sync-filesystem-button" className="btn btn-primary">
            <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync from Filesystem'}
          </button>
        </div>
      </div>

      {syncMessage && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700">
          <CheckCircle className="w-5 h-5" />
          {syncMessage}
        </div>
      )}

      {/* Search Bar */}
      <div className="card p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search templates by name, filename, or type..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input pl-10 w-full"
            id="admin-templates-search-input"
          />
        </div>
        {searchQuery && (
          <p className="text-xs text-gray-500 mt-2">
            Found {filteredTemplates.length} of {templates.length} templates
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Template List */}
        <div className="lg:col-span-1">
          <div className="card overflow-hidden">
            {filteredTemplates.length === 0 ? (
              <div className="p-6 text-center text-gray-500">
                <Layers className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>{searchQuery ? 'No templates found matching your search.' : 'No templates found.'}</p>
              </div>
            ) : (
              <>
                {/* Collapse/Expand All Controls */}
                {sortedTypes.length > 1 && (
                  <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                    <span className="text-xs text-gray-500">
                      {sortedTypes.length} categories
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={expandAll}
                        className="btn btn-ghost text-xs px-2 py-1 flex items-center gap-1"
                        title="Expand all categories"
                      >
                        <Maximize2 className="w-3 h-3" />
                        Expand All
                      </button>
                      <button
                        onClick={collapseAll}
                        className="btn btn-ghost text-xs px-2 py-1 flex items-center gap-1"
                        title="Collapse all categories"
                      >
                        <Minimize2 className="w-3 h-3" />
                        Collapse All
                      </button>
                    </div>
                  </div>
                )}
                
                <div className="divide-y divide-gray-200">
                  {sortedTypes.map(type => {
                    const isCollapsed = collapsedTypes.has(type);
                    const typeTemplates = filteredGroupedTemplates[type];
                    const templateCount = typeTemplates.length;
                    
                    return (
                      <div key={type}>
                        <button
                          onClick={() => toggleTypeCollapse(type)}
                          className="w-full bg-gray-50 px-4 py-3 border-y border-gray-200 flex items-center justify-between hover:bg-gray-100 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
                              {type}
                            </h3>
                            <span className="text-xs text-gray-400">({templateCount})</span>
                          </div>
                          {isCollapsed ? (
                            <ChevronDown className="w-4 h-4 text-gray-400" />
                          ) : (
                            <ChevronUp className="w-4 h-4 text-gray-400" />
                          )}
                        </button>
                        
                        {!isCollapsed && (
                          <div className="divide-y divide-gray-100">
                            {typeTemplates.map((template) => {
                              const hasRegions = parseRegions(template.regions).length > 0;
                              const isSystemTemplate = template.filename.startsWith('system/');
                              
                              return (
                                <button
                                  id={`template-select-${template.id}`}
                                  key={template.id}
                                  onClick={() => handleTemplateSelect(template)}
                                  className={`w-full px-4 py-3 text-left flex items-center justify-between hover:bg-gray-50 transition-colors ${
                                    selectedTemplate?.id === template.id ? 'bg-primary-50 ring-1 ring-inset ring-primary-500 z-10' : ''
                                  }`}
                                >
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                      <p className={`text-sm font-medium truncate ${selectedTemplate?.id === template.id ? 'text-primary-900' : 'text-gray-900'}`}>
                                        {template.name}
                                      </p>
                                      {isSystemTemplate && (
                                        <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded font-medium">
                                          System
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-xs text-gray-500 truncate font-mono">{template.filename}</p>
                                  </div>
                                  {hasRegions && (
                                    <div className="flex-shrink-0 ml-2" title="Has editable content regions">
                                      <div className="w-2 h-2 bg-green-500 rounded-full shadow-sm shadow-green-200" />
                                    </div>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Template Details */}
        <div className="lg:col-span-2">
          {selectedTemplate ? (
            <div className="card p-6 space-y-6">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">
                    {selectedTemplate.name}
                  </h2>
                  <p className="text-gray-500 mt-1">{selectedTemplate.filename}</p>
                </div>
                <Link
                  to={`/templates/editor?file=${selectedTemplate.filename}&t=${Date.now()}`}
                  id="admin-templates-edit-code-link"
                  className="btn btn-secondary"
                >
                  <Code className="w-4 h-4 mr-2" />
                  Edit Code
                </Link>
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-medium text-gray-900">Template Editor</h3>
                  {hasUnsavedChanges && (
                    <span className="text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded">
                      Unsaved changes
                    </span>
                  )}
                </div>
                
                {loadingEditor ? (
                  <div className="flex items-center justify-center h-64">
                    <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
                  </div>
                ) : (
                  <div className="border border-gray-300 rounded-lg overflow-hidden" style={{ height: '400px' }}>
                    <CodeEditor
                      value={editorContent}
                      onChange={setEditorContent}
                      mode="nunjucks"
                      height="100%"
                    />
                  </div>
                )}
                
                <div className="mt-3 flex justify-end">
                  <button
                    onClick={saveTemplateContent}
                    disabled={!selectedTemplate || savingEditor || !hasUnsavedChanges}
                    className="btn btn-primary flex items-center gap-2"
                  >
                    <Save className="w-4 h-4" />
                    {savingEditor ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-200">
                <h3 className="font-medium text-gray-900 mb-2">Usage</h3>
                <p className="text-sm text-gray-600">
                  To define content regions in your Nunjucks template, use data attributes:
                </p>
                <pre className="mt-2 p-3 bg-gray-900 text-gray-100 rounded-lg text-sm overflow-x-auto">
{`<div data-cms-region="hero_title" 
     data-cms-type="text" 
     data-cms-label="Hero Title">
  {{ content.hero_title }}
</div>`}
                </pre>
              </div>
            </div>
          ) : (            <div className="card p-12 text-center text-gray-500">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Select a template to view its details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
