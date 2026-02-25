import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../lib/api';
import { toast } from 'sonner';
import {
  Globe,
  Loader2,
  CheckCircle2,
  Layers,
  Sparkles,
  Search,
  Trash2,
  Code,
  Zap,
  Cpu,
  RefreshCw,
  ChevronRight,
  Database,
  Heart,
  Monitor,
  X,
  AlertCircle
} from 'lucide-react';

export default function LovableImporter() {
  const [url, setUrl] = useState('');
  const [nuke, setNuke] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sites, setSites] = useState([]);
  const [selectedSite, setSelectedSite] = useState(null);
  const [stagedItems, setStagedItems] = useState([]);
  const [view, setView] = useState('overview');
  const [isStarting, setIsStarting] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState(new Set());
  const lastActionRef = useRef({});

  useEffect(() => {
    loadSites();
  }, []);

  const toggleGroup = (hash) => {
    const next = new Set(expandedGroups);
    if (next.has(hash)) next.delete(hash);
    else next.add(hash);
    setExpandedGroups(next);
  };

  const loadSites = async () => {
    try {
      const data = await api.get('/import-lovable/sites');
      setSites(data || []);
      const actions = {};
      data?.forEach(s => { if (s.last_action) actions[s.id] = s.last_action; });
      lastActionRef.current = actions;
    } catch (err) {
      console.error('Failed to load sites:', err);
    } finally {
      setLoading(false);
    }
  };

  const refreshSite = useCallback(async () => {
    if (!selectedSite) return;
    try {
      const updated = await api.get(`/import-lovable/sites/${selectedSite.id}`);
      if (updated) {
        if (updated.last_action && updated.last_action !== lastActionRef.current[updated.id]) {
          if (updated.status === 'completed') toast.success(updated.last_action);
          else if (updated.status === 'failed') toast.error(updated.last_action);
          else toast.info(updated.last_action);
          lastActionRef.current[updated.id] = updated.last_action;
        }
        setSelectedSite(updated);
        if (view === 'staged') {
          const items = await api.get(`/import-lovable/sites/${selectedSite.id}/staged`);
          setStagedItems(items || []);
        }
      }
    } catch (err) {
      console.error('Refresh failed:', err);
    }
  }, [selectedSite, view]);

  useEffect(() => {
    const activeStatuses = ['pending', 'rendering', 'sanitizing', 'generating_rules', 'generating_templates', 'transforming', 'nuking'];
    const interval = setInterval(() => {
      if (selectedSite && activeStatuses.includes(selectedSite.status)) {
        refreshSite();
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [refreshSite, selectedSite]);

  const handleStartImport = async (e) => {
    e.preventDefault();
    if (!url) return;
    setIsStarting(true);
    try {
      const res = await api.post('/import-lovable', { url, config: { nuke } });
      if (res.success) {
        setUrl('');
        loadSites();
        const newSite = await api.get(`/import-lovable/sites/${res.site_id}`);
        setSelectedSite(newSite);
      }
    } catch (err) {
      toast.error('Failed to start import: ' + err.message);
    } finally {
      setIsStarting(false);
    }
  };

  const selectSite = async (site) => {
    setSelectedSite(site);
    setView('overview');
    try {
      const items = await api.get(`/import-lovable/sites/${site.id}/staged`);
      setStagedItems(items || []);
    } catch (err) {
      console.error('Failed to load items:', err);
    }
  };

  const triggerTransform = async () => {
    if (!selectedSite) return;
    if (!confirm('This will use the AI rules to migrate all staged content into your CMS tables. Continue?')) return;
    setIsFinalizing(true);
    try {
      await api.post(`/import-lovable/sites/${selectedSite.id}/transform`);
      toast.success('Migration started in background...');
      refreshSite();
    } catch (err) {
      toast.error('Transformation failed: ' + err.message);
    } finally {
      setIsFinalizing(false);
    }
  };

  const handleStopImport = async () => {
    if (!selectedSite) return;
    try {
      await api.post(`/import-lovable/sites/${selectedSite.id}/stop`);
      toast.info('Import stopped');
      refreshSite();
    } catch (err) {
      toast.error('Failed to stop: ' + err.message);
    }
  };

  const handleDeleteSite = async (id) => {
    if (!confirm('Delete this import and all staged content?')) return;
    try {
      await api.delete(`/import-lovable/sites/${id}`);
      if (selectedSite?.id === id) setSelectedSite(null);
      loadSites();
    } catch (err) {
      toast.error('Delete failed: ' + err.message);
    }
  };

  const activeStatuses = ['pending', 'rendering', 'sanitizing', 'generating_rules', 'generating_templates', 'transforming', 'nuking'];
  const isActive = selectedSite && activeStatuses.includes(selectedSite.status);

  const statusLabel = (status) => {
    const map = {
      pending: 'Pending',
      cloning: 'Cloning Repository',
      analyzing: 'Analyzing Source',
      generating_rules: 'Mapping Components',
      generating_templates: 'Generating Templates',
      ready: 'Ready',
      transforming: 'Migrating',
      completed: 'Completed',
      failed: 'Failed',
      cancelled: 'Cancelled'
    };
    return map[status] || status;
  };

  const statusColor = (status) => {
    if (status === 'completed') return 'bg-green-100 text-green-700';
    if (status === 'failed') return 'bg-red-100 text-red-700';
    if (status === 'cancelled') return 'bg-gray-100 text-gray-500';
    if (status === 'ready') return 'bg-emerald-100 text-emerald-700';
    return 'bg-pink-100 text-pink-700';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Heart className="w-6 h-6 text-pink-500 fill-pink-500" />
            Lovable Import
          </h1>
          <p className="text-sm text-gray-500">Import Lovable Git Repositories as base themes</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar */}
        <div className="lg:col-span-1 space-y-6">
          <div className="card p-4">
            <h2 className="font-semibold mb-4 text-sm uppercase tracking-wider text-gray-500">New Source Import</h2>
            <form onSubmit={handleStartImport} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Git Repository URL</label>
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://github.com/user/project.git"
                  className="input text-sm"
                  required
                />
                <p className="text-[9px] text-gray-400 mt-1 leading-tight">
                  Public HTTPS URL recommended.
                </p>
              </div>
              <button
                type="submit"
                disabled={isStarting}
                className="btn btn-primary w-full flex items-center justify-center gap-2 bg-pink-600 hover:bg-pink-700 border-none"
              >
                {isStarting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
                Clone & Convert
              </button>
            </form>
          </div>

          <div className="card overflow-hidden">
            <div className="p-3 bg-gray-50 border-b font-bold text-[10px] uppercase text-gray-500 flex justify-between items-center">
              <span>Import History</span>
              <button onClick={loadSites} className="hover:text-primary-600 transition-colors">
                <RefreshCw className="w-3 h-3" />
              </button>
            </div>
            <div className="divide-y max-h-[600px] overflow-y-auto">
              {sites.map(site => (
                <div
                  key={site.id}
                  className={`group relative flex items-center justify-between hover:bg-gray-50 ${selectedSite?.id === site.id ? 'bg-pink-50/50 border-l-4 border-pink-500' : ''}`}
                >
                  <button
                    onClick={() => selectSite(site)}
                    className="flex-1 text-left p-3 min-w-0"
                  >
                    <div className="font-medium text-sm truncate">{site.root_url.replace(/^https?:\/\//, '')}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${statusColor(site.status)}`}>
                        {statusLabel(site.status)}
                      </span>
                      <span className="text-[10px] text-gray-400">{site.page_count} pages</span>
                    </div>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteSite(site.id); }}
                    className="p-2 mr-2 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {sites.length === 0 && !loading && (
                <div className="p-6 text-center text-gray-400 text-xs italic">No imports yet</div>
              )}
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="lg:col-span-3">
          {!selectedSite ? (
            <div className="card h-[600px] flex flex-col items-center justify-center p-12 text-gray-400 border-dashed border-2">
              <div className="bg-pink-50 p-6 rounded-full mb-6">
                <Heart className="w-12 h-12 text-pink-200" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">No Site Selected</h3>
              <p className="max-w-xs text-center text-sm">
                Enter a deployed Lovable URL to import it as a base theme, or select an existing import from the history.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Status Bar */}
              <div className="card p-4 flex items-center justify-between bg-white border-l-4 border-pink-500 shadow-sm">
                <div className="flex items-center gap-4">
                  <div className="bg-pink-100 p-2 rounded-lg">
                    <Globe className="w-5 h-5 text-pink-600" />
                  </div>
                  <div>
                    <h2 className="font-bold text-lg">{selectedSite.root_url}</h2>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${statusColor(selectedSite.status)}`}>
                        {statusLabel(selectedSite.status)}
                      </span>
                      <span className="text-xs font-medium text-gray-500">{selectedSite.page_count} pages</span>
                      {selectedSite.last_action && (
                        <>
                          <span className="text-xs text-gray-300">|</span>
                          <span className="text-xs text-gray-400 italic">{selectedSite.last_action}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex bg-gray-100 p-1 rounded-lg mr-4">
                    <button
                      onClick={() => setView('overview')}
                      className={`px-4 py-1.5 text-xs font-bold rounded-md flex items-center gap-2 transition-all ${view === 'overview' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                      <Layers className="w-3.5 h-3.5" /> OVERVIEW
                    </button>
                    <button
                      onClick={() => { setView('staged'); }}
                      className={`px-4 py-1.5 text-xs font-bold rounded-md flex items-center gap-2 transition-all ${view === 'staged' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                      <Database className="w-3.5 h-3.5" /> STAGED ITEMS
                    </button>
                  </div>

                  {isActive && (
                    <button onClick={handleStopImport} className="btn btn-sm bg-gray-100 hover:bg-red-50 text-gray-600 hover:text-red-600 border flex items-center gap-1.5">
                      <X className="w-3.5 h-3.5" /> Stop
                    </button>
                  )}

                  {selectedSite.llm_ruleset && (selectedSite.status === 'ready' || selectedSite.status === 'completed') && (
                    <button
                      onClick={triggerTransform}
                      disabled={isFinalizing}
                      className="btn btn-primary btn-sm flex items-center gap-2"
                    >
                      {isFinalizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                      {selectedSite.status === 'completed' ? 'Re-Migrate' : 'Finalize & Migrate'}
                    </button>
                  )}
                </div>
              </div>

              {view === 'overview' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Pipeline Progress */}
                  <div className="card overflow-hidden">
                    <div className="p-4 bg-gray-50 border-b flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-gray-500" />
                      <h3 className="font-bold text-xs uppercase tracking-wider text-gray-600">Import Pipeline</h3>
                    </div>
                    <div className="p-4">
                      <PipelineStep status={selectedSite.status} step="rendering" label="SPA Rendering" description="Headless browser captures rendered React pages" />
                      <PipelineStep status={selectedSite.status} step="sanitizing" label="HTML Sanitization" description="Strips Tailwind classes and React artifacts" />
                      <PipelineStep status={selectedSite.status} step="generating_rules" label="AI Analysis" description="Detects page types and content selectors" />
                      <PipelineStep status={selectedSite.status} step="generating_templates" label="Template Generation" description="Creates Nunjucks templates from structure" />
                      <PipelineStep status={selectedSite.status} step="ready" label="Ready for Migration" description="Templates ready — finalize to create CMS content" last />
                    </div>
                  </div>

                  {/* Ruleset Info */}
                  <div className="card overflow-hidden">
                    <div className="p-4 bg-gray-50 border-b flex items-center gap-2">
                      <Code className="w-4 h-4 text-gray-500" />
                      <h3 className="font-bold text-xs uppercase tracking-wider text-gray-600">LLM Extraction Rules</h3>
                    </div>
                    <div className="p-4">
                      {selectedSite.llm_ruleset ? (
                        <div className="space-y-4">
                          {selectedSite.llm_ruleset.discovery_info && (
                            <div className="text-xs text-gray-600 leading-relaxed bg-pink-50 p-3 rounded border border-pink-100 italic">
                              "{selectedSite.llm_ruleset.discovery_info}"
                            </div>
                          )}
                          <div className="space-y-2">
                            <h4 className="text-[10px] font-bold text-gray-400 uppercase">Structural Groups</h4>
                            <div className="divide-y border rounded overflow-hidden">
                              {Object.entries(selectedSite.llm_ruleset.types || {}).map(([hash, type]) => (
                                <div key={hash} className="group">
                                  <div
                                    className="p-3 hover:bg-gray-50 flex items-center justify-between cursor-pointer"
                                    onClick={() => toggleGroup(hash)}
                                  >
                                    <div>
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs font-bold text-gray-800 uppercase">{type.page_type}</span>
                                        <span className="text-[10px] font-mono text-gray-400">#{hash.substring(0, 8)}</span>
                                      </div>
                                      <div className="text-[10px] text-gray-400 truncate max-w-[200px] mt-0.5">{type.summary}</div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-[10px] font-bold text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full">{Math.round(type.confidence * 100)}%</span>
                                      {type.template_id && <Layers className="w-3.5 h-3.5 text-blue-500" title="Template Generated" />}
                                      <ChevronRight className={`w-4 h-4 text-gray-300 transition-transform ${expandedGroups.has(hash) ? 'rotate-90' : ''}`} />
                                    </div>
                                  </div>

                                  {expandedGroups.has(hash) && (
                                    <div className="bg-gray-50 p-3 border-t border-gray-100">
                                      <h5 className="text-[9px] font-bold text-gray-400 uppercase mb-2">Selector Mapping</h5>
                                      <div className="space-y-3">
                                        {type.regions?.map((region) => (
                                          <div key={region.key} className="space-y-1">
                                            <div className="flex items-start gap-2 text-[10px]">
                                              <span className="font-bold text-primary-700 min-w-[80px] mt-0.5">{region.label}:</span>
                                              <div className="flex-1">
                                                <div className="flex items-center justify-between">
                                                  <code className="bg-white border rounded px-1.5 py-0.5 text-gray-600 font-mono text-[9px]">
                                                    {region.selector}
                                                  </code>
                                                  {region.validation && (
                                                    <div className="flex gap-2">
                                                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                                                        region.validation.success_rate === 1 ? 'bg-green-100 text-green-700' :
                                                        region.validation.success_rate === 0 ? 'bg-red-100 text-red-700' :
                                                        'bg-amber-100 text-amber-700'
                                                      }`}>
                                                        {Math.round(region.validation.success_rate * 100)}% match
                                                      </span>
                                                      <span className="text-[9px] font-bold px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded-full" title="Semantic Density Score">
                                                        Density: {region.validation.density_score}
                                                      </span>
                                                      {region.validation.is_low_density && (
                                                        <span className="text-[9px] font-bold px-1.5 py-0.5 bg-red-100 text-red-700 rounded-full flex items-center gap-1">
                                                          <AlertCircle className="w-2.5 h-2.5" /> Low Content
                                                        </span>
                                                      )}
                                                    </div>
                                                  )}
                                                </div>
                                                {region.validation?.failed_urls?.length > 0 && (
                                                  <div className="mt-1 p-1.5 bg-red-50 border border-red-100 rounded text-[8px] text-red-600">
                                                    <div className="font-bold uppercase mb-0.5 flex items-center gap-1">
                                                      <AlertCircle className="w-2.5 h-2.5" /> FAILED ON {region.validation.failed_urls.length}/{region.validation.total_checked || region.validation.failed_urls.length} SAMPLES:
                                                    </div>
                                                    <ul className="list-disc pl-3 max-h-20 overflow-y-auto">
                                                      {region.validation.failed_urls.map((url, i) => (
                                                        <li key={i} className="truncate">{url}</li>
                                                      ))}
                                                    </ul>
                                                  </div>
                                                )}
                                              </div>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                      {type.is_duplicate && (
                                        <div className="mt-3 flex items-center gap-1.5 text-[9px] text-pink-600 font-medium bg-pink-50 p-1.5 rounded border border-pink-100">
                                          <RefreshCw className="w-3 h-3" />
                                          Deduplicated: Shared template used.
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="p-8 text-center text-gray-400 italic text-sm">
                          Rules will be generated after rendering and sanitization.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {view === 'staged' && (
                <div className="card overflow-hidden">
                  <div className="p-4 bg-gray-50 border-b flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Database className="w-4 h-4 text-gray-500" />
                      <h3 className="font-bold text-xs uppercase tracking-wider text-gray-600">Staged Pages</h3>
                    </div>
                    <span className="text-[10px] text-gray-400">{stagedItems.length} items</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b">
                          <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-400 uppercase">Type</th>
                          <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-400 uppercase">Title & URL</th>
                          <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-400 uppercase">Hash</th>
                          <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-400 uppercase">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {stagedItems.map(item => (
                          <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3">
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${
                                item.item_type === 'product' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                              }`}>
                                {item.item_type}
                              </span>
                            </td>
                            <td className="px-4 py-3 min-w-0">
                              <div className="font-medium text-gray-900 truncate max-w-md">{item.title || 'Untitled'}</div>
                              <div className="text-[10px] text-gray-400 truncate max-w-md mt-0.5">{item.url}</div>
                            </td>
                            <td className="px-4 py-3">
                              {item.structural_hash ? (
                                <code className="text-[10px] bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">{item.structural_hash.substring(0, 12)}...</code>
                              ) : (
                                <span className="text-[10px] text-gray-300">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1.5">
                                {item.status === 'transformed' ? (
                                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                                ) : item.status === 'crawled' ? (
                                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                                ) : item.status === 'rendered' ? (
                                  <div className="w-2 h-2 rounded-full bg-purple-500" />
                                ) : (
                                  <div className="w-2 h-2 rounded-full bg-gray-300" />
                                )}
                                <span className="text-[10px] font-bold uppercase text-gray-500">{item.status}</span>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {stagedItems.length === 0 && (
                          <tr>
                            <td colSpan="4" className="p-12 text-center text-gray-400 italic text-sm">
                              No pages staged yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Pipeline step indicator component
 */
function PipelineStep({ status, step, label, description, last = false }) {
  const stepOrder = ['rendering', 'sanitizing', 'generating_rules', 'generating_templates', 'ready'];
  const currentIdx = stepOrder.indexOf(status);
  const stepIdx = stepOrder.indexOf(step);

  // Determine state
  let state = 'pending';
  if (status === 'completed' || status === 'ready') {
    state = stepIdx <= stepOrder.indexOf('ready') ? 'done' : 'pending';
    if (step === 'ready' && status === 'ready') state = 'done';
  } else if (status === 'failed' || status === 'cancelled') {
    state = stepIdx < currentIdx ? 'done' : stepIdx === currentIdx ? 'failed' : 'pending';
  } else if (currentIdx >= 0) {
    if (stepIdx < currentIdx) state = 'done';
    else if (stepIdx === currentIdx) state = 'active';
  }

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border-2 ${
          state === 'done' ? 'bg-green-500 border-green-500 text-white' :
          state === 'active' ? 'bg-pink-500 border-pink-500 text-white animate-pulse' :
          state === 'failed' ? 'bg-red-500 border-red-500 text-white' :
          'bg-gray-100 border-gray-200 text-gray-400'
        }`}>
          {state === 'done' ? '✓' : state === 'active' ? '...' : state === 'failed' ? '!' : ''}
        </div>
        {!last && <div className={`w-0.5 h-8 ${state === 'done' ? 'bg-green-300' : 'bg-gray-200'}`} />}
      </div>
      <div className={`pb-6 ${last ? '' : ''}`}>
        <div className={`text-sm font-bold ${state === 'active' ? 'text-pink-600' : state === 'done' ? 'text-green-700' : 'text-gray-500'}`}>
          {label}
        </div>
        <div className="text-[10px] text-gray-400 mt-0.5">{description}</div>
      </div>
    </div>
  );
}
