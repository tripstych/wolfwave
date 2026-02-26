import { useState, useEffect, useCallback } from 'react';
import api, { parseRegions } from '../lib/api';
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
  ChevronDown,
  Maximize2,
  FileText,
  X,
  RotateCcw,
  Trash2,
  Plus,
  Sparkles,
  Search,
  List,
  Layers,
  Link2
} from 'lucide-react';

const AUTOSUGGEST_FIELDS = ['title', 'description', 'price', 'sku', 'compare_at_price', 'inventory_quantity'];

// ── Crawl Signal Rule Editor (used in Advanced Options) ──
function SignalRuleItem({ rule, onChange, onRemove, depth = 0 }) {
  const updateRule = (field, value) => onChange({ ...rule, [field]: value });

  const addAction = () => {
    const actions = [...(rule.actions || [])];
    actions.push({ action: 'setField', value: '' });
    updateRule('actions', actions);
  };

  const updateAction = (idx, field, value) => {
    const actions = [...(rule.actions || [])];
    actions[idx] = { ...actions[idx], [field]: value };
    updateRule('actions', actions);
  };

  const removeAction = (idx) => updateRule('actions', (rule.actions || []).filter((_, i) => i !== idx));

  const addChild = () => {
    const children = [...(rule.children || [])];
    children.push({ selector: '', action: 'setField', value: '' });
    updateRule('children', children);
  };

  const updateChild = (idx, newChild) => {
    const children = [...(rule.children || [])];
    children[idx] = newChild;
    updateRule('children', children);
  };

  const removeChild = (idx) => updateRule('children', (rule.children || []).filter((_, i) => i !== idx));

  return (
    <div className={`p-3 bg-white rounded border border-gray-200 shadow-sm relative ${depth > 0 ? 'ml-6 mt-2 border-l-4 border-l-primary-200' : ''}`}>
      <button onClick={onRemove} className="absolute top-2 right-2 text-gray-300 hover:text-red-500"><X className="w-3.5 h-3.5" /></button>
      <div className="grid grid-cols-2 gap-2 mb-2 pr-6">
        <div>
          <label className="text-[8px] uppercase font-bold text-gray-400 block">URL Pattern (Regex)</label>
          <input type="text" value={rule.urlPattern || ''} onChange={e => updateRule('urlPattern', e.target.value)} placeholder="e.g. ^/products/" className="input py-1 px-2 text-[10px] w-full" />
        </div>
        <div>
          <label className="text-[8px] uppercase font-bold text-gray-400 block">CSS Selector</label>
          <input type="text" value={rule.selector || ''} onChange={e => updateRule('selector', e.target.value)} placeholder="e.g. .product-view" className="input py-1 px-2 text-[10px] w-full" />
        </div>
      </div>
      {!rule.actions && (
        <div className="grid grid-cols-2 gap-2 mb-2">
          <select value={rule.action || 'setType'} onChange={e => updateRule('action', e.target.value)} className="input py-1 px-2 text-[10px]">
            <option value="setType">Set Type</option><option value="setField">Set Field</option><option value="setConst">Set Const</option>
          </select>
          <input type="text" value={rule.value || ''} onChange={e => updateRule('value', e.target.value)} placeholder="Value" className="input py-1 px-2 text-[10px]" list="field-suggestions" />
        </div>
      )}
      <div className="space-y-1.5 mb-2">
        {(rule.actions || []).map((act, idx) => (
          <div key={idx} className="flex gap-1 items-center bg-gray-50 p-1 rounded">
            <select value={act.action} onChange={e => updateAction(idx, 'action', e.target.value)} className="input py-0.5 px-1 text-[9px] w-24">
              <option value="setType">Set Type</option><option value="setField">Set Field</option><option value="setConst">Set Const</option>
            </select>
            <input type="text" value={act.value} onChange={e => updateAction(idx, 'value', e.target.value)} className="input py-0.5 px-1 text-[9px] flex-1" placeholder="Value" list="field-suggestions" />
            <button onClick={() => removeAction(idx)} className="text-gray-400 hover:text-red-500"><X className="w-3 h-3" /></button>
          </div>
        ))}
        <button type="button" onClick={addAction} className="text-[9px] text-primary-600 hover:underline flex items-center gap-1"><Plus className="w-3 h-3" /> Add Action</button>
      </div>
      {rule.children && rule.children.length > 0 && (
        <div className="space-y-2 border-t pt-2 mt-2">
          <label className="text-[8px] uppercase font-bold text-gray-400 block">Child Rules</label>
          {rule.children.map((child, idx) => (
            <SignalRuleItem key={idx} rule={child} depth={depth + 1} onChange={newChild => updateChild(idx, newChild)} onRemove={() => removeChild(idx)} />
          ))}
        </div>
      )}
      <button type="button" onClick={addChild} className="text-[9px] text-gray-500 hover:text-primary-600 hover:underline flex items-center gap-1 mt-2"><Plus className="w-3 h-3" /> Add Child Rule</button>
    </div>
  );
}

// ── Main Component ──
export default function SiteImporter() {
  // Crawl form state
  const [url, setUrl] = useState('');
  const [showOptions, setShowOptions] = useState(false);
  const [config, setConfig] = useState({ maxPages: 500, feedUrl: '', priorityPatterns: '/products/', excludePatterns: '/tagged/, /search, sort_by=', blacklistRegex: [], rules: [], autoDetect: true, hashOptions: {} });

  // Data
  const [systemRoutes, setSystemRoutes] = useState([]);
  const [presets, setPresets] = useState({});
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSite, setSelectedSite] = useState(null);
  const [groups, setGroups] = useState([]);
  const [allItems, setAllItems] = useState([]);
  const [templates, setTemplates] = useState([]);

  // View state
  const [view, setView] = useState('overview'); // overview | items
  const [itemFilter, setItemFilter] = useState('all'); // all | page | product
  const [itemSearch, setItemSearch] = useState('');
  const [expandedGroup, setExpandedGroup] = useState(null);
  const [useAI, setUseAI] = useState(false);

  // Selection
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState(null);

  // Migration
  const [migrating, setMigrating] = useState(false);
  const [generatingTemplate, setGeneratingTemplate] = useState(false);
  const [generatingMenus, setGeneratingMenus] = useState(false);

  // AI Analysis
  const [analyzingGroup, setAnalyzingGroup] = useState(null); // structural_hash being analyzed
  const [groupAnalysis, setGroupAnalysis] = useState({}); // { [hash]: analysis }
  const [analyzingSite, setAnalyzingSite] = useState(false);
  const [siteAnalysis, setSiteAnalysis] = useState(null);

  // Visual Picker
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [selectorMap, setSelectorMap] = useState({});
  const [showPicker, setShowPicker] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [previews, setPreviews] = useState({});
  const [pickerUrl, setPickerUrl] = useState('');
  const [editingMapping, setEditingMapping] = useState(null);
  const [editingMappingName, setEditingMappingName] = useState('');


  // ── Derived data ──
  const mappings = selectedSite?.config?.migration_rules || [];

  const filteredItems = allItems.filter(p => {
    if (itemFilter === 'page' && p.item_type === 'product') return false;
    if (itemFilter === 'product' && p.item_type !== 'product') return false;
    if (itemSearch) {
      const term = itemSearch.toLowerCase();
      return p.title?.toLowerCase().includes(term) || p.url.toLowerCase().includes(term);
    }
    return true;
  });

  const pageCount = allItems.filter(p => p.item_type !== 'product').length;
  const productCount = allItems.filter(p => p.item_type === 'product').length;

  // Find the mapping linked to a given structural hash
  const getMappingForHash = (hash) => mappings.find(m => m.structural_hash === hash);

  // ── Load ──
  useEffect(() => { loadSites(); loadTemplates(); loadPresets(); loadSystemRoutes(); }, []);

  const loadSystemRoutes = async () => { try { setSystemRoutes(await api.get('/settings/system-routes') || []); } catch {} };
  const loadPresets = async () => { try { setPresets(await api.get('/import/presets') || {}); } catch {} };
  const loadSites = async () => { try { setSites(await api.get('/import/sites') || []); } catch {} finally { setLoading(false); } };
  const loadTemplates = async () => {
    try {
      const data = await api.get('/templates');
      setTemplates((data.data || []).map(t => ({ ...t, regionCount: parseRegions(t.regions).length })));
    } catch {}
  };

  // ── Message Listener (Visual Picker) ──
  useEffect(() => {
    const handleMessage = (e) => {
      if (e.data.type === 'WOLFWAVE_SELECTOR_PICKED') {
        const { field, selector } = e.data;
        setSelectorMap(prev => ({ ...prev, [field]: selector }));
        if (AUTOSUGGEST_FIELDS.includes(field)) {
          setConfig(prev => {
            const newRules = [...prev.rules];
            const idx = newRules.findIndex(r => r.action === 'setField' && r.value === field);
            if (idx > -1) newRules[idx].selector = selector;
            else newRules.push({ selector, action: 'setField', value: field });
            return { ...prev, rules: newRules };
          });
        }
      }
      if (e.data.type === 'WOLFWAVE_SELECTOR_REMOVED') {
        setSelectorMap(prev => { const n = { ...prev }; delete n[e.data.field]; return n; });
      }
      if (e.data.type === 'WOLFWAVE_PICKER_DONE') {
        setShowPicker(false);
        if (editingMapping) handleSaveMapping();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [editingMapping, selectorMap, selectedTemplateId]);

  // ── Polling ──
  const refreshGroupsAndItems = useCallback(async (site) => {
    const groupsData = await api.get(`/import/sites/${site.id}/groups`);
    setGroups(groupsData || []);
    setAllItems(site.staged_items || []);
  }, []);

  const refreshCrawlingSites = useCallback(async () => {
    try {
      const now = Date.now();
      const updatedSites = await api.get(`/import/sites?_t=${now}`);
      if (updatedSites) setSites(updatedSites);
      if (selectedSite && (selectedSite.status === 'pending' || selectedSite.status === 'crawling')) {
        const updated = await api.get(`/import/sites/${selectedSite.id}?_t=${now}`);
        if (updated) {
          setSelectedSite(updated);
          if (updated.status === 'completed' || updated.page_count !== (selectedSite.page_count || 0)) {
            refreshGroupsAndItems(updated);
          }
        }
      }
    } catch {}
  }, [selectedSite, refreshGroupsAndItems]);

  useEffect(() => {
    const interval = setInterval(refreshCrawlingSites, 2000);
    return () => clearInterval(interval);
  }, [refreshCrawlingSites]);

  // ── Live Preview (Visual Picker) ──
  useEffect(() => {
    if (!showPicker || Object.keys(selectorMap).length === 0) { setPreviews({}); return; }
    const timer = setTimeout(async () => {
      try {
        const tpl = templates.find(t => t.id === parseInt(selectedTemplateId));
        const regions = tpl ? (typeof tpl.regions === 'string' ? JSON.parse(tpl.regions) : tpl.regions) : [];
        const field_types = Object.fromEntries(regions.map(r => [r.name, r.type]));
        const res = await api.post('/import/extract', { 
          url: decodeURIComponent(pickerUrl.replace('/api/import/proxy?url=', '')), 
          selector_map: selectorMap, 
          field_types 
        });
        if (res.success) setPreviews(res.data || {});
      } catch {}
    }, 500);
    return () => clearTimeout(timer);
  }, [selectorMap, showPicker, pickerUrl]);

  useEffect(() => {
    if (showPicker && selectedTemplateId) handlePickerLoad();
  }, [selectedTemplateId, selectorMap]);

  // ── Actions ──

  const viewSiteDetails = async (site) => {
    setSelectedSite(site);
    setSelectedItems(new Set());
    const fullSite = await api.get(`/import/sites/${site.id}`);
    if (fullSite) { setSelectedSite(fullSite); refreshGroupsAndItems(fullSite); }
    setView('overview');
  };

  const handleStartCrawl = async (e) => {
    e.preventDefault();
    if (!url) return;
    let targetUrl = url.trim();
    if (!/^https?:\/\//i.test(targetUrl)) { targetUrl = 'https://' + targetUrl; setUrl(targetUrl); }
    try {
      setLoading(true);
      let finalFeedUrl = config.feedUrl;
      if (finalFeedUrl && finalFeedUrl.startsWith('/')) finalFeedUrl = new URL(finalFeedUrl, targetUrl).toString();
      const hashOpts = config.hashOptions || {};
      const cleanHashOptions = Object.fromEntries(Object.entries(hashOpts).filter(([, v]) => v !== undefined && v !== false && !(Array.isArray(v) && v.length === 0)));
      await api.post('/import/crawl', { url: targetUrl, config: { maxPages: parseInt(config.maxPages) || 500, feedUrl: finalFeedUrl, priorityPatterns: config.priorityPatterns.split(',').map(p => p.trim()).filter(Boolean), excludePatterns: config.excludePatterns.split(',').map(p => p.trim()).filter(Boolean), blacklistRegex: config.blacklistRegex || [], rules: config.rules, autoDetect: config.autoDetect, ...(Object.keys(cleanHashOptions).length > 0 ? { hashOptions: cleanHashOptions } : {}) } });
      loadSites();
    } catch (err) { alert(err.message); }
    finally { setLoading(false); }
  };

  const handleStopCrawl = async (id) => { try { await api.post(`/import/sites/${id}/stop`); loadSites(); } catch (err) { alert(err.message); } };
  const handleRestartCrawl = async (id) => { try { await api.post(`/import/sites/${id}/restart`); loadSites(); } catch (err) { alert(err.message); } };
  const handleDeleteSite = async (id) => {
    if (!confirm('Delete this site import and all its pages?')) return;
    try { await api.delete(`/import/sites/${id}`); if (selectedSite?.id === id) setSelectedSite(null); loadSites(); } catch (err) { alert(err.message); }
  };

  const handleGenerateMenus = async () => {
    if (!selectedSite || !confirm('This will use AI to analyze the homepage and create menus. Continue?')) return;
    try { setGeneratingMenus(true); const res = await api.post(`/import/sites/${selectedSite.id}/generate-menus`); if (res.success) alert(`Generated ${res.menus.length} menus!`); }
    catch (err) { alert('Failed: ' + err.message); }
    finally { setGeneratingMenus(false); }
  };

  const applyPreset = (key) => {
    const preset = presets[key];
    if (!preset) return;
    setConfig({ maxPages: preset.maxPages, feedUrl: preset.feedUrl || '', priorityPatterns: preset.priorityPatterns.join(', '), excludePatterns: preset.excludePatterns.join(', '), rules: preset.rules || [] });
  };

  // ── Mapping CRUD ──

  const handleSaveMapping = async () => {
    if (!selectedSite || !selectedTemplateId) return;
    const tpl = templates.find(t => t.id === parseInt(selectedTemplateId));
    try {
      await api.post(`/import/sites/${selectedSite.id}/rules`, {
        id: editingMapping?.id,
        name: editingMappingName || 'New Mapping',
        template_id: parseInt(selectedTemplateId),
        content_type: tpl?.content_type || 'pages',
        structural_hash: editingMapping?.structural_hash || null,
        selector_map: selectorMap
      });
      setEditingMapping(null);
      setEditingMappingName('');
      const updated = await api.get(`/import/sites/${selectedSite.id}`);
      setSelectedSite(updated);
    } catch (err) { alert('Failed to save: ' + err.message); }
  };

  const deleteMapping = async (ruleId) => {
    if (!confirm('Delete this mapping?')) return;
    try {
      await api.delete(`/import/sites/${selectedSite.id}/rules/${ruleId}`);
      const updated = await api.get(`/import/sites/${selectedSite.id}`);
      setSelectedSite(updated);
    } catch (err) { alert(err.message); }
  };

  const handleGenerateTemplate = async (hash) => {
    const name = prompt('Name for this template:', `Imported ${hash.substring(0,8)}`);
    if (!name) return;
    try {
      setGeneratingTemplate(true);
      const res = await api.post(`/import/sites/${selectedSite.id}/generate-template`, { structural_hash: hash, name });
      if (res.template) {
        await api.post(`/import/sites/${selectedSite.id}/rules`, { name: `${name}`, template_id: res.template.id, structural_hash: hash, selector_map: { main: 'main' } });
        loadTemplates();
        const updated = await api.get(`/import/sites/${selectedSite.id}`);
        setSelectedSite(updated);
      }
    } catch (err) { alert(err.message); }
    finally { setGeneratingTemplate(false); }
  };

  // ── AI Analysis ──

  const analyzeGroup = async (hash) => {
    if (!selectedSite) return;
    try {
      setAnalyzingGroup(hash);
      const res = await api.post(`/import/sites/${selectedSite.id}/analyze-group`, { structural_hash: hash });
      if (res.success && res.analysis) {
        setGroupAnalysis(prev => ({ ...prev, [hash]: res.analysis }));
      }
    } catch (err) { alert('Analysis failed: ' + err.message); }
    finally { setAnalyzingGroup(null); }
  };

  const analyzeSite = async () => {
    if (!selectedSite) return;
    try {
      setAnalyzingSite(true);
      const res = await api.post(`/import/sites/${selectedSite.id}/analyze-site`);
      if (res.success && res.analysis) setSiteAnalysis(res.analysis);
    } catch (err) { alert('Site analysis failed: ' + err.message); }
    finally { setAnalyzingSite(false); }
  };

  // ── Visual Picker ──

  const openVisualPicker = (sampleUrl, opts = {}) => {
    if (!sampleUrl) return alert('No sample URL available');
    setPickerUrl(`/api/import/proxy?url=${encodeURIComponent(sampleUrl)}`);
    setShowPicker(true);
    setSelectorMap({});
    setEditingMapping(opts.mapping || { id: Date.now().toString(), structural_hash: opts.hash || null });
    setEditingMappingName(opts.name || '');
    setSelectedTemplateId(opts.templateId ? String(opts.templateId) : '');
  };

  const handlePickerLoad = () => {
    if (!selectedTemplateId) return;
    const tpl = templates.find(t => t.id === parseInt(selectedTemplateId));
    if (!tpl || !tpl.regions) return;
    const regions = typeof tpl.regions === 'string' ? JSON.parse(tpl.regions) : tpl.regions;
    const isProduct = tpl.content_type === 'products';
    const systemFields = isProduct
      ? [{ id: 'title', label: 'Set as Title' }, { id: 'price', label: 'Set as Price' }, { id: 'sku', label: 'Set as SKU' }, { id: 'images', label: 'Set as Gallery Images' }, { id: 'videos', label: 'Set as Gallery Videos' }]
      : [{ id: 'title', label: 'Set as Title' }];
    const fields = [...systemFields, ...regions.map(r => ({ id: r.name, label: `Set as ${r.label || r.name}` }))];
    const iframe = document.getElementById('wolfwave-picker-iframe');
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage({ type: 'WOLFWAVE_SET_FIELDS', fields }, '*');
      iframe.contentWindow.postMessage({ type: 'WOLFWAVE_SET_MAPPED_FIELDS', fields: Object.keys(selectorMap) }, '*');
    }
  };

  const suggestMappings = async () => {
    if (!selectedTemplateId) return alert('Select a template first');
    const tpl = templates.find(t => t.id === parseInt(selectedTemplateId));
    if (!tpl) return;
    setSuggesting(true);
    try {
      const regions = typeof tpl.regions === 'string' ? JSON.parse(tpl.regions) : tpl.regions;
      const res = await api.post('/ai/suggest-selectors', { 
        url: decodeURIComponent(pickerUrl.replace('/api/import/proxy?url=', '')), 
        fields: regions 
      });
      if (res.suggestions) setSelectorMap(res.suggestions);
      else alert('AI could not find confident matches.');
    } catch (err) { alert('AI suggestion failed: ' + err.message); }
    finally { setSuggesting(false); }
  };

  // ── Migration ──

  const migrateWithMapping = async (mapping, itemIds) => {
    if (!itemIds || itemIds.length === 0) return alert('No items selected');
    if (!confirm(`Migrate ${itemIds.length} items using "${mapping.name}"${useAI ? ' with AI Smart Mapping' : ''}?`)) return;
    try {
      setMigrating(true);
      const res = await api.post(`/import/sites/${selectedSite.id}/migrate-with-rule`, { rule_id: mapping.id, page_ids: itemIds, useAI });
      const ok = (res.results || []).filter(r => r.success).length;
      const fail = (res.results || []).filter(r => !r.success).length;
      alert(`Done! ${ok} succeeded, ${fail} failed.`);
      if (ok > 0) {
        const updated = await api.get(`/import/sites/${selectedSite.id}`);
        if (updated) { setSelectedSite(updated); refreshGroupsAndItems(updated); }
      }
    } catch (err) { alert(err.message); }
    finally { setMigrating(false); }
  };

  const migrateGroup = async (hash, mapping) => {
    const groupItems = allItems.filter(p => p.structural_hash === hash && p.status !== 'migrated');
    migrateWithMapping(mapping, groupItems.map(p => p.id));
  };

  const migrateSelectedItems = async () => {
    if (selectedItems.size === 0) return alert('Select items first');
    // Determine what type they are
    const items = allItems.filter(p => selectedItems.has(p.id));
    const isProducts = items.every(p => p.item_type === 'product');

    if (isProducts) {
      const pt = templates.find(t => t.filename === 'products/product-single.njk' || t.filename === 'products/single.njk');
      if (!pt) return alert('Single Product template not found. Create one first.');
      if (!confirm(`Migrate ${items.length} products${useAI ? ' with AI Smart Mapping' : ''}?`)) return;
      try {
        setMigrating(true);
        await api.post(`/import/sites/${selectedSite.id}/bulk-migrate-products`, { template_id: pt.id, product_ids: Array.from(selectedItems), useAI });
        const updated = await api.get(`/import/sites/${selectedSite.id}`);
        if (updated) { setSelectedSite(updated); refreshGroupsAndItems(updated); }
      } catch (err) { alert(err.message); }
      finally { setMigrating(false); }
    } else {
      // Pages — find a mapping or use quick migrate
      const targetTemplateId = selectedTemplateId || templates.find(t => t.filename?.includes('pages/standard'))?.id;
      if (!targetTemplateId) return alert('Select a template first');
      if (!confirm(`Migrate ${items.length} pages${useAI ? ' with AI Smart Mapping' : ''}?`)) return;
      try {
        setMigrating(true);
        await api.post(`/import/sites/${selectedSite.id}/bulk-migrate-all`, { template_id: parseInt(targetTemplateId), selector_map: { main: 'main' }, page_ids: Array.from(selectedItems), useAI });
        const updated = await api.get(`/import/sites/${selectedSite.id}`);
        if (updated) { setSelectedSite(updated); refreshGroupsAndItems(updated); }
      } catch (err) { alert(err.message); }
      finally { setMigrating(false); }
    }
  };

  // ── Selection helpers ──

  const toggleItem = (e, id, index, list) => {
    const next = new Set(selectedItems);
    if (e.shiftKey && lastSelectedIndex !== null) {
      const start = Math.min(lastSelectedIndex, index);
      const end = Math.max(lastSelectedIndex, index);
      const isSelecting = next.has(list[lastSelectedIndex]?.id);
      for (let i = start; i <= end; i++) { if (isSelecting) next.add(list[i].id); else next.delete(list[i].id); }
    } else {
      if (next.has(id)) next.delete(id); else next.add(id);
    }
    setSelectedItems(next);
    setLastSelectedIndex(index);
  };

  const selectGroupItems = (hash) => {
    const ids = allItems.filter(p => p.structural_hash === hash).map(p => p.id);
    setSelectedItems(new Set(ids));
    setView('items');
  };

  const toggleAllFiltered = () => {
    if (selectedItems.size === filteredItems.length) setSelectedItems(new Set());
    else setSelectedItems(new Set(filteredItems.map(p => p.id)));
  };

  // ── Crawl config helpers ──
  const addSignalRule = () => setConfig({ ...config, rules: [...config.rules, { selector: '', urlPattern: '', actions: [{ action: 'setType', value: 'product' }], children: [] }] });
  const removeSignalRule = (i) => { const r = [...config.rules]; r.splice(i, 1); setConfig({ ...config, rules: r }); };
  const updateSignalRule = (i, r) => { const rules = [...config.rules]; rules[i] = r; setConfig({ ...config, rules }); };

  // ── Render ──
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Manual Import</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── LEFT PANEL: Crawl + History ── */}
        <div className="space-y-6">
          <div className="card p-4">
            <h2 className="font-semibold mb-4">New Crawl</h2>
            <form onSubmit={handleStartCrawl} className="space-y-3" id="admin-site-importer-start-import-form">
              <input id="admin-site-importer-url-input" type="text" value={url} onChange={e => setUrl(e.target.value)} onBlur={e => { let v = e.target.value.trim(); if (v && !/^https?:\/\//i.test(v)) setUrl('https://' + v); }} className="input" placeholder="https://..." required />

              <div className="flex items-center justify-between">
                <button type="button" onClick={() => setShowOptions(!showOptions)} className="text-xs text-primary-600 font-medium flex items-center gap-1 hover:underline">
                  {showOptions ? 'Hide' : 'Show'} Advanced Options
                </button>
                <label className="flex items-center gap-2 text-xs font-medium text-gray-600 cursor-pointer">
                  <input id="admin-site-importer-auto-detect-checkbox" type="checkbox" checked={config.autoDetect} onChange={e => setConfig({...config, autoDetect: e.target.checked})} className="rounded border-gray-300 text-primary-600 focus:ring-primary-600" />
                  Auto-detect Blueprint
                </label>
              </div>

              {showOptions && (
                <div className="p-3 bg-gray-50 rounded border space-y-3">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-gray-500 block mb-1">Load Blueprint</label>
                    <select onChange={(e) => applyPreset(e.target.value)} id="admin-site-importer-preset-select" className="input py-1 text-xs" defaultValue="">
                      <option value="" disabled>Choose a platform...</option>
                      {Object.entries(presets).map(([key, p]) => (<option key={key} value={key}>{p.name}</option>))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-gray-500 block mb-1">Max Pages</label>
                    <input type="number" value={config.maxPages} onChange={e => setConfig({...config, maxPages: e.target.value})} id="admin-site-importer-max-pages-input" className="input py-1 text-sm" />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-gray-500 block mb-1">Fast Sync: Product Feed URL (JSON/RSS)</label>
                    <input type="text" value={config.feedUrl} onChange={e => setConfig({...config, feedUrl: e.target.value})} id="admin-site-importer-feed-url-input" className="input py-1 text-sm" placeholder="e.g. /products.json" />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-gray-500 block mb-1">Prioritize (comma separated)</label>
                    <input type="text" value={config.priorityPatterns} onChange={e => setConfig({...config, priorityPatterns: e.target.value})} id="admin-site-importer-priority-patterns-input" className="input py-1 text-sm" placeholder="/products/" />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-gray-500 block mb-1">Exclude (comma separated)</label>
                    <input type="text" value={config.excludePatterns} onChange={e => setConfig({...config, excludePatterns: e.target.value})} id="admin-site-importer-exclude-patterns-input" className="input py-1 text-sm" placeholder={systemRoutes.length > 0 ? systemRoutes.map(r => r.url).slice(0, 5).join(', ') + '...' : '/tagged/, /search'} />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-gray-500 block mb-1">Blacklist Regex (one per line)</label>
                    <textarea 
                      value={(config.blacklistRegex || []).join('\n')} 
                      onChange={e => setConfig({...config, blacklistRegex: e.target.value.split('\n').map(s => s.trim()).filter(Boolean)})} 
                      id="admin-site-importer-blacklist-regex-input" 
                      className="input py-1 text-sm font-mono" 
                      rows="3"
                      placeholder="e.g.&#10;/account/.*&#10;/cart.*&#10;\\?page=\\d+"
                    />
                    <p className="text-[9px] text-gray-400 mt-1">Enter regex patterns to exclude URLs. Patterns are case-insensitive.</p>
                  </div>
                  <div className="pt-2 border-t border-gray-200">
                    <label className="text-[10px] uppercase font-bold text-gray-500 block mb-2">Layout Grouping</label>
                    <div className="space-y-2 mb-3">
                      <div>
                        <label className="text-[9px] uppercase font-bold text-gray-400 block mb-0.5">Strip Tags (comma separated)</label>
                        <input type="text" value={(config.hashOptions?.stripTags || []).join(', ')} onChange={e => setConfig({...config, hashOptions: { ...config.hashOptions, stripTags: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }})} className="input py-1 text-[10px]" placeholder="script, style, noscript (defaults)" />
                      </div>
                      <div>
                        <label className="text-[9px] uppercase font-bold text-gray-400 block mb-0.5">Ignore Tags — skip during traversal (comma separated)</label>
                        <input type="text" value={(config.hashOptions?.ignoreTags || []).join(', ')} onChange={e => setConfig({...config, hashOptions: { ...config.hashOptions, ignoreTags: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }})} className="input py-1 text-[10px]" placeholder="a, span, i, strong, em, b, u, br, svg, path (defaults)" />
                      </div>
                      <div>
                        <label className="text-[9px] uppercase font-bold text-gray-400 block mb-0.5">Strip Selectors — remove elements by CSS selector before hashing</label>
                        <input type="text" value={(config.hashOptions?.stripSelectors || []).join(', ')} onChange={e => setConfig({...config, hashOptions: { ...config.hashOptions, stripSelectors: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }})} className="input py-1 text-[10px]" placeholder="header, footer, nav, .sidebar" />
                      </div>
                      <div className="flex gap-4">
                        <div>
                          <label className="text-[9px] uppercase font-bold text-gray-400 block mb-0.5">Max Depth</label>
                          <input type="number" value={config.hashOptions?.maxDepth || ''} onChange={e => setConfig({...config, hashOptions: { ...config.hashOptions, maxDepth: parseInt(e.target.value) || undefined }})} className="input py-1 text-[10px] w-20" placeholder="10" />
                        </div>
                        <label className="flex items-center gap-1.5 text-[10px] text-gray-600 cursor-pointer mt-3">
                          <input type="checkbox" checked={config.hashOptions?.includeHead || false} onChange={e => setConfig({...config, hashOptions: { ...config.hashOptions, includeHead: e.target.checked }})} className="rounded border-gray-300 text-primary-600 focus:ring-primary-600 w-3 h-3" />
                          Include &lt;head&gt; in hash
                        </label>
                      </div>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-gray-200">
                    <label className="text-[10px] uppercase font-bold text-gray-500 block mb-2">Structural Signals</label>
                    <div className="space-y-2">
                      {config.rules.map((rule, idx) => (<SignalRuleItem key={idx} rule={rule} onChange={(r) => updateSignalRule(idx, r)} onRemove={() => removeSignalRule(idx)} />))}
                      <datalist id="field-suggestions">{AUTOSUGGEST_FIELDS.map(f => <option key={f} value={f} />)}</datalist>
                      <button type="button" onClick={addSignalRule} className="btn btn-ghost btn-sm w-full py-1 text-[10px] h-auto border-dashed border-gray-300"><Plus className="w-3 h-3 mr-1" /> Add Signal</button>
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
                    <p className="font-medium truncate">{(() => { try { return new URL(site.root_url).hostname; } catch { return site.root_url; } })()}</p>
                    <p className="text-xs text-gray-500 flex items-center gap-1">
                      {site.status === 'completed' && <CheckCircle2 className="w-3 h-3 text-green-500" />}
                      {(site.status === 'crawling' || site.status === 'pending') && <Loader2 className="w-3 h-3 text-blue-500 animate-spin" />}
                      {site.status === 'failed' && <AlertCircle className="w-3 h-3 text-red-500" />}
                      {site.status === 'cancelled' && <X className="w-3 h-3 text-gray-400" />}
                      {site.page_count} items
                    </p>
                  </button>
                  <div className="flex gap-1">
                    {(site.status === 'crawling' || site.status === 'pending') ? (
                      <button onClick={() => handleStopCrawl(site.id)} className="p-1 text-red-500 hover:bg-red-50 rounded" title="Stop"><X className="w-4 h-4" /></button>
                    ) : (
                      <button onClick={() => handleRestartCrawl(site.id)} className="p-1 text-gray-500 hover:bg-gray-100 rounded" title="Restart"><RotateCcw className="w-4 h-4" /></button>
                    )}
                    <button onClick={() => handleDeleteSite(site.id)} className="p-1 text-red-400 hover:bg-red-50 rounded" title="Delete"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── RIGHT PANEL: Site Detail ── */}
        <div className="lg:col-span-2">
          {!selectedSite ? (
            <div className="card h-full flex flex-col items-center justify-center p-12 text-gray-400 border-dashed border-2">
              <Database className="w-12 h-12 mb-4 opacity-20" /><p>Select a site to analyze.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between bg-white p-4 rounded-lg border shadow-sm">
                <div className="flex items-center gap-4">
                  <h2 className="font-bold text-lg">{(() => { try { return new URL(selectedSite.root_url).hostname; } catch { return selectedSite.root_url; } })()}</h2>
                  <button onClick={handleGenerateMenus} disabled={generatingMenus} className="btn btn-secondary btn-xs flex items-center gap-1">
                    {generatingMenus ? <Loader2 className="w-3 h-3 animate-spin" /> : <List className="w-3 h-3" />} AI Menus
                  </button>
                  <label className="flex items-center gap-2 cursor-pointer select-none bg-white px-2 py-1 rounded border border-gray-200 shadow-sm" title="AI will intelligently extract content, ignoring CSS selectors.">
                    <Sparkles className={`w-3.5 h-3.5 ${useAI ? 'text-primary-600' : 'text-gray-400'}`} />
                    <span className={`text-[10px] font-bold uppercase ${useAI ? 'text-primary-700' : 'text-gray-500'}`}>AI Extract</span>
                    <input type="checkbox" className="rounded border-gray-300 text-primary-600 focus:ring-primary-600 w-3.5 h-3.5" checked={useAI} onChange={(e) => setUseAI(e.target.checked)} />
                  </label>
                </div>
                <div className="flex bg-gray-100 p-1 rounded-lg">
                  <button onClick={() => setView('overview')} className={`px-3 py-1.5 text-sm rounded-md ${view === 'overview' ? 'bg-white shadow-sm font-medium' : 'text-gray-500'}`}>
                    <Layers className="w-3.5 h-3.5 inline mr-1.5" />Overview
                  </button>
                  <button onClick={() => setView('items')} className={`px-3 py-1.5 text-sm rounded-md ${view === 'items' ? 'bg-white shadow-sm font-medium' : 'text-gray-500'}`}>
                    <FileText className="w-3.5 h-3.5 inline mr-1.5" />Items ({allItems.length})
                  </button>
                </div>
              </div>

              {/* ── OVERVIEW TAB ── */}
              {view === 'overview' && (
                <div className="space-y-4">
                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="card p-3 text-center">
                      <div className="text-2xl font-bold text-gray-900">{groups.length}</div>
                      <div className="text-xs text-gray-500">Layout Groups</div>
                    </div>
                    <div className="card p-3 text-center">
                      <div className="text-2xl font-bold text-green-600">{pageCount}</div>
                      <div className="text-xs text-gray-500">Pages</div>
                    </div>
                    <div className="card p-3 text-center">
                      <div className="text-2xl font-bold text-amber-600">{productCount}</div>
                      <div className="text-xs text-gray-500">Products</div>
                    </div>
                  </div>

                  {/* Site Analysis */}
                  {siteAnalysis ? (
                    <div className="card overflow-hidden border-indigo-200">
                      <div className="p-4 bg-indigo-50 border-b border-indigo-100 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-indigo-600" />
                          <h3 className="font-bold text-indigo-800 text-sm">Site Intelligence</h3>
                          {siteAnalysis.platform && <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-bold uppercase">{siteAnalysis.platform}</span>}
                          {siteAnalysis.theme_name && <span className="text-[10px] text-indigo-500">Theme: {siteAnalysis.theme_name}</span>}
                        </div>
                        <button onClick={() => setSiteAnalysis(null)} className="text-indigo-300 hover:text-indigo-600"><X className="w-4 h-4" /></button>
                      </div>
                      <div className="p-4 space-y-3">
                        {siteAnalysis.summary && <p className="text-xs text-gray-600">{siteAnalysis.summary}</p>}

                        {siteAnalysis.stylesheets?.filter(s => s.recommend).length > 0 && (
                          <div>
                            <h4 className="text-[10px] font-bold uppercase text-gray-400 mb-1">Recommended CSS</h4>
                            <div className="space-y-1">
                              {siteAnalysis.stylesheets.filter(s => s.recommend).map((s, i) => (
                                <div key={i} className="flex items-center gap-2 text-xs bg-green-50 border border-green-100 rounded px-2 py-1">
                                  <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />
                                  <span className="font-mono text-green-800 truncate flex-1">{s.url}</span>
                                  <span className="text-green-600 text-[10px] shrink-0">{s.purpose}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {siteAnalysis.scripts?.filter(s => s.recommend).length > 0 && (
                          <div>
                            <h4 className="text-[10px] font-bold uppercase text-gray-400 mb-1">Recommended JS</h4>
                            <div className="space-y-1">
                              {siteAnalysis.scripts.filter(s => s.recommend).map((s, i) => (
                                <div key={i} className="flex items-center gap-2 text-xs bg-blue-50 border border-blue-100 rounded px-2 py-1">
                                  <FileCode className="w-3 h-3 text-blue-500 shrink-0" />
                                  <span className="font-mono text-blue-800 truncate flex-1">{s.url}</span>
                                  <span className="text-blue-600 text-[10px] shrink-0">{s.purpose}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="flex gap-4">
                          {siteAnalysis.fonts?.length > 0 && (
                            <div>
                              <h4 className="text-[10px] font-bold uppercase text-gray-400 mb-1">Fonts</h4>
                              <div className="flex gap-1 flex-wrap">{siteAnalysis.fonts.map((f, i) => <span key={i} className="text-[10px] bg-gray-100 px-1.5 py-0.5 rounded">{f}</span>)}</div>
                            </div>
                          )}
                          {siteAnalysis.color_palette?.length > 0 && (
                            <div>
                              <h4 className="text-[10px] font-bold uppercase text-gray-400 mb-1">Colors</h4>
                              <div className="flex gap-1">{siteAnalysis.color_palette.map((c, i) => <div key={i} className="w-6 h-6 rounded border shadow-sm" style={{backgroundColor: c}} title={c} />)}</div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <button onClick={analyzeSite} disabled={analyzingSite} className="card p-4 w-full flex items-center justify-center gap-2 text-sm text-indigo-600 hover:bg-indigo-50 border-dashed border-2 border-indigo-200 transition-colors">
                      {analyzingSite ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                      {analyzingSite ? 'Analyzing site...' : 'AI Site Analysis — Detect platform, CSS/JS assets, fonts & colors'}
                    </button>
                  )}

                  {/* Layout Groups */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-bold uppercase text-gray-400 px-1">Layout Groups</h3>
                    <p className="text-xs text-gray-400 px-1">Pages with the same HTML structure are grouped together. Create a mapping for each group to define how content is extracted during migration.</p>

                    {groups.length === 0 && (
                      <div className="card p-8 text-center text-gray-400 border-dashed">
                        {selectedSite.status === 'crawling' || selectedSite.status === 'pending'
                          ? <><Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin opacity-30" /><p>Crawling... groups will appear as pages are discovered.</p></>
                          : <><Layers className="w-8 h-8 mx-auto mb-3 opacity-20" /><p>No groups found.</p></>
                        }
                      </div>
                    )}

                    {groups.map((g, i) => {
                      const mapping = getMappingForHash(g.structural_hash);
                      const isExpanded = expandedGroup === g.structural_hash;
                      const migratedCount = allItems.filter(p => p.structural_hash === g.structural_hash && p.status === 'migrated').length;

                      return (
                        <div key={i} className="card overflow-hidden">
                          {/* Group Header */}
                          <div className="p-4 flex items-center justify-between">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${g.type === 'product' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'}`}>{g.type}</span>
                                <span className="text-xs font-medium text-gray-600">{g.count} items</span>
                                {migratedCount > 0 && <span className="text-[10px] text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full">{migratedCount} migrated</span>}
                                <span className="px-1.5 py-0.5 bg-gray-100 text-[9px] font-mono rounded">{g.structural_hash?.substring(0,8)}</span>
                              </div>
                              <h4 className="font-semibold text-sm truncate text-gray-900">{g.sample_title || 'Untitled group'}</h4>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {mapping ? (
                                <div className="flex items-center gap-2">
                                  <div className="text-right mr-2">
                                    <div className="text-xs font-medium text-gray-700 flex items-center gap-1"><Link2 className="w-3 h-3 text-green-500" />{mapping.name}</div>
                                    <div className="text-[10px] text-gray-400">{templates.find(t => t.id === mapping.template_id)?.name || 'Template'}</div>
                                  </div>
                                  <button
                                    onClick={() => migrateGroup(g.structural_hash, mapping)}
                                    disabled={migrating || migratedCount === g.count}
                                    className="btn btn-primary btn-sm"
                                  >
                                    {migrating ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <ArrowRight className="w-3.5 h-3.5 mr-1" />}
                                    {migratedCount === g.count ? 'Done' : `Migrate ${g.count - migratedCount}`}
                                  </button>
                                </div>
                              ) : (
                                <div className="flex gap-1.5">
                                  <button
                                    onClick={() => analyzeGroup(g.structural_hash)}
                                    disabled={analyzingGroup === g.structural_hash}
                                    className="btn btn-secondary btn-sm border-indigo-200 text-indigo-700 bg-indigo-50"
                                    title="AI will analyze this group and suggest CSS selectors"
                                  >
                                    {analyzingGroup === g.structural_hash ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />}
                                    AI Analyze
                                  </button>
                                  <button
                                    onClick={() => openVisualPicker(g.sample_url, { hash: g.structural_hash, name: `${g.sample_title?.substring(0,30) || g.structural_hash.substring(0,8)} mapping` })}
                                    className="btn btn-secondary btn-sm"
                                    title="Open visual picker to create a mapping"
                                  >
                                    <Maximize2 className="w-3.5 h-3.5 mr-1" /> Map Fields
                                  </button>
                                  <button
                                    onClick={() => handleGenerateTemplate(g.structural_hash)}
                                    disabled={generatingTemplate}
                                    className="btn btn-primary btn-sm"
                                    title="Auto-generate a template and mapping"
                                  >
                                    {generatingTemplate ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <FileCode className="w-3.5 h-3.5 mr-1" />}
                                    Auto Map
                                  </button>
                                </div>
                              )}
                              <button onClick={() => setExpandedGroup(isExpanded ? null : g.structural_hash)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded">
                                {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                              </button>
                            </div>
                          </div>

                          {/* Expanded: show items in this group */}
                          {isExpanded && (
                            <div className="border-t bg-gray-50">
                              <div className="max-h-[300px] overflow-y-auto divide-y divide-gray-100">
                                {allItems.filter(p => p.structural_hash === g.structural_hash).map(p => {
                                  const urlPath = (() => { try { return new URL(p.url).pathname; } catch { return p.url; } })();
                                  return (
                                    <div key={p.id} className={`px-4 py-2 flex items-center justify-between text-sm ${p.status === 'migrated' ? 'opacity-50' : ''}`}>
                                      <div className="min-w-0 flex-1">
                                        <div className="font-medium text-gray-800 truncate">{p.title || 'Untitled'}</div>
                                        <div className="text-[10px] text-gray-400 font-mono truncate">{urlPath}</div>
                                      </div>
                                      {p.status === 'migrated' && <span className="text-[10px] text-green-600 font-bold bg-green-50 px-2 py-0.5 rounded-full shrink-0 ml-2">MIGRATED</span>}
                                    </div>
                                  );
                                })}
                              </div>
                              <div className="p-2 border-t flex justify-end">
                                <button onClick={() => selectGroupItems(g.structural_hash)} className="text-xs text-primary-600 hover:underline flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3" /> Select all in Items view
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Mapping details strip */}
                          {mapping && (
                            <div className="px-4 py-2 bg-gray-50 border-t flex items-center justify-between">
                              <div className="flex gap-1.5 flex-wrap">
                                {Object.keys(mapping.selector_map || {}).map(f => (
                                  <span key={f} className="text-[10px] bg-white border px-1.5 py-0.5 rounded text-gray-500">{f}</span>
                                ))}
                              </div>
                              <div className="flex gap-1.5 shrink-0">
                                <button onClick={() => openVisualPicker(g.sample_url, { mapping, hash: g.structural_hash, name: mapping.name, templateId: mapping.template_id })} className="text-[10px] text-primary-600 hover:underline">Edit</button>
                                <button onClick={() => deleteMapping(mapping.id)} className="text-[10px] text-red-400 hover:underline">Delete</button>
                              </div>
                            </div>
                          )}

                          {/* AI Analysis Results */}
                          {groupAnalysis[g.structural_hash] && (
                            <div className="px-4 py-3 bg-indigo-50 border-t border-indigo-100">
                              <div className="flex items-start justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                                  <span className="text-xs font-bold text-indigo-700">AI Analysis</span>
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${groupAnalysis[g.structural_hash].page_type === 'product' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                                    {groupAnalysis[g.structural_hash].page_type}
                                  </span>
                                  {groupAnalysis[g.structural_hash].confidence && (
                                    <span className="text-[10px] text-indigo-400">{Math.round(groupAnalysis[g.structural_hash].confidence * 100)}% confidence</span>
                                  )}
                                </div>
                                <button onClick={() => setGroupAnalysis(prev => { const n = {...prev}; delete n[g.structural_hash]; return n; })} className="text-indigo-300 hover:text-indigo-600"><X className="w-3.5 h-3.5" /></button>
                              </div>
                              {groupAnalysis[g.structural_hash].summary && (
                                <p className="text-[11px] text-indigo-600 mb-2">{groupAnalysis[g.structural_hash].summary}</p>
                              )}
                              <div className="flex gap-1.5 flex-wrap mb-2">
                                {Object.entries(groupAnalysis[g.structural_hash].selector_map || {}).map(([field, selector]) => (
                                  <span key={field} className="text-[10px] bg-white border border-indigo-200 px-1.5 py-0.5 rounded text-indigo-700 font-mono">
                                    <span className="font-bold">{field}</span>: {selector}
                                  </span>
                                ))}
                              </div>
                              <button
                                onClick={() => {
                                  const analysis = groupAnalysis[g.structural_hash];
                                  openVisualPicker(g.sample_url, {
                                    hash: g.structural_hash,
                                    name: `${g.sample_title?.substring(0,30) || g.structural_hash.substring(0,8)} mapping`
                                  });
                                  // Pre-populate the selector map with AI suggestions
                                  setSelectorMap(analysis.selector_map || {});
                                }}
                                className="btn btn-sm bg-indigo-600 text-white hover:bg-indigo-700"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Use These Selectors
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Unmapped mappings (not linked to a group) */}
                  {mappings.filter(m => !m.structural_hash).length > 0 && (
                    <div className="space-y-3">
                      <h3 className="text-xs font-bold uppercase text-gray-400 px-1">Custom Mappings (not group-linked)</h3>
                      {mappings.filter(m => !m.structural_hash).map((m, i) => (
                        <div key={i} className="card p-4 flex items-center justify-between">
                          <div>
                            <h4 className="font-semibold">{m.name}</h4>
                            <p className="text-xs text-gray-400">{templates.find(t => t.id === m.template_id)?.name || `Template #${m.template_id}`}</p>
                            <div className="flex gap-1 mt-1">{Object.keys(m.selector_map || {}).map(f => <span key={f} className="text-[10px] bg-gray-100 px-1.5 py-0.5 rounded text-gray-500">{f}</span>)}</div>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => deleteMapping(m.id)} className="p-2 text-red-400 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4" /></button>
                            <button
                              onClick={() => { setView('items'); /* user selects items then applies */ }}
                              className="btn btn-secondary btn-sm"
                            >
                              Go to Items
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── ITEMS TAB ── */}
              {view === 'items' && (
                <div className="card overflow-hidden">
                  <div className="p-4 border-b flex flex-col gap-3 bg-gray-50">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <input type="checkbox" className="rounded border-gray-300 text-primary-600 focus:ring-primary-600" checked={selectedItems.size > 0 && selectedItems.size === filteredItems.length} onChange={toggleAllFiltered} />
                        <h3 className="font-bold text-gray-700">All Items ({allItems.length})</h3>
                        <div className="flex bg-gray-200 p-0.5 rounded-md">
                          <button onClick={() => setItemFilter('all')} className={`px-2 py-0.5 text-[10px] font-bold rounded ${itemFilter === 'all' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500'}`}>All</button>
                          <button onClick={() => setItemFilter('page')} className={`px-2 py-0.5 text-[10px] font-bold rounded ${itemFilter === 'page' ? 'bg-white shadow-sm text-blue-700' : 'text-gray-500'}`}>Pages ({pageCount})</button>
                          <button onClick={() => setItemFilter('product')} className={`px-2 py-0.5 text-[10px] font-bold rounded ${itemFilter === 'product' ? 'bg-white shadow-sm text-amber-700' : 'text-gray-500'}`}>Products ({productCount})</button>
                        </div>
                      </div>
                      <div className="flex gap-2 items-center">
                        {mappings.length > 0 && (
                          <select
                            onChange={(e) => {
                              const m = mappings.find(r => r.id === e.target.value);
                              if (m) migrateWithMapping(m, Array.from(selectedItems));
                              e.target.value = '';
                            }}
                            disabled={selectedItems.size === 0}
                            className="input py-1 text-xs max-w-[160px]"
                            defaultValue=""
                          >
                            <option value="" disabled>Apply Mapping...</option>
                            {mappings.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                          </select>
                        )}
                        <button onClick={migrateSelectedItems} disabled={migrating || selectedItems.size === 0} className="btn btn-primary btn-sm">
                          {migrating ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <ArrowRight className="w-4 h-4 mr-1" />}
                          Migrate {selectedItems.size || ''}
                        </button>
                      </div>
                    </div>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input type="text" placeholder="Search by title or URL..." value={itemSearch} onChange={(e) => setItemSearch(e.target.value)} className="input pl-10 py-1.5 text-sm w-full bg-white" />
                    </div>
                  </div>

                  {filteredItems.length === 0 ? (
                    <div className="p-8 text-center text-gray-400 text-sm">{allItems.length === 0 ? 'No items discovered yet.' : 'No items match your filter.'}</div>
                  ) : (
                    <div className="max-h-[600px] overflow-y-auto">
                      <table className="w-full text-sm">
                        <tbody className="divide-y">
                          {filteredItems.map((p, i) => {
                            const urlPath = (() => { try { return new URL(p.url).pathname; } catch { return p.url; } })();
                            const isSelected = selectedItems.has(p.id);
                            const meta = typeof p.metadata === 'string' ? JSON.parse(p.metadata) : p.metadata;
                            return (
                              <tr key={p.id} onClick={(e) => toggleItem(e, p.id, i, filteredItems)} className={`cursor-pointer select-none hover:bg-gray-50 ${isSelected ? 'bg-primary-50' : ''} ${p.status === 'migrated' ? 'opacity-50' : ''}`}>
                                <td className="px-4 py-2.5 w-10">
                                  <input type="checkbox" className="rounded border-gray-300 text-primary-600 focus:ring-primary-600 pointer-events-none" checked={isSelected} readOnly />
                                </td>
                                <td className="px-4 py-2.5">
                                  <div className="flex items-center gap-2">
                                    <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded uppercase ${p.item_type === 'product' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'}`}>{p.item_type === 'product' ? 'PRD' : 'PG'}</span>
                                    <div className="min-w-0">
                                      <div className="font-medium text-gray-900 truncate">{p.title || 'Untitled'}</div>
                                      <div className="text-[10px] text-gray-400 font-mono truncate">{urlPath}</div>
                                    </div>
                                  </div>
                                </td>
                                {p.item_type === 'product' && (
                                  <td className="px-4 py-2.5 text-right font-bold text-green-600 text-xs">${meta?.price || '0.00'}</td>
                                )}
                                <td className="px-4 py-2.5 text-right">
                                  {p.status === 'migrated' ? (
                                    <div className="flex flex-col items-end gap-0.5">
                                      <span className="text-[10px] text-green-600 font-bold bg-green-50 px-2 py-0.5 rounded-full">MIGRATED</span>
                                      {meta?.migration_rule_id && (() => {
                                        const m = mappings.find(r => r.id === meta.migration_rule_id);
                                        return m ? <span className="text-[9px] text-gray-400 italic">{m.name}</span> : null;
                                      })()}
                                    </div>
                                  ) : (
                                    <span className="text-[10px] text-gray-400 uppercase font-bold">{p.status}</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Visual Selector Picker Modal ── */}
      {showPicker && (
        <div className="fixed inset-0 z-[100] bg-black bg-opacity-75 flex flex-col !mt-0 !top-0">
          <div className="bg-white p-4 flex flex-col border-b">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-4 flex-1">
                <h2 className="font-bold shrink-0 flex items-center gap-2">
                  <Maximize2 className="w-5 h-5 text-primary-600" />Field Mapper
                </h2>
                <input type="text" placeholder="Mapping name" value={editingMappingName} onChange={e => setEditingMappingName(e.target.value)} className="input py-1 text-sm max-w-[250px] border-amber-200 focus:border-amber-500 bg-amber-50" />
                <select
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  className="input py-1 text-sm max-w-[200px]"
                >
                  <option value="">Select Template...</option>
                  {templates.filter(t => t.regionCount > 0).map(t => (<option key={t.id} value={t.id}>{t.name} ({t.filename})</option>))}
                </select>
                <button onClick={suggestMappings} disabled={suggesting || !selectedTemplateId} className="btn btn-secondary border-indigo-200 text-indigo-700 bg-indigo-50 flex items-center gap-2">
                  {suggesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} AI Suggest
                </button>
              </div>
              <button onClick={() => setShowPicker(false)} className="btn btn-ghost"><X className="w-5 h-5" /></button>
            </div>

            {/* Live Preview Bar */}
            <div className="flex gap-3 overflow-x-auto pb-2">
              {Object.entries(selectorMap).map(([field, selector]) => {
                const preview = previews[field];
                const isImage = preview && typeof preview === 'string' && (preview.startsWith('http') || preview.startsWith('/') || preview.match(/\.(jpg|jpeg|png|webp|gif|svg)/i));
                const isVideo = preview && typeof preview === 'string' && preview.match(/\.(mp4|webm|ogg|mov)/i);
                return (
                  <div key={field} className="flex flex-col gap-1 min-w-[120px] max-w-[200px] bg-gray-50 border rounded p-2">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold uppercase text-gray-400">{field}</span>
                      <button onClick={() => setSelectorMap(prev => { const n = {...prev}; delete n[field]; return n; })} className="text-gray-300 hover:text-red-500"><X className="w-3 h-3" /></button>
                    </div>
                    {preview ? (
                      isImage ? <img src={preview} alt="" className="h-12 w-full object-cover rounded border bg-white" />
                      : isVideo ? <video src={preview} className="h-12 w-full object-cover rounded border bg-white" muted />
                      : <div className="text-[10px] text-gray-600 line-clamp-2 h-12 bg-white p-1 rounded border overflow-hidden">{String(preview).replace(/<[^>]*>/g, '')}</div>
                    ) : (
                      <div className="h-12 flex items-center justify-center border border-dashed rounded text-[9px] text-gray-300 bg-white italic">Not mapped</div>
                    )}
                    <div className="text-[8px] font-mono text-gray-400 truncate" title={selector}>{selector}</div>
                  </div>
                );
              })}
              {Object.keys(selectorMap).length === 0 && (
                <div className="text-sm text-gray-400 italic py-2">Click elements in the page to map them to template fields...</div>
              )}
            </div>
          </div>
          <div className="flex-1 bg-white">
            <iframe id="wolfwave-picker-iframe" src={pickerUrl} onLoad={handlePickerLoad} className="w-full h-full border-none" title="Field Mapper" />
          </div>
        </div>
      )}
    </div>
  );
}
