import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
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
  Maximize2,
  Package,
  FileText,
  X,
  RotateCcw,
  Trash2,
  Plus,
  Sparkles,
  Search,
  Upload,
  Palette,
  Type,
  FolderOpen
} from 'lucide-react';

const AUTOSUGGEST_FIELDS = ['title', 'description', 'price', 'sku', 'compare_at_price', 'inventory_quantity'];

function RuleItem({ rule, onChange, onRemove, depth = 0 }) {
  const updateRule = (field, value) => {
    onChange({ ...rule, [field]: value });
  };

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

  const removeAction = (idx) => {
    const actions = (rule.actions || []).filter((_, i) => i !== idx);
    updateRule('actions', actions);
  };

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

  const removeChild = (idx) => {
    const children = (rule.children || []).filter((_, i) => i !== idx);
    updateRule('children', children);
  };

  return (
    <div className={`p-3 bg-white rounded border border-gray-200 shadow-sm relative ${depth > 0 ? 'ml-6 mt-2 border-l-4 border-l-primary-200' : ''}`}>
      <button onClick={onRemove} className="absolute top-2 right-2 text-gray-300 hover:text-red-500">
        <X className="w-3.5 h-3.5" />
      </button>

      <div className="grid grid-cols-2 gap-2 mb-2 pr-6">
        <div>
          <label className="text-[8px] uppercase font-bold text-gray-400 block">URL Pattern (Regex)</label>
          <input
            type="text"
            value={rule.urlPattern || ''}
            onChange={e => updateRule('urlPattern', e.target.value)}
            placeholder="e.g. ^/products/"
            className="input py-1 px-2 text-[10px] w-full"
          />
        </div>
        <div>
          <label className="text-[8px] uppercase font-bold text-gray-400 block">CSS Selector</label>
          <input
            type="text"
            value={rule.selector || ''}
            onChange={e => updateRule('selector', e.target.value)}
            placeholder="e.g. .product-view"
            className="input py-1 px-2 text-[10px] w-full"
          />
        </div>
      </div>

      {/* Legacy/Single Action support */}
      {!rule.actions && (
        <div className="grid grid-cols-2 gap-2 mb-2">
          <select
            value={rule.action || 'setType'}
            onChange={e => updateRule('action', e.target.value)}
            className="input py-1 px-2 text-[10px]"
          >
            <option value="setType">Set Type</option>
            <option value="setField">Set Field</option>
            <option value="setConst">Set Const</option>
          </select>
          <input
            type="text"
            value={rule.value || ''}
            onChange={e => updateRule('value', e.target.value)}
            placeholder="Value"
            className="input py-1 px-2 text-[10px]"
            list="field-suggestions"
          />
        </div>
      )}

      {/* Multiple Actions */}
      <div className="space-y-1.5 mb-2">
        {(rule.actions || []).map((act, idx) => (
          <div key={idx} className="flex gap-1 items-center bg-gray-50 p-1 rounded">
            <select
              value={act.action}
              onChange={e => updateAction(idx, 'action', e.target.value)}
              className="input py-0.5 px-1 text-[9px] w-24"
            >
              <option value="setType">Set Type</option>
              <option value="setField">Set Field</option>
              <option value="setConst">Set Const</option>
            </select>
            <input
              type="text"
              value={act.value}
              onChange={e => updateAction(idx, 'value', e.target.value)}
              className="input py-0.5 px-1 text-[9px] flex-1"
              placeholder="Value"
              list="field-suggestions"
            />
            <button onClick={() => removeAction(idx)} className="text-gray-400 hover:text-red-500">
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
        <button 
          type="button" 
          onClick={addAction}
          className="text-[9px] text-primary-600 hover:underline flex items-center gap-1"
        >
          <Plus className="w-3 h-3" /> Add Action
        </button>
      </div>

      {/* Children */}
      {rule.children && rule.children.length > 0 && (
        <div className="space-y-2 border-t pt-2 mt-2">
          <label className="text-[8px] uppercase font-bold text-gray-400 block">Child Rules</label>
          {rule.children.map((child, idx) => (
            <RuleItem
              key={idx}
              rule={child}
              depth={depth + 1}
              onChange={newChild => updateChild(idx, newChild)}
              onRemove={() => removeChild(idx)}
            />
          ))}
        </div>
      )}
      <button 
        type="button" 
        onClick={addChild}
        className="text-[9px] text-gray-500 hover:text-primary-600 hover:underline flex items-center gap-1 mt-2"
      >
        <Plus className="w-3 h-3" /> Add Child Rule
      </button>
    </div>
  );
}

export default function SiteImporter() {
  const [url, setUrl] = useState('');
  const [showOptions, setShowOptions] = useState(false);
  const [config, setConfig] = useState({
    maxPages: 500,
    feedUrl: '',
    priorityPatterns: '/products/',
    excludePatterns: '/tagged/, /search, sort_by=',
    rules: [],
    autoDetect: true
  });

  const [presets, setPresets] = useState({});
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSite, setSelectedSite] = useState(null);
  const [groups, setGroups] = useState([]);
  const [discoveredProducts, setDiscoveredProducts] = useState([]);
  const [discoveredPages, setDiscoveredPages] = useState([]);
  const [view, setView] = useState('rules');
  const [generatingTemplate, setGeneratingTemplate] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [selectedPages, setSelectedPages] = useState(new Set());
  const [selectedProducts, setSelectedProducts] = useState(new Set());
  const [lastSelectedPageIndex, setLastSelectedPageIndex] = useState(null);
  const [lastSelectedProductIndex, setLastSelectedProductIndex] = useState(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [selectorMap, setSelectorMap] = useState({});
  const [showPicker, setShowPicker] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [previews, setPreviews] = useState({});
  const [pickerUrl, setPickerUrl] = useState('');
  const [editingRule, setEditingRule] = useState(null);
  const [editingRuleName, setEditingRuleName] = useState('');
  const [pagesSearch, setPagesSearch] = useState('');
  const [productsSearch, setProductsSearch] = useState('');
  
  const navigate = useNavigate();

  // 1. Initial Load
  useEffect(() => {
    loadSites();
    loadTemplates();
    loadPresets();
  }, []);

  // 2. Message Listener
  useEffect(() => {
    const handleMessage = (e) => {
      if (e.data.type === 'WOLFWAVE_SELECTOR_PICKED') {
        const { field, selector } = e.data;
        
        // Update Selector Map for Migration
        setSelectorMap(prev => ({
          ...prev,
          [field]: selector
        }));

        // Keep legacy config.rules sync for auto-detection/crawling if it's a known product field
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
        const { field } = e.data;
        setSelectorMap(prev => {
          const next = { ...prev };
          delete next[field];
          return next;
        });
      }
      if (e.data.type === 'WOLFWAVE_PICKER_DONE') {
        setShowPicker(false);
        if (editingRule) {
           handleSaveRule();
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [editingRule, selectorMap, selectedTemplateId]);

  const handleSaveRule = async () => {
    if (!selectedSite || !selectedTemplateId) return;
    const tpl = templates.find(t => t.id === parseInt(selectedTemplateId));
    try {
      const ruleData = {
        id: editingRule?.id,
        name: editingRuleName || 'New Import Rule',
        template_id: parseInt(selectedTemplateId),
        content_type: tpl?.content_type || 'pages',
        selector_map: selectorMap
      };

      await api.post(`/import/sites/${selectedSite.id}/rules`, ruleData);
      setEditingRule(null);
      setEditingRuleName('');
      
      // Refresh site to get updated rules in config
      const updated = await api.get(`/import/sites/${selectedSite.id}`);
      setSelectedSite(updated);
    } catch (err) { alert('Failed to save rule: ' + err.message); }
  };

  const deleteRule = async (ruleId) => {
    if (!confirm('Delete this rule?')) return;
    try {
      await api.delete(`/import/sites/${selectedSite.id}/rules/${ruleId}`);
      const updated = await api.get(`/import/sites/${selectedSite.id}`);
      setSelectedSite(updated);
    } catch (err) { alert(err.message); }
  };

  const startCreateRuleFromSelection = () => {
    const selection = view === 'products' ? Array.from(selectedProducts) : Array.from(selectedPages);
    if (selection.length === 0) return alert('Select at least one page first');
    
    const pages = view === 'products' ? discoveredProducts : discoveredPages;
    const firstPage = pages.find(p => p.id === selection[0]);
    
    setEditingRule({ id: Date.now().toString(), selection });
    setEditingRuleName('');
    setSelectorMap({});
    setSelectedTemplateId('');
    openVisualPicker(firstPage.url);
  };

  const applyRuleToSelection = async (rule) => {
    const selection = rule.content_type === 'products' ? Array.from(selectedProducts) : Array.from(selectedPages);
    if (selection.length === 0) return alert('Select items to migrate first');

    if (!confirm(`Migrate ${selection.length} items using rule "${rule.name}"?`)) return;

    try {
      setMigrating(true);
      const res = await api.post(`/import/sites/${selectedSite.id}/migrate-with-rule`, {
        rule_id: rule.id,
        page_ids: selection
      });
      
      const successCount = (res.results || []).filter(r => r.success).length;
      const failCount = (res.results || []).filter(r => !r.success).length;
      
      alert(`Migration complete! \nSuccess: ${successCount}\nFailed: ${failCount}`);
      
      if (successCount > 0) {
        if (rule.content_type === 'products') navigate('/products');
        else navigate('/pages');
      }
    } catch (err) { alert(err.message); }
    finally { setMigrating(false); }
  };

  const handlePickerLoad = () => {
    if (selectedTemplateId) {
      const tpl = templates.find(t => t.id === parseInt(selectedTemplateId));
      if (tpl && tpl.regions) {
        const regions = typeof tpl.regions === 'string' ? JSON.parse(tpl.regions) : tpl.regions;
        const isProduct = tpl.content_type === 'products';
        const systemFields = isProduct ? [
          { id: 'title', label: 'Set as Title' },
          { id: 'price', label: 'Set as Price' },
          { id: 'sku', label: 'Set as SKU' },
          { id: 'images', label: 'Set as Gallery Images' },
          { id: 'videos', label: 'Set as Gallery Videos' }
        ] : [
          { id: 'title', label: 'Set as Title' }
        ];

        const fields = [
          ...systemFields,
          ...regions.map(r => ({
            id: r.name,
            label: `Set as ${r.label || r.name}`
          }))
        ];
        
        const iframe = document.getElementById('wolfwave-picker-iframe');
        if (iframe && iframe.contentWindow) {
          // 1. Send Field List
          iframe.contentWindow.postMessage({
            type: 'WOLFWAVE_SET_FIELDS',
            fields: fields
          }, '*');

          // 2. Send Currently Mapped Fields
          iframe.contentWindow.postMessage({
            type: 'WOLFWAVE_SET_MAPPED_FIELDS',
            fields: Object.keys(selectorMap)
          }, '*');
        }
      }
    }
  };

  // Sync fields if template is changed while picker is already open
  useEffect(() => {
    if (showPicker && selectedTemplateId) {
      handlePickerLoad();
    }
  }, [selectedTemplateId, selectorMap]); // Added selectorMap to deps

  const refreshGroupsAndProducts = useCallback(async (site) => {
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
  }, []);

  const refreshCrawlingSites = useCallback(async () => {
    try {
      const now = Date.now();
      // 1. Always refresh the site list for the "History" panel
      const updatedSites = await api.get(`/import/sites?_t=${now}`);
      if (updatedSites) setSites(updatedSites);
      
      // 2. If a site is selected AND it's currently crawling, refresh its specific data
      if (selectedSite && (selectedSite.status === 'pending' || selectedSite.status === 'crawling')) {
        const updated = await api.get(`/import/sites/${selectedSite.id}?_t=${now}`);
        if (updated) {
          setSelectedSite(updated);
          // Immediate update for every new page discovered
          if (updated.status === 'completed' || updated.page_count !== (selectedSite.page_count || 0)) {
            refreshGroupsAndProducts(updated);
          }
        }
      }
    } catch (err) { console.error('Polling error:', err); }
  }, [selectedSite, refreshGroupsAndProducts]);

  // 3. Polling for crawling sites
  useEffect(() => {
    const interval = setInterval(() => {
      refreshCrawlingSites();
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(interval);
  }, [refreshCrawlingSites]);

  // 4. Live Preview Logic
  useEffect(() => {
    if (!showPicker || Object.keys(selectorMap).length === 0) {
      setPreviews({});
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const tpl = templates.find(t => t.id === parseInt(selectedTemplateId));
        const regions = tpl ? (typeof tpl.regions === 'string' ? JSON.parse(tpl.regions) : tpl.regions) : [];
        const field_types = Object.fromEntries(regions.map(r => [r.name, r.type]));

        const res = await api.post('/import/extract', {
          url: pickerUrl.replace('/api/import/proxy?url=', ''),
          selector_map: selectorMap,
          field_types
        });
        if (res.success) setPreviews(res.data || {});
      } catch (err) { console.error('Preview error:', err); }
    }, 500); // 500ms debounce

    return () => clearTimeout(timer);
  }, [selectorMap, showPicker, pickerUrl]);

  const suggestMappings = async () => {
    if (!selectedTemplateId) return alert('Select a template first');
    const tpl = templates.find(t => t.id === parseInt(selectedTemplateId));
    if (!tpl) return;

    setSuggesting(true);
    const toastId = toast.loading('AI is analyzing page structure...');
    try {
      const regions = typeof tpl.regions === 'string' ? JSON.parse(tpl.regions) : tpl.regions;
      const res = await api.post('/ai/suggest-selectors', { 
        url: pickerUrl.replace('/api/import/proxy?url=', ''), 
        fields: regions 
      });
      
      if (res.suggestions) {
        setSelectorMap(res.suggestions);
        toast.success('AI suggested mappings applied!', { id: toastId });
      } else {
        toast.error('AI couldn\'t find confident matches.', { id: toastId });
      }
    } catch (err) {
      toast.error('AI suggestion failed: ' + err.message, { id: toastId });
    } finally {
      setSuggesting(false);
    }
  };

  const openVisualPicker = (sampleUrl) => {
    if (!sampleUrl) return alert('No sample URL available');
    setPickerUrl(`/api/import/proxy?url=${encodeURIComponent(sampleUrl)}`);
    setShowPicker(true);
    setSelectorMap({}); // Reset map for new session
  };

  const loadPresets = async () => {
    try {
      const data = await api.get('/import/presets');
      console.log('[SiteImporter] Loaded presets:', Object.keys(data || {}));
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
      const list = data.data || [];
      // Annotate templates with region count for easier filtering in UI
      const annotated = list.map(t => ({
        ...t,
        regionCount: parseRegions(t.regions).length
      }));
      setTemplates(annotated);
    } catch (err) { console.error(err); }
  };

  const handleStartCrawl = async (e) => {
    e.preventDefault();
    if (!url) return;

    let targetUrl = url.trim();
    if (!/^https?:\/\//i.test(targetUrl)) {
      targetUrl = 'https://' + targetUrl;
      setUrl(targetUrl); // Update UI to show the corrected URL
    }

    try {
      setLoading(true);
      
      // Parse patterns from strings to arrays
      // Format relative feed URLs
      let finalFeedUrl = config.feedUrl;
      if (finalFeedUrl && finalFeedUrl.startsWith('/')) {
        finalFeedUrl = new URL(finalFeedUrl, targetUrl).toString();
      }

      const formattedConfig = {
        maxPages: parseInt(config.maxPages) || 500,
        feedUrl: finalFeedUrl,
        priorityPatterns: config.priorityPatterns.split(',').map(p => p.trim()).filter(Boolean),
        excludePatterns: config.excludePatterns.split(',').map(p => p.trim()).filter(Boolean),
        rules: config.rules,
        autoDetect: config.autoDetect
      };

      await api.post('/import/crawl', { url: targetUrl, config: formattedConfig });
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
      rules: [...config.rules, { selector: '', urlPattern: '', actions: [{ action: 'setType', value: 'product' }], children: [] }]
    });
  };

  const removeRule = (index) => {
    const newRules = [...config.rules];
    newRules.splice(index, 1);
    setConfig({ ...config, rules: newRules });
  };

  const updateRule = (index, newRule) => {
    const newRules = [...config.rules];
    newRules[index] = newRule;
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

  const handleGenerateTemplate = async (hash, groupType) => {
    try {
      const name = prompt('Enter a name for this Template & Rule:', `Imported ${hash.substring(0,8)}`);
      if (!name) return;
      
      setGeneratingTemplate(true);
      const res = await api.post(`/import/sites/${selectedSite.id}/generate-template`, { structural_hash: hash, name });
      
      if (res.template) {
        // Automatically create a corresponding Import Rule
        const ruleData = {
          name: `${name} Rule`,
          template_id: res.template.id,
          selector_map: { main: 'main' } // Default fallback
        };
        await api.post(`/import/sites/${selectedSite.id}/rules`, ruleData);
        
        // Select the pages in this group
        const pages = groupType === 'product' ? discoveredProducts : discoveredPages;
        const groupIds = pages.filter(p => p.structural_hash === hash).map(p => p.id);
        if (groupType === 'product') setSelectedProducts(new Set(groupIds));
        else setSelectedPages(new Set(groupIds));
        
        alert(`Template and Rule created! ${groupIds.length} pages selected.`);
        loadTemplates();
        
        // Refresh site to get the new rule
        const updated = await api.get(`/import/sites/${selectedSite.id}`);
        setSelectedSite(updated);
      }
    } catch (err) { alert(err.message); }
    finally { setGeneratingTemplate(false); }
  };

  const selectGroup = (hash, groupType) => {
    const pages = groupType === 'product' ? discoveredProducts : discoveredPages;
    const groupIds = pages.filter(p => p.structural_hash === hash).map(p => p.id);
    if (groupType === 'product') {
      setSelectedProducts(new Set(groupIds));
      setView('products');
    } else {
      setSelectedPages(new Set(groupIds));
      setView('pages');
    }
  };

  const handleBulkMigrate = async (hash) => {
    // Legacy support or fallback logic
    const targetTemplateId = selectedTemplateId || templates.find(t => t.filename.includes(`imported-${selectedSite.id}`))?.id;
    if (!targetTemplateId) return alert('Select a template first');
    
    try {
      const finalSelectorMap = Object.keys(selectorMap).length > 0 ? selectorMap : { main: 'main' };

      if (!confirm(`Ready to migrate group ${hash.substring(0,8)} using ${templates.find(t => t.id === parseInt(targetTemplateId))?.name}?`)) return;

      setMigrating(true);
      await api.post(`/import/sites/${selectedSite.id}/bulk-migrate`, { 
        structural_hash: hash, 
        template_id: parseInt(targetTemplateId), 
        selector_map: finalSelectorMap 
      });
      navigate('/pages');
    } catch (err) { alert(err.message); }
    finally { setMigrating(false); }
  };

  const handleBulkMigrateAll = async () => {
    try {
      const targetTemplateId = selectedTemplateId || templates.find(t => t.filename.includes('pages/standard'))?.id;
      if (!targetTemplateId) return alert('Select a template first');
      
      const finalSelectorMap = Object.keys(selectorMap).length > 0 ? selectorMap : { main: 'main' };
      
      if (!confirm(`Ready to migrate ALL pages using template "${templates.find(t => t.id === parseInt(targetTemplateId))?.name}"?`)) return;

      setMigrating(true);
      await api.post(`/import/sites/${selectedSite.id}/bulk-migrate-all`, { 
        template_id: parseInt(targetTemplateId), 
        selector_map: finalSelectorMap 
      });
      navigate('/pages');
    } catch (err) { alert(err.message); }
    finally { setMigrating(false); }
  };

  const togglePageSelection = (e, id, index) => {
    const next = new Set(selectedPages);
    
    if (e.shiftKey && lastSelectedPageIndex !== null) {
      const start = Math.min(lastSelectedPageIndex, index);
      const end = Math.max(lastSelectedPageIndex, index);
      const isSelecting = next.has(discoveredPages[lastSelectedPageIndex].id);
      
      for (let i = start; i <= end; i++) {
        if (isSelecting) next.add(discoveredPages[i].id);
        else next.delete(discoveredPages[i].id);
      }
    } else {
      if (next.has(id)) next.delete(id);
      else next.add(id);
    }
    
    setSelectedPages(next);
    setLastSelectedPageIndex(index);
  };

  const toggleAllPages = () => {
    if (selectedPages.size === discoveredPages.length) setSelectedPages(new Set());
    else setSelectedPages(new Set(discoveredPages.map(p => p.id)));
  };

  const toggleProductSelection = (e, id, index) => {
    const next = new Set(selectedProducts);
    
    if (e.shiftKey && lastSelectedProductIndex !== null) {
      const start = Math.min(lastSelectedProductIndex, index);
      const end = Math.max(lastSelectedProductIndex, index);
      const isSelecting = next.has(discoveredProducts[lastSelectedProductIndex].id);
      
      for (let i = start; i <= end; i++) {
        if (isSelecting) next.add(discoveredProducts[i].id);
        else next.delete(discoveredProducts[i].id);
      }
    } else {
      if (next.has(id)) next.delete(id);
      else next.add(id);
    }
    
    setSelectedProducts(next);
    setLastSelectedProductIndex(index);
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
      const targetTemplateId = selectedTemplateId || templates.find(t => t.filename.includes('pages/standard'))?.id;
      if (!targetTemplateId) return alert('Select a template first');

      const finalSelectorMap = Object.keys(selectorMap).length > 0 ? selectorMap : { main: 'main' };
      
      if (!confirm(`Ready to migrate ${targetIds.length} pages using template "${templates.find(t => t.id === parseInt(targetTemplateId))?.name}"?`)) return;
      setMigrating(true);
      await api.post(`/import/sites/${selectedSite.id}/bulk-migrate-all`, { 
        template_id: parseInt(targetTemplateId), 
        selector_map: finalSelectorMap,
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

  // ── WP Theme Import State ──
  const [importMode, setImportMode] = useState('crawler'); // 'crawler' | 'wp-theme'
  const [wpFile, setWpFile] = useState(null);
  const [wpPreview, setWpPreview] = useState(null);
  const [wpLoading, setWpLoading] = useState(false);
  const [wpResult, setWpResult] = useState(null);
  const [wpSelectedFiles, setWpSelectedFiles] = useState(new Set());

  const handleWpFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setWpFile(file);
    setWpPreview(null);
    setWpResult(null);
    setWpLoading(true);
    try {
      const formData = new FormData();
      formData.append('theme', file);
      const data = await api.post('/import/wp-theme/preview', formData);
      if (data.success) {
        setWpPreview(data);
        setWpSelectedFiles(new Set(data.detectedFiles.filter(f => f.hasMapping).map(f => f.basename)));
      } else {
        alert('Preview failed: ' + (data.error || 'Unknown error'));
      }
    } catch (err) { alert('Preview failed: ' + err.message); }
    finally { setWpLoading(false); }
  };

  const handleWpConvert = async () => {
    if (!wpFile) return;
    setWpLoading(true);
    try {
      const formData = new FormData();
      formData.append('theme', wpFile);
      formData.append('selectedFiles', JSON.stringify(Array.from(wpSelectedFiles)));
      const data = await api.post('/import/wp-theme/convert', formData);
      if (data.success) {
        setWpResult(data);
        loadTemplates();
      } else {
        alert('Conversion failed: ' + (data.error || 'Unknown error'));
      }
    } catch (err) { alert('Conversion failed: ' + err.message); }
    finally { setWpLoading(false); }
  };

  const toggleWpFile = (basename) => {
    const next = new Set(wpSelectedFiles);
    if (next.has(basename)) next.delete(basename);
    else next.add(basename);
    setWpSelectedFiles(next);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Site Importer</h1>
        <div className="flex bg-gray-100 p-1 rounded-lg">
          <button
            onClick={() => setImportMode('crawler')}
            className={`px-4 py-2 text-sm rounded-md flex items-center gap-2 ${importMode === 'crawler' ? 'bg-white shadow-sm font-medium' : 'text-gray-500'}`}
          >
            <Globe className="w-4 h-4" /> Crawl Site
          </button>
          <button
            onClick={() => setImportMode('wp-theme')}
            className={`px-4 py-2 text-sm rounded-md flex items-center gap-2 ${importMode === 'wp-theme' ? 'bg-white shadow-sm font-medium' : 'text-gray-500'}`}
          >
            <Upload className="w-4 h-4" /> WP Theme
          </button>
        </div>
      </div>

      {importMode === 'wp-theme' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Upload Panel */}
          <div className="space-y-4">
            <div className="card p-6">
              <h2 className="font-semibold mb-4 flex items-center gap-2">
                <FolderOpen className="w-5 h-5 text-primary-600" />
                Import WordPress Theme
              </h2>
              <p className="text-sm text-gray-500 mb-4">Upload a WordPress theme ZIP file to convert its PHP templates into Nunjucks templates.</p>

              <label className="block border-2 border-dashed border-gray-200 rounded-lg p-8 text-center cursor-pointer hover:border-primary-300 hover:bg-primary-50/30 transition-colors">
                <input type="file" accept=".zip" onChange={handleWpFileSelect} className="hidden" />
                {wpFile ? (
                  <div>
                    <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-2" />
                    <p className="font-medium text-sm">{wpFile.name}</p>
                    <p className="text-xs text-gray-400 mt-1">{(wpFile.size / 1024 / 1024).toFixed(1)} MB</p>
                  </div>
                ) : (
                  <div>
                    <Upload className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">Click to select or drag a <strong>.zip</strong> file</p>
                    <p className="text-xs text-gray-400 mt-1">Max 50MB</p>
                  </div>
                )}
              </label>

              {wpLoading && !wpPreview && (
                <div className="flex items-center justify-center gap-2 mt-4 text-sm text-gray-500">
                  <Loader2 className="w-4 h-4 animate-spin" /> Analyzing theme...
                </div>
              )}
            </div>

            {/* Theme Metadata */}
            {wpPreview && wpPreview.metadata && (
              <div className="card p-4 space-y-3">
                <h3 className="font-bold text-lg">{wpPreview.metadata.theme_name || 'Unknown Theme'}</h3>
                {wpPreview.metadata.author && <p className="text-sm text-gray-500">By {wpPreview.metadata.author}</p>}
                {wpPreview.metadata.version && <p className="text-xs text-gray-400">v{wpPreview.metadata.version}</p>}
                {wpPreview.metadata.description && <p className="text-sm text-gray-600 mt-2">{wpPreview.metadata.description}</p>}
                {wpPreview.isChildTheme && (
                  <div className="bg-amber-50 border border-amber-200 rounded p-2 text-xs text-amber-700">
                    <AlertCircle className="w-3 h-3 inline mr-1" />
                    Child theme of <strong>{wpPreview.parentTheme}</strong> — parent theme templates not included.
                  </div>
                )}

                {/* Theme Styles */}
                {wpPreview.themeStyles && (
                  <div className="border-t pt-3 mt-3 space-y-2">
                    <h4 className="text-xs font-bold uppercase text-gray-400">Detected Styles</h4>
                    {wpPreview.themeStyles.primaryColor && (
                      <div className="flex items-center gap-2 text-sm">
                        <div className="w-5 h-5 rounded border" style={{ background: wpPreview.themeStyles.primaryColor }}></div>
                        <span className="text-gray-600">Primary: <code className="text-xs bg-gray-100 px-1 rounded">{wpPreview.themeStyles.primaryColor}</code></span>
                      </div>
                    )}
                    {wpPreview.themeStyles.secondaryColor && (
                      <div className="flex items-center gap-2 text-sm">
                        <div className="w-5 h-5 rounded border" style={{ background: wpPreview.themeStyles.secondaryColor }}></div>
                        <span className="text-gray-600">Secondary: <code className="text-xs bg-gray-100 px-1 rounded">{wpPreview.themeStyles.secondaryColor}</code></span>
                      </div>
                    )}
                    {wpPreview.themeStyles.fonts?.length > 0 && (
                      <div className="flex items-center gap-2 text-sm">
                        <Type className="w-4 h-4 text-gray-400" />
                        <span className="text-gray-600">{wpPreview.themeStyles.fonts.join(', ')}</span>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex gap-2 text-xs text-gray-500 pt-2">
                  <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">{wpPreview.templateCount} templates</span>
                  <span className="bg-gray-100 px-2 py-0.5 rounded-full">{wpPreview.partialCount} partials</span>
                  <span className="bg-gray-100 px-2 py-0.5 rounded-full">{wpPreview.layoutCount} layout files</span>
                </div>
              </div>
            )}
          </div>

          {/* File List & Convert */}
          <div className="lg:col-span-2">
            {!wpPreview && !wpResult ? (
              <div className="card h-full flex flex-col items-center justify-center p-12 text-gray-400 border-dashed border-2">
                <Upload className="w-12 h-12 mb-4 opacity-20" />
                <p>Upload a WordPress theme ZIP to preview.</p>
              </div>
            ) : wpResult ? (
              /* Conversion Results */
              <div className="space-y-4">
                <div className="card p-6 bg-green-50 border-green-200">
                  <div className="flex items-center gap-3 mb-4">
                    <CheckCircle2 className="w-8 h-8 text-green-600" />
                    <div>
                      <h2 className="font-bold text-lg text-green-900">Theme Converted Successfully</h2>
                      <p className="text-sm text-green-700">{wpResult.templates?.length || 0} templates generated from {wpResult.themeName}</p>
                    </div>
                  </div>
                  {wpResult.warnings?.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded p-3 mb-4">
                      <h4 className="text-xs font-bold text-amber-700 mb-1">Warnings</h4>
                      {wpResult.warnings.map((w, i) => (
                        <p key={i} className="text-xs text-amber-600">{w}</p>
                      ))}
                    </div>
                  )}
                </div>
                <div className="card overflow-hidden">
                  <div className="p-3 bg-gray-50 border-b">
                    <h3 className="font-bold text-sm text-gray-700">Generated Templates</h3>
                  </div>
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                      <tr>
                        <th className="px-4 py-2 text-left">Source</th>
                        <th className="px-4 py-2 text-left">Generated File</th>
                        <th className="px-4 py-2 text-left">Content Type</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {(wpResult.templates || []).map((t, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-mono text-xs text-gray-500">{t.source}</td>
                          <td className="px-4 py-3">
                            <span className="font-medium text-primary-700">{t.filename}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs bg-gray-100 px-2 py-0.5 rounded-full">{t.contentType}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button onClick={() => { setWpResult(null); setWpPreview(null); setWpFile(null); }} className="btn btn-secondary">
                  Import Another Theme
                </button>
              </div>
            ) : (
              /* Preview / File Selection */
              <div className="space-y-4">
                <div className="card overflow-hidden">
                  <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                    <h3 className="font-bold text-gray-700">Template Files</h3>
                    <button
                      onClick={handleWpConvert}
                      disabled={wpLoading || wpSelectedFiles.size === 0}
                      className="btn btn-primary"
                    >
                      {wpLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ArrowRight className="w-4 h-4 mr-2" />}
                      Convert {wpSelectedFiles.size} Templates
                    </button>
                  </div>

                  {/* Layout Files */}
                  {wpPreview.detectedFiles.filter(f => f.isLayout).length > 0 && (
                    <div>
                      <div className="px-4 py-2 bg-slate-50 border-b">
                        <h4 className="text-[10px] uppercase font-bold text-gray-400">Layout Files (auto-merged into base layout)</h4>
                      </div>
                      {wpPreview.detectedFiles.filter(f => f.isLayout).map((f, i) => (
                        <div key={i} className="px-4 py-2.5 flex items-center gap-3 border-b text-sm bg-slate-50/50">
                          <CheckCircle2 className="w-4 h-4 text-green-400" />
                          <span className="font-mono text-xs text-gray-500">{f.source}</span>
                          <ArrowRight className="w-3 h-3 text-gray-300" />
                          <span className="text-xs text-green-700 font-medium">layouts/wp-{wpPreview.metadata?.theme_name?.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'theme'}.njk</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Content Templates */}
                  <div>
                    <div className="px-4 py-2 bg-gray-50 border-b">
                      <h4 className="text-[10px] uppercase font-bold text-gray-400">Content Templates (select which to convert)</h4>
                    </div>
                    {wpPreview.detectedFiles.filter(f => f.hasMapping && !f.isLayout).map((f, i) => (
                      <div
                        key={i}
                        onClick={() => toggleWpFile(f.basename)}
                        className={`px-4 py-3 flex items-center gap-3 border-b cursor-pointer hover:bg-gray-50 ${wpSelectedFiles.has(f.basename) ? 'bg-primary-50' : ''}`}
                      >
                        <input
                          type="checkbox"
                          className="rounded border-gray-300 text-primary-600 focus:ring-primary-600 pointer-events-none"
                          checked={wpSelectedFiles.has(f.basename)}
                          readOnly
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-gray-600">{f.source}</span>
                            <ArrowRight className="w-3 h-3 text-gray-300 shrink-0" />
                            <span className="text-xs text-primary-700 font-medium">{f.targetDir}/wp-*-{f.targetName}.njk</span>
                          </div>
                        </div>
                        <span className="text-[10px] bg-gray-100 px-2 py-0.5 rounded-full text-gray-500 shrink-0">{f.contentType}</span>
                      </div>
                    ))}
                  </div>

                  {/* Template Parts */}
                  {wpPreview.detectedFiles.filter(f => f.isTemplatePart).length > 0 && (
                    <div>
                      <div className="px-4 py-2 bg-gray-50 border-b">
                        <h4 className="text-[10px] uppercase font-bold text-gray-400">Template Parts (auto-converted to components)</h4>
                      </div>
                      {wpPreview.detectedFiles.filter(f => f.isTemplatePart).map((f, i) => (
                        <div key={i} className="px-4 py-2 flex items-center gap-3 border-b text-sm opacity-60">
                          <FileCode className="w-4 h-4 text-gray-400" />
                          <span className="font-mono text-xs text-gray-500">{f.source}</span>
                          <ArrowRight className="w-3 h-3 text-gray-300" />
                          <span className="text-xs text-gray-500">components/wp-*-{f.basename.replace('.php', '')}.njk</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Unmapped Files */}
                  {wpPreview.detectedFiles.filter(f => !f.hasMapping && !f.isTemplatePart && !f.isLayout).length > 0 && (
                    <div>
                      <div className="px-4 py-2 bg-gray-50 border-b">
                        <h4 className="text-[10px] uppercase font-bold text-gray-400">Other PHP files (skipped)</h4>
                      </div>
                      {wpPreview.detectedFiles.filter(f => !f.hasMapping && !f.isTemplatePart && !f.isLayout).map((f, i) => (
                        <div key={i} className="px-4 py-2 flex items-center gap-2 border-b text-xs text-gray-400 opacity-50">
                          <X className="w-3 h-3" />
                          <span className="font-mono">{f.source}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-6">
          <div className="card p-4">
            <h2 className="font-semibold mb-4">New Crawl</h2>
            <form onSubmit={handleStartCrawl} className="space-y-3">
              <input 
                type="text" 
                value={url} 
                onChange={e => setUrl(e.target.value)} 
                onBlur={e => {
                  let v = e.target.value.trim();
                  if (v && !/^https?:\/\//i.test(v)) setUrl('https://' + v);
                }}
                className="input" 
                placeholder="https://..." 
                required 
              />
              
              <div className="flex items-center justify-between">
                <button 
                  type="button" 
                  onClick={() => setShowOptions(!showOptions)}
                  className="text-xs text-primary-600 font-medium flex items-center gap-1 hover:underline"
                >
                  {showOptions ? 'Hide' : 'Show'} Advanced Options
                </button>

                <label className="flex items-center gap-2 text-xs font-medium text-gray-600 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={config.autoDetect}
                    onChange={e => setConfig({...config, autoDetect: e.target.checked})}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-600"
                  />
                  Auto-detect Blueprint
                </label>
              </div>

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
                        <RuleItem 
                          key={idx} 
                          rule={rule} 
                          onChange={(newRule) => updateRule(idx, newRule)} 
                          onRemove={() => removeRule(idx)} 
                        />
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
                  <div className="flex bg-gray-100 p-1 rounded-lg">
                    <button onClick={() => setView('rules')} className={`px-3 py-1.5 text-sm rounded-md ${view === 'rules' ? 'bg-white shadow-sm' : 'text-gray-500'}`}>Rules</button>
                    <button onClick={() => setView('pages')} className={`px-3 py-1.5 text-sm rounded-md ${view === 'pages' ? 'bg-white shadow-sm' : 'text-gray-500'}`}>Pages ({discoveredPages.length})</button>
                    <button onClick={() => setView('products')} className={`px-3 py-1.5 text-sm rounded-md ${view === 'products' ? 'bg-white shadow-sm' : 'text-gray-500'}`}>Products ({discoveredProducts.length})</button>
                  </div>
                </div>
              </div>
              {view === 'rules' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4">
                    {(selectedSite.config?.migration_rules || []).map((rule, i) => (
                      <div key={i} className="card p-4 flex items-center justify-between">
                        <div>
                          <h3 className="font-bold text-lg">{rule.name}</h3>
                          <p className="text-xs text-gray-400">Target Template: {templates.find(t => t.id === rule.template_id)?.name || rule.template_id}</p>
                          <div className="flex gap-1 mt-2">
                            {Object.keys(rule.selector_map || {}).map(f => (
                              <span key={f} className="text-[10px] bg-gray-100 px-1.5 py-0.5 rounded text-gray-500">{f}</span>
                            ))}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => deleteRule(rule.id)} className="p-2 text-red-400 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4" /></button>
                          <button 
                            onClick={() => applyRuleToSelection(rule)} 
                            disabled={selectedPages.size === 0 && selectedProducts.size === 0}
                            className="btn btn-primary btn-sm"
                          >
                            Apply to Selection ({view === 'products' ? selectedProducts.size : selectedPages.size})
                          </button>
                        </div>
                      </div>
                    ))}
                    {(selectedSite.config?.migration_rules || []).length === 0 && (
                      <div className="card p-12 text-center text-gray-400 border-dashed">
                        <FileCode className="w-12 h-12 mx-auto mb-4 opacity-10" />
                        <p>No custom rules defined yet.</p>
                        <button onClick={() => setView('pages')} className="text-primary-600 text-sm mt-2 hover:underline">Go to Pages to create one</button>
                      </div>
                    )}
                  </div>

                  <hr className="border-gray-100" />
                  
                  <div className="space-y-3">
                    <h3 className="text-xs font-bold uppercase text-gray-400">Auto-Detected Groups (Structural Hashes)</h3>
                    <div className="grid grid-cols-1 gap-4 opacity-75">
                      {groups.map((g, i) => (
                        <div key={i} className="card p-3 bg-gray-50 border-dashed">
                          <div className="flex justify-between items-center">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="px-1.5 py-0.5 bg-white text-[9px] font-mono rounded border">{g.structural_hash.substring(0,8)}</span>
                                <span className="text-[9px] font-medium text-primary-600 bg-primary-50 px-1.5 py-0.5 rounded-full">{g.count} pages</span>
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider ${g.type === 'product' ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'}`}>
                                  {g.type}
                                </span>
                              </div>
                              <h4 className="font-semibold text-sm truncate">{g.sample_title}</h4>
                            </div>
                            <div className="flex gap-2 shrink-0">
                              <button onClick={() => selectGroup(g.structural_hash, g.type)} className="p-1.5 text-green-600 hover:bg-green-50 rounded" title="Select All in Group"><CheckCircle2 className="w-4 h-4" /></button>
                              <button onClick={() => {
                                selectGroup(g.structural_hash, g.type);
                                openVisualPicker(g.sample_url);
                                setEditingRule({ id: Date.now().toString(), selection: [] });
                                setEditingRuleName(`Rule for ${g.structural_hash.substring(0,8)}`);
                              }} className="p-1.5 text-amber-600 hover:bg-amber-50 rounded" title="Define Rule for Group"><Maximize2 className="w-4 h-4" /></button>
                              <button onClick={() => handleGenerateTemplate(g.structural_hash, g.type)} className="p-1.5 text-primary-600 hover:bg-primary-50 rounded" title="Generate Template & Rule"><FileCode className="w-4 h-4" /></button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              {view === 'pages' && (
                <div className="card overflow-hidden">
                  <div className="p-4 border-b flex flex-col gap-4 bg-gray-50">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <input 
                          type="checkbox" 
                          className="rounded border-gray-300 text-primary-600 focus:ring-primary-600"
                          checked={selectedPages.size > 0 && selectedPages.size === discoveredPages.length}
                          onChange={toggleAllPages}
                        />
                        <h3 className="font-bold text-gray-700">Discovered Pages ({discoveredPages.length})</h3>
                      </div>
                      <div className="flex gap-2">
                        <select 
                          onChange={(e) => {
                            const rule = (selectedSite.config?.migration_rules || []).find(r => r.id === e.target.value);
                            if (rule) applyRuleToSelection(rule);
                            e.target.value = ''; // Reset
                          }}
                          disabled={selectedPages.size === 0 || !(selectedSite.config?.migration_rules || []).length}
                          className="input py-1 text-xs max-w-[140px]"
                          defaultValue=""
                        >
                          <option value="" disabled>Apply Rule...</option>
                          {(selectedSite.config?.migration_rules || []).map(r => (
                            <option key={r.id} value={r.id}>{r.name}</option>
                          ))}
                        </select>
                        <button 
                          onClick={startCreateRuleFromSelection} 
                          disabled={selectedPages.size === 0} 
                          className="btn btn-secondary btn-sm"
                        >
                          <Plus className="w-4 h-4 mr-1" /> Create Rule
                        </button>
                        <button onClick={handleBulkPageMigrate} disabled={migrating || discoveredPages.length === 0} className="btn btn-primary btn-sm">
                          {migrating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />} 
                          {selectedPages.size > 0 ? `Quick Migrate ${selectedPages.size}` : 'Quick Migrate All'}
                        </button>
                      </div>
                    </div>
                    {/* Search Bar */}
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Search pages by title or URL path..."
                        value={pagesSearch}
                        onChange={(e) => setPagesSearch(e.target.value)}
                        className="input pl-10 py-1.5 text-sm w-full bg-white"
                      />
                    </div>
                  </div>
                  {discoveredPages.length === 0 ? (
                    <div className="p-8 text-center text-gray-400 text-sm">No pages discovered yet. Pages will appear here once the crawl finds non-product URLs.</div>
                  ) : (
                    <table className="w-full text-sm">
                      <tbody className="divide-y">
                        {discoveredPages
                          .filter(p => {
                            const term = pagesSearch.toLowerCase();
                            return p.title?.toLowerCase().includes(term) || p.url.toLowerCase().includes(term);
                          })
                          .map((p, i) => {
                            const path = (() => { try { return new URL(p.url).pathname; } catch { return p.url; } })();
                            const isSelected = selectedPages.has(p.id);
                            return (
                              <tr 
                                key={i} 
                                onClick={(e) => togglePageSelection(e, p.id, i)}
                                className={`cursor-pointer select-none hover:bg-gray-50 ${isSelected ? 'bg-primary-50' : ''} ${p.status === 'migrated' ? 'opacity-50' : ''}`}
                              >
                                <td className="px-4 py-3 w-10">
                                  <input 
                                    type="checkbox" 
                                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-600 pointer-events-none"
                                    checked={isSelected}
                                    readOnly
                                  />
                                </td>
                                <td className="px-4 py-3">
                                  <div className="font-medium text-gray-900">{p.title || 'Untitled'}</div>
                                  <div className="text-xs text-gray-400 font-mono">{path}</div>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  {p.status === 'migrated' ? (
                                    <span className="text-xs text-green-600 font-bold bg-green-50 px-2 py-0.5 rounded-full">MIGRATED</span>
                                  ) : (
                                    <span className="text-[10px] text-gray-400 uppercase font-bold">{p.status}</span>
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
                  <div className="p-4 border-b flex flex-col gap-4 bg-gray-50">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <input 
                          type="checkbox" 
                          className="rounded border-gray-300 text-primary-600 focus:ring-primary-600"
                          checked={selectedProducts.size > 0 && selectedProducts.size === discoveredProducts.length}
                          onChange={toggleAllProducts}
                        />
                        <h3 className="font-bold text-gray-700">Discovered Products ({discoveredProducts.length})</h3>
                      </div>
                      <div className="flex gap-2">
                        <select 
                          onChange={(e) => {
                            const rule = (selectedSite.config?.migration_rules || []).find(r => r.id === e.target.value);
                            if (rule) applyRuleToSelection(rule);
                            e.target.value = ''; // Reset
                          }}
                          disabled={selectedProducts.size === 0 || !(selectedSite.config?.migration_rules || []).length}
                          className="input py-1 text-xs max-w-[140px]"
                          defaultValue=""
                        >
                          <option value="" disabled>Apply Rule...</option>
                          {(selectedSite.config?.migration_rules || []).map(r => (
                            <option key={r.id} value={r.id}>{r.name}</option>
                          ))}
                        </select>
                        <button 
                          onClick={startCreateRuleFromSelection} 
                          disabled={selectedProducts.size === 0} 
                          className="btn btn-secondary btn-sm"
                        >
                          <Plus className="w-4 h-4 mr-1" /> Create Rule
                        </button>
                        <button onClick={handleBulkProductMigrate} disabled={migrating || discoveredProducts.length === 0} className="btn btn-primary btn-sm">
                          {migrating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Package className="w-4 h-4 mr-2" />} 
                          {selectedProducts.size > 0 ? `Quick Migrate ${selectedProducts.size}` : 'Quick Migrate All'}
                        </button>
                      </div>
                    </div>
                    {/* Search Bar */}
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Search products by title..."
                        value={productsSearch}
                        onChange={(e) => setProductsSearch(e.target.value)}
                        className="input pl-10 py-1.5 text-sm w-full bg-white"
                      />
                    </div>
                  </div>
                  <table className="w-full text-sm">
                    <tbody className="divide-y">
                      {discoveredProducts
                        .filter(p => {
                          const term = productsSearch.toLowerCase();
                          return p.title?.toLowerCase().includes(term);
                        })
                        .map((p, i) => {
                          const isSelected = selectedProducts.has(p.id);
                          return (
                            <tr 
                              key={i}
                              onClick={(e) => toggleProductSelection(e, p.id, i)}
                              className={`cursor-pointer select-none hover:bg-gray-50 ${isSelected ? 'bg-primary-50' : ''}`}
                            >
                              <td className="px-4 py-3 w-10">
                                <input 
                                  type="checkbox" 
                                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-600 pointer-events-none"
                                  checked={isSelected}
                                  readOnly
                                />
                              </td>
                              <td className="px-4 py-3 font-medium text-gray-900">{p.title}</td>
                              <td className="px-4 py-3 text-right font-bold text-green-600">
                                ${(typeof p.metadata === 'string' ? JSON.parse(p.metadata) : p.metadata)?.price || '0.00'}
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
      </div>

      )}

      {showPicker && (
        <div className="fixed inset-0 z-[100] bg-black bg-opacity-75 flex flex-col !mt-0 !top-0">
          <div className="bg-white p-4 flex flex-col border-b">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-4 flex-1">
                <h2 className="font-bold shrink-0 flex items-center gap-2">
                  <Maximize2 className="w-5 h-5 text-primary-600" />
                  Visual Selector Picker
                </h2>
                <input 
                  type="text" 
                  placeholder="Rule Name (e.g. Blog Post Mapping)" 
                  value={editingRuleName}
                  onChange={e => setEditingRuleName(e.target.value)}
                  className="input py-1 text-sm max-w-[250px] border-amber-200 focus:border-amber-500 bg-amber-50"
                />
                <select 
                  value={selectedTemplateId} 
                  onChange={(e) => {
                    const id = e.target.value;
                    setSelectedTemplateId(id);
                    const tpl = templates.find(t => t.id === parseInt(id));
                    if (tpl) {
                      if (tpl.content_type === 'products') setView('products');
                      else setView('pages');
                    }
                  }}
                  className="input py-1 text-sm max-w-[200px]"
                >
                  <option value="">Select Target Template...</option>
                  {templates
                    .filter(t => t.regionCount > 0)
                    .map(t => (
                      <option key={t.id} value={t.id}>{t.name} ({t.filename})</option>
                    ))
                  }
                </select>
                <button 
                  onClick={suggestMappings}
                  disabled={suggesting || !selectedTemplateId}
                  className="btn btn-secondary border-indigo-200 text-indigo-700 bg-indigo-50 flex items-center gap-2"
                >
                  {suggesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  AI Suggest Mappings
                </button>
              </div>
              <button onClick={() => setShowPicker(false)} className="btn btn-ghost"><X className="w-5 h-5" /></button>
            </div>
            
            {/* Live Preview Bar */}
            <div className="flex gap-3 overflow-x-auto pb-2">
              {Object.entries(selectorMap).map(([field, selector]) => {
                const preview = previews[field];
                const isImage = preview && (typeof preview === 'string') && (preview.startsWith('http') || preview.startsWith('/') || preview.match(/\.(jpg|jpeg|png|webp|gif|svg)/i));
                const isVideo = preview && (typeof preview === 'string') && (preview.match(/\.(mp4|webm|ogg|mov)/i));
                
                return (
                  <div key={field} className="flex flex-col gap-1 min-w-[120px] max-w-[200px] bg-gray-50 border rounded p-2">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold uppercase text-gray-400">{field}</span>
                      <button onClick={() => setSelectorMap(prev => { const n = {...prev}; delete n[field]; return n; })} className="text-gray-300 hover:text-red-500">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                    {preview ? (
                      isImage ? (
                        <img src={preview} alt="" className="h-12 w-full object-cover rounded border bg-white" />
                      ) : isVideo ? (
                        <video src={preview} className="h-12 w-full object-cover rounded border bg-white" muted />
                      ) : (
                        <div className="text-[10px] text-gray-600 line-clamp-2 h-12 bg-white p-1 rounded border overflow-hidden text-ellipsis">
                          {String(preview).replace(/<[^>]*>/g, '')}
                        </div>
                      )
                    ) : (
                      <div className="h-12 flex items-center justify-center border border-dashed rounded text-[9px] text-gray-300 bg-white italic">
                        Not mapped
                      </div>
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
