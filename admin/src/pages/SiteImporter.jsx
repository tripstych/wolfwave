import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import {
  Globe,
  Loader2,
  CheckCircle2,
  AlertCircle,
  BarChart2,
  FileCode,
  ArrowRight,
  Database,
  ExternalLink,
  ChevronRight,
  Maximize2,
  Package,
  FileText,
  X,
  RotateCcw,
  Trash2,
  Plus
} from 'lucide-react';

export default function SiteImporter() {
  const [url, setUrl] = useState('');
  const [showOptions, setShowOptions] = useState(false);
  const [config, setConfig] = useState({
    maxPages: 500,
    feedUrl: '',
    priorityPatterns: '/products/',
    excludePatterns: '/tagged/, /search, sort_by=',
    rules: []
  });

  const [presets, setPresets] = useState({});
  const AUTOSUGGEST_FIELDS = ['title', 'description', 'price', 'sku', 'compare_at_price', 'inventory_quantity'];
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSite, setSelectedSite] = useState(null);
  const [groups, setGroups] = useState([]);
  const [discoveredProducts, setDiscoveredProducts] = useState([]);
  const [discoveredPages, setDiscoveredPages] = useState([]);
  const [view, setView] = useState('templates');
  const [generatingTemplate, setGeneratingTemplate] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [selectedPages, setSelectedPages] = useState(new Set());
  const [selectedProducts, setSelectedProducts] = useState(new Set());
  const [showPicker, setShowPicker] = useState(false);
  const [pickerUrl, setPickerUrl] = useState('');
  
  const navigate = useNavigate();

  useEffect(() => {
    const handleMessage = (e) => {
      if (e.data.type === 'WEBWOLF_SELECTOR_PICKED') {
        const { field, selector } = e.data;
        setConfig(prev => {
          const newRules = [...prev.rules];
          const idx = newRules.findIndex(r => r.action === 'setField' && r.value === field);
          if (idx > -1) newRules[idx].selector = selector;
          else newRules.push({ selector, action: 'setField', value: field });
          return { ...prev, rules: newRules };
        });
      }
      if (e.data.type === 'WEBWOLF_PICKER_DONE') setShowPicker(false);
    };

    window.addEventListener('message', handleMessage);
    loadSites();
    loadTemplates();
    loadPresets();
    const interval = setInterval(refreshCrawlingSites, 3000);

    return () => {
      window.removeEventListener('message', handleMessage);
      clearInterval(interval);
    };
  }, [sites, selectedSite]);

  const openVisualPicker = (sampleUrl) => {
    if (!sampleUrl) return alert('No sample URL available');
    setPickerUrl(`${api.defaults.baseURL}/import/proxy?url=${encodeURIComponent(sampleUrl)}`);
    setShowPicker(true);
  };

  const loadPresets = async () => {
    try {
      const data = await api.get('/import/presets');
      setPresets(data || {});
    } catch (err) { console.error(err); }
  };

  const applyPreset = (key) => {
    const preset = presets[key];
    if (!preset) return;
    setConfig({
      maxPages: preset.maxPages,
      feedUrl: preset.feedUrl || '',
      priorityPatterns: preset.priorityPatterns.join(', '),
      excludePatterns: preset.excludePatterns.join(', '),
      rules: preset.rules || []
    });
  };

  const loadSites = async () => {
    try {
      const data = await api.get('/import/sites');
      setSites(data || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const loadTemplates = async () => {
    try {
      const data = await api.get('/templates');
      setTemplates(data.data || []);
    } catch (err) { console.error(err); }
  };

  const refreshCrawlingSites = async () => {
    const isCrawling = sites.some(s => s.status === 'pending' || s.status === 'crawling');
    if (isCrawling) {
      const updatedSites = await api.get('/import/sites');
      setSites(updatedSites || []);
      
      if (selectedSite && (selectedSite.status === 'pending' || selectedSite.status === 'crawling')) {
        const updated = await api.get(`/import/sites/${selectedSite.id}`);
        if (updated) {
          setSelectedSite(updated);
          if (updated.status === 'completed' || Math.abs(updated.page_count - selectedSite.page_count) >= 5) {
            refreshGroupsAndProducts(updated);
          }
        }
      }
    }
  };

  const refreshGroupsAndProducts = async (site) => {
    const groupsData = await api.get(`/import/sites/${site.id}/groups`);
    setGroups(groupsData || []);
    const allPages = site.imported_pages || [];
    const products = [];
    const pages = [];
    for (const p of allPages) {
      try {
        const meta = typeof p.metadata === 'string' ? JSON.parse(p.metadata) : p.metadata;
        if (meta && meta.type === 'product') {
          products.push(p);
        } else {
          pages.push(p);
        }
      } catch { pages.push(p); }
    }
    setDiscoveredProducts(products);
    setDiscoveredPages(pages);
  };

  const handleStartCrawl = async (e) => {
    e.preventDefault();
    if (!url) return;
    try {
      setLoading(true);
      
      // Parse patterns from strings to arrays
      // Format relative feed URLs
      let finalFeedUrl = config.feedUrl;
      if (finalFeedUrl && finalFeedUrl.startsWith('/')) {
        finalFeedUrl = new URL(finalFeedUrl, url).toString();
      }

      const formattedConfig = {
        maxPages: parseInt(config.maxPages) || 500,
        feedUrl: finalFeedUrl,
        priorityPatterns: config.priorityPatterns.split(',').map(p => p.trim()).filter(Boolean),
        excludePatterns: config.excludePatterns.split(',').map(p => p.trim()).filter(Boolean),
        rules: config.rules
      };

      await api.post('/import/crawl', { url, config: formattedConfig });
      // setUrl(''); // Removed to keep URL in field
      loadSites();
    } catch (err) { alert(err.message); }
    finally { setLoading(false); }
  };

  const handleStopCrawl = async (id) => {
    try {
      await api.post(`/import/sites/${id}/stop`);
      loadSites();
    } catch (err) { alert(err.message); }
  };

  const handleRestartCrawl = async (id) => {
    try {
      await api.post(`/import/sites/${id}/restart`);
      loadSites();
    } catch (err) { alert(err.message); }
  };

  const addRule = () => {
    setConfig({
      ...config,
      rules: [...config.rules, { selector: '', urlPattern: '', action: 'setType', value: 'product' }]
    });
  };

  const removeRule = (index) => {
    const newRules = [...config.rules];
    newRules.splice(index, 1);
    setConfig({ ...config, rules: newRules });
  };

  const updateRule = (index, field, value) => {
    const newRules = [...config.rules];
    newRules[index][field] = value;
    setConfig({ ...config, rules: newRules });
  };

  const handleDeleteSite = async (id) => {
    if (!confirm('Delete this site import and all its pages?')) return;
    try {
      await api.delete(`/import/sites/${id}`);
      if (selectedSite?.id === id) setSelectedSite(null);
      loadSites();
    } catch (err) { alert(err.message); }
  };

  const viewSiteDetails = async (site) => {
    setSelectedSite(site);
    const fullSite = await api.get(`/import/sites/${site.id}`);
    if (fullSite) {
      setSelectedSite(fullSite);
      refreshGroupsAndProducts(fullSite);
    }
    setView('templates');
  };

  const handleGenerateTemplate = async (hash) => {
    try {
      const name = prompt('Template Name:', 'Imported Template');
      if (!name) return;
      setGeneratingTemplate(true);
      await api.post(`/import/sites/${selectedSite.id}/generate-template`, { structural_hash: hash, name });
      loadTemplates();
    } catch (err) { alert(err.message); }
    finally { setGeneratingTemplate(false); }
  };

  const handleBulkMigrate = async (hash) => {
    try {
      const siteTemplates = templates.filter(t => t.filename.includes(`imported-${selectedSite.id}`));
      if (siteTemplates.length === 0) return alert('Generate a template first');
      
      setMigrating(true);
      await api.post(`/import/sites/${selectedSite.id}/bulk-migrate`, { structural_hash: hash, template_id: siteTemplates[0].id, selector_map: { main: 'main' } });
      navigate('/pages');
    } catch (err) { alert(err.message); }
    finally { setMigrating(false); }
  };

  const handleBulkMigrateAll = async () => {
    try {
      const std = templates.find(t => t.filename.includes('pages/standard'));
      if (!std) return alert('Standard template not found');
      
      setMigrating(true);
      await api.post(`/import/sites/${selectedSite.id}/bulk-migrate-all`, { template_id: std.id, selector_map: { main: 'main' } });
      navigate('/pages');
    } catch (err) { alert(err.message); }
    finally { setMigrating(false); }
  };

  const togglePageSelection = (id) => {
    const next = new Set(selectedPages);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedPages(next);
  };

  const toggleAllPages = () => {
    if (selectedPages.size === discoveredPages.length) setSelectedPages(new Set());
    else setSelectedPages(new Set(discoveredPages.map(p => p.id)));
  };

  const toggleProductSelection = (id) => {
    const next = new Set(selectedProducts);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedProducts(next);
  };

  const toggleAllProducts = () => {
    if (selectedProducts.size === discoveredProducts.length) setSelectedProducts(new Set());
    else setSelectedProducts(new Set(discoveredProducts.map(p => p.id)));
  };

  const handleBulkPageMigrate = async () => {
    if (!selectedSite) return;
    const targetIds = selectedPages.size > 0 ? Array.from(selectedPages) : discoveredPages.map(p => p.id);
    if (targetIds.length === 0) return alert('No pages selected');

    try {
      const std = templates.find(t => t.filename.includes('pages/standard'));
      if (!std) return alert('Standard template not found');
      
      if (!confirm(`Ready to migrate ${targetIds.length} pages using template "${std.name}"?`)) return;
      setMigrating(true);
      await api.post(`/import/sites/${selectedSite.id}/bulk-migrate-all`, { 
        template_id: std.id, 
        selector_map: { main: 'main' },
        page_ids: targetIds
      });
      alert('Selected pages queued for migration!');
      navigate('/pages');
    } catch (err) { alert('Failed: ' + err.message); }
    finally { setMigrating(false); }
  };

  const handleBulkProductMigrate = async () => {
    try {
      const targetIds = selectedProducts.size > 0 ? Array.from(selectedProducts) : discoveredProducts.map(p => p.id);
      if (targetIds.length === 0) return alert('No products selected');

      // Find the specific single product template
      const pt = templates.find(t => t.filename === 'products/product-single.njk' || t.filename === 'products/single.njk');
      if (!pt) return alert('Single Product template (products/product-single.njk) not found. Please create it first.');
      
      if (!confirm(`Ready to migrate ${targetIds.length} products using template "${pt.name}"?`)) return;

      setMigrating(true);
      await api.post(`/import/sites/${selectedSite.id}/bulk-migrate-products`, { 
        template_id: pt.id,
        product_ids: targetIds
      });
      navigate('/products');
    } catch (err) { alert(err.message); }
    finally { setMigrating(false); }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Site Importer</h1>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-6">
          <div className="card p-4">
            <h2 className="font-semibold mb-4">New Crawl</h2>
            <form onSubmit={handleStartCrawl} className="space-y-3">
              <input type="url" value={url} onChange={e => setUrl(e.target.value)} className="input" placeholder="https://..." required />
              
              <button 
                type="button" 
                onClick={() => setShowOptions(!showOptions)}
                className="text-xs text-primary-600 font-medium flex items-center gap-1 hover:underline"
              >
                {showOptions ? 'Hide' : 'Show'} Advanced Options
              </button>

              {showOptions && (
                <div className="p-3 bg-gray-50 rounded border space-y-3">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-gray-500 block mb-1">Load Blueprint</label>
                    <select 
                      onChange={(e) => applyPreset(e.target.value)}
                      className="input py-1 text-xs"
                      defaultValue=""
                    >
                      <option value="" disabled>Choose a platform...</option>
                      {Object.entries(presets).map(([key, p]) => (
                        <option key={key} value={key}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-gray-500 block mb-1">Max Pages</label>
                    <input 
                      type="number" 
                      value={config.maxPages} 
                      onChange={e => setConfig({...config, maxPages: e.target.value})}
                      className="input py-1 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-gray-500 block mb-1">Fast Sync: Product Feed URL (JSON/RSS)</label>
                    <input 
                      type="text" 
                      value={config.feedUrl} 
                      onChange={e => setConfig({...config, feedUrl: e.target.value})}
                      className="input py-1 text-sm"
                      placeholder="e.g. /products.json"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-gray-500 block mb-1">Prioritize (comma separated)</label>
                    <input 
                      type="text" 
                      value={config.priorityPatterns} 
                      onChange={e => setConfig({...config, priorityPatterns: e.target.value})}
                      className="input py-1 text-sm"
                      placeholder="/products/"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-gray-500 block mb-1">Exclude (comma separated)</label>
                    <input 
                      type="text" 
                      value={config.excludePatterns} 
                      onChange={e => setConfig({...config, excludePatterns: e.target.value})}
                      className="input py-1 text-sm"
                      placeholder="/tagged/, /search"
                    />
                  </div>

                  <div className="pt-2 border-t border-gray-200">
                    <label className="text-[10px] uppercase font-bold text-gray-500 block mb-2">Structural Signals / Rules</label>
                    <div className="space-y-2">
                      {config.rules.map((rule, idx) => (
                        <div key={idx} className="flex gap-1 items-start bg-white p-2 rounded border border-gray-200 shadow-sm relative">
                          <div className="flex-1 space-y-1">
                            <div className="flex gap-1">
                              <input
                                type="text"
                                value={rule.urlPattern || ''}
                                onChange={e => updateRule(idx, 'urlPattern', e.target.value)}
                                placeholder="URL Pattern (regex)"
                                className="input py-0.5 px-1 text-[10px] flex-1"
                              />
                              <input
                                type="text"
                                value={rule.selector || ''}
                                onChange={e => updateRule(idx, 'selector', e.target.value)}
                                placeholder="CSS Selector"
                                className="input py-0.5 px-1 text-[10px] flex-1"
                              />
                            </div>
                            <div className="flex gap-1">
                              <select
                                value={rule.action}
                                onChange={e => updateRule(idx, 'action', e.target.value)}
                                className="input py-0.5 px-1 text-[10px] flex-1"
                              >
                                <option value="setType">Set Type</option>
                                <option value="setField">Extract text to Field</option>
                                <option value="setConst">Set Const (field:val)</option>
                              </select>
                              <input
                                type="text"
                                value={rule.value}
                                onChange={e => updateRule(idx, 'value', e.target.value)}
                                placeholder="Value"
                                className="input py-0.5 px-1 text-[10px] flex-1"
                                list={rule.action === 'setField' ? 'field-suggestions' : undefined}
                              />
                            </div>
                          </div>
                          <button onClick={() => removeRule(idx)} className="text-red-400 hover:text-red-600">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                      <datalist id="field-suggestions">
                        {AUTOSUGGEST_FIELDS.map(f => <option key={f} value={f} />)}
                      </datalist>
                      <button 
                        type="button" 
                        onClick={addRule}
                        className="btn btn-ghost btn-sm w-full py-1 text-[10px] h-auto border-dashed border-gray-300"
                      >
                        <Plus className="w-3 h-3 mr-1" /> Add Signal Rule
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <button type="submit" className="btn btn-primary w-full" disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <BarChart2 className="w-4 h-4 mr-2" />} Analyze
              </button>
            </form>
          </div>
          <div className="card overflow-hidden">
            <div className="p-4 bg-gray-50 border-b font-bold text-xs uppercase text-gray-500">History</div>
            <div className="divide-y max-h-[500px] overflow-y-auto">
              {sites.map(site => (
                <div key={site.id} className={`w-full hover:bg-gray-50 flex items-center justify-between pr-4 ${selectedSite?.id === site.id ? 'bg-primary-50 border-l-4 border-primary-600' : ''}`}>
                  <button onClick={() => viewSiteDetails(site)} className="flex-1 p-4 text-left">
                    <p className="font-medium truncate">{new URL(site.root_url).hostname}</p>
                    <p className="text-xs text-gray-500 flex items-center gap-1">
                      {site.status === 'completed' && <CheckCircle2 className="w-3 h-3 text-green-500" />}
                      {(site.status === 'crawling' || site.status === 'pending') && <Loader2 className="w-3 h-3 text-blue-500 animate-spin" />}
                      {site.status === 'failed' && <AlertCircle className="w-3 h-3 text-red-500" />}
                      {site.status === 'cancelled' && <X className="w-3 h-3 text-gray-400" />}
                      {site.page_count} pages
                    </p>
                  </button>
                  <div className="flex gap-1">
                    {(site.status === 'crawling' || site.status === 'pending') ? (
                      <button onClick={() => handleStopCrawl(site.id)} className="p-1 text-red-500 hover:bg-red-50 rounded" title="Stop">
                        <X className="w-4 h-4" />
                      </button>
                    ) : (
                      <button onClick={() => handleRestartCrawl(site.id)} className="p-1 text-gray-500 hover:bg-gray-100 rounded" title="Restart">
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    )}
                    <button onClick={() => handleDeleteSite(site.id)} className="p-1 text-red-400 hover:bg-red-50 rounded" title="Delete">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="lg:col-span-2">
          {!selectedSite ? (
            <div className="card h-full flex flex-col items-center justify-center p-12 text-gray-400 border-dashed border-2">
              <Database className="w-12 h-12 mb-4 opacity-20" /> <p>Select a site to analyze.</p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center justify-between bg-white p-4 rounded-lg border shadow-sm">
                <h2 className="font-bold text-lg">{new URL(selectedSite.root_url).hostname}</h2>
                <div className="flex items-center gap-2">
                  <button onClick={handleBulkMigrateAll} className="btn btn-secondary btn-sm">Migrate All</button>
                  <div className="flex bg-gray-100 p-1 rounded-lg">
                    <button onClick={() => setView('templates')} className={`px-3 py-1.5 text-sm rounded-md ${view === 'templates' ? 'bg-white shadow-sm' : 'text-gray-500'}`}>Templates</button>
                    <button onClick={() => setView('pages')} className={`px-3 py-1.5 text-sm rounded-md ${view === 'pages' ? 'bg-white shadow-sm' : 'text-gray-500'}`}>Pages ({discoveredPages.length})</button>
                    <button onClick={() => setView('products')} className={`px-3 py-1.5 text-sm rounded-md ${view === 'products' ? 'bg-white shadow-sm' : 'text-gray-500'}`}>Products ({discoveredProducts.length})</button>
                  </div>
                </div>
              </div>
              {view === 'templates' && (
                <div className="grid grid-cols-1 gap-4">
                  {groups.map((g, i) => (
                    <div key={i} className="card p-4">
                      <div className="flex justify-between mb-4">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="px-2 py-0.5 bg-gray-100 text-xs font-mono">{g.structural_hash.substring(0,8)}</span>
                            <span className="text-xs font-medium text-primary-600 bg-primary-50 px-2 py-0.5 rounded-full">{g.count} pages</span>
                          </div>
                          <h3 className="font-bold">{g.sample_title}</h3>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => openVisualPicker(g.sample_url)} className="btn btn-ghost btn-sm text-amber-600"><Maximize2 className="w-4 h-4 mr-1" /> Visual Picker</button>
                          <button onClick={() => handleGenerateTemplate(g.structural_hash)} className="btn btn-ghost btn-sm text-primary-600"><FileCode className="w-4 h-4 mr-1" /> Generate</button>
                        </div>
                      </div>
                      <button onClick={() => handleBulkMigrate(g.structural_hash)} className="btn btn-primary btn-sm w-full">Migrate Group</button>
                    </div>
                  ))}
                </div>
              )}
              {view === 'pages' && (
                <div className="card overflow-hidden">
                  <div className="p-4 border-b flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <input 
                        type="checkbox" 
                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-600"
                        checked={selectedPages.size > 0 && selectedPages.size === discoveredPages.length}
                        onChange={toggleAllPages}
                      />
                      <h3 className="font-bold text-gray-700">Discovered Pages ({discoveredPages.length})</h3>
                    </div>
                    <button onClick={handleBulkPageMigrate} disabled={migrating || discoveredPages.length === 0} className="btn btn-primary btn-sm">
                      {migrating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />} 
                      {selectedPages.size > 0 ? `Migrate ${selectedPages.size} Selected` : 'Migrate All'}
                    </button>
                  </div>
                  {discoveredPages.length === 0 ? (
                    <div className="p-8 text-center text-gray-400 text-sm">No pages discovered yet. Pages will appear here once the crawl finds non-product URLs.</div>
                  ) : (
                    <table className="w-full text-sm">
                      <tbody className="divide-y">
                        {discoveredPages.map((p, i) => {
                          const path = (() => { try { return new URL(p.url).pathname; } catch { return p.url; } })();
                          return (
                            <tr key={i} className={p.status === 'migrated' ? 'opacity-50' : ''}>
                              <td className="px-4 py-3 w-10">
                                <input 
                                  type="checkbox" 
                                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-600"
                                  checked={selectedPages.has(p.id)}
                                  onChange={() => togglePageSelection(p.id)}
                                />
                              </td>
                              <td className="px-4 py-3">
                                <div className="font-medium">{p.title || 'Untitled'}</div>
                                <div className="text-xs text-gray-400">{path}</div>
                              </td>
                              <td className="px-4 py-3 text-right">
                                {p.status === 'migrated' ? (
                                  <span className="text-xs text-green-600 font-medium">Migrated</span>
                                ) : (
                                  <span className="text-xs text-gray-400">{p.status}</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
              {view === 'products' && (
                <div className="card overflow-hidden">
                  <div className="p-4 border-b flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <input 
                        type="checkbox" 
                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-600"
                        checked={selectedProducts.size > 0 && selectedProducts.size === discoveredProducts.length}
                        onChange={toggleAllProducts}
                      />
                      <h3 className="font-bold text-gray-700">Discovered Products ({discoveredProducts.length})</h3>
                    </div>
                    <button onClick={handleBulkProductMigrate} disabled={migrating || discoveredProducts.length === 0} className="btn btn-primary btn-sm">
                      {migrating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Package className="w-4 h-4 mr-2" />} 
                      {selectedProducts.size > 0 ? `Migrate ${selectedProducts.size} Selected` : 'Migrate All'}
                    </button>
                  </div>
                  <table className="w-full text-sm">
                    <tbody className="divide-y">
                      {discoveredProducts.map((p, i) => (
                        <tr key={i}>
                          <td className="px-4 py-3 w-10">
                            <input 
                              type="checkbox" 
                              className="rounded border-gray-300 text-primary-600 focus:ring-primary-600"
                              checked={selectedProducts.has(p.id)}
                              onChange={() => toggleProductSelection(p.id)}
                            />
                          </td>
                          <td className="px-4 py-3">{p.title}</td>
                          <td className="px-4 py-3 text-right font-bold text-green-600">${(typeof p.metadata === 'string' ? JSON.parse(p.metadata) : p.metadata)?.price || '0.00'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showPicker && (
        <div className="fixed inset-0 z-[100] bg-black bg-opacity-75 flex flex-col">
          <div className="bg-white p-4 flex justify-between items-center">
            <h2 className="font-bold">Visual Selector Picker</h2>
            <button onClick={() => setShowPicker(false)} className="btn btn-ghost"><X className="w-5 h-5" /></button>
          </div>
          <div className="flex-1 bg-white">
            <iframe 
              src={pickerUrl} 
              className="w-full h-full border-none"
              title="Visual Picker"
            />
          </div>
        </div>
      )}
    </div>
  );
}
