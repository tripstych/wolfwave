import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../lib/api';
import { toast } from 'sonner';
import {
  Globe,
  Loader2,
  CheckCircle2,
  AlertCircle,
  BarChart2,
  ArrowRight,
  Database,
  Layers,
  Sparkles,
  Search,
  FileText,
  Trash2,
  X,
  Code,
  Zap,
  Cpu,
  RefreshCw
} from 'lucide-react';

export default function SiteImporterV2() {
  const [url, setUrl] = useState('');
  const [maxPages, setMaxPages] = useState(500);
  const [loading, setLoading] = useState(true);
  const [sites, setSites] = useState([]);
  const [selectedSite, setSelectedSite] = useState(null);
  const [stagedItems, setStagedItems] = useState([]);
  const [view, setView] = useState('overview'); // overview | staged
  const [isStarting, setIsStarting] = useState(false);
  const lastActionRef = useRef({}); // Track last action per site to avoid duplicate toasts

  useEffect(() => {
    loadSites();
  }, []);

  const loadSites = async () => {
    try {
      const data = await api.get('/import-v2/sites');
      setSites(data || []);
      
      // Update lastActionRef with current actions to prevent initial toasts
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
      const updated = await api.get(`/import-v2/sites/${selectedSite.id}`);
      if (updated) {
        // Handle Toast Notification
        if (updated.last_action && updated.last_action !== lastActionRef.current[updated.id]) {
          if (updated.status === 'completed') {
            toast.success(updated.last_action);
          } else if (updated.status === 'failed') {
            toast.error(updated.last_action);
          } else {
            toast.info(updated.last_action);
          }
          lastActionRef.current[updated.id] = updated.last_action;
        }

        setSelectedSite(updated);
        if (view === 'staged') {
          const items = await api.get(`/import-v2/sites/${selectedSite.id}/staged`);
          setStagedItems(items || []);
        }
      }
    } catch (err) {
      console.error('Refresh failed:', err);
    }
  }, [selectedSite, view]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (selectedSite && (selectedSite.status === 'pending' || selectedSite.status === 'crawling' || selectedSite.status === 'analyzing')) {
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
      const res = await api.post('/import-v2', { url, config: { maxPages: parseInt(maxPages) } });
      if (res.success) {
        setUrl('');
        loadSites();
        const newSite = await api.get(`/import-v2/sites/${res.site_id}`);
        setSelectedSite(newSite);
      }
    } catch (err) {
      alert('Failed to start import: ' + err.message);
    } finally {
      setIsStarting(false);
    }
  };

  const selectSite = async (site) => {
    setSelectedSite(site);
    setView('overview');
    try {
      const items = await api.get(`/import-v2/sites/${site.id}/staged`);
      setStagedItems(items || []);
    } catch (err) {
      console.error('Failed to load items:', err);
    }
  };

  const triggerRuleGen = async () => {
    if (!selectedSite) return;
    try {
      await api.post(`/import-v2/sites/${selectedSite.id}/generate-rules`);
      refreshSite();
    } catch (err) {
      alert('Rule generation failed: ' + err.message);
    }
  };

  const handleDeleteSite = async (id) => {
    if (!confirm('Are you sure you want to delete this site and all its staged content?')) return;
    try {
      await api.delete(`/import/sites/${id}`);
      if (selectedSite?.id === id) setSelectedSite(null);
      loadSites();
    } catch (err) {
      alert('Delete failed: ' + err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Zap className="w-6 h-6 text-amber-500 fill-amber-500" />
            WolfImporter V2
          </h1>
          <p className="text-sm text-gray-500">Autonomous AI-powered theme and site migration</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar: New Import + History */}
        <div className="lg:col-span-1 space-y-6">
          <div className="card p-4">
            <h2 className="font-semibold mb-4 text-sm uppercase tracking-wider text-gray-500">Start New Import</h2>
            <form onSubmit={handleStartImport} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Website URL</label>
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="input text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Max Pages to Crawl</label>
                <input
                  type="number"
                  value={maxPages}
                  onChange={(e) => setMaxPages(e.target.value)}
                  className="input text-sm"
                  min="1"
                  max="5000"
                />
              </div>
              <button
                type="submit"
                disabled={isStarting}
                className="btn btn-primary w-full flex items-center justify-center gap-2"
              >
                {isStarting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Autopilot Import
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
                  className={`group relative flex items-center justify-between hover:bg-gray-50 ${selectedSite?.id === site.id ? 'bg-amber-50/50 border-l-4 border-amber-500' : ''}`}
                >
                  <button 
                    onClick={() => selectSite(site)}
                    className="flex-1 text-left p-3 min-w-0"
                  >
                    <div className="font-medium text-sm truncate">{site.root_url.replace(/^https?:\/\//, '')}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${
                        site.status === 'completed' ? 'bg-green-100 text-green-700' :
                        site.status === 'failed' ? 'bg-red-100 text-red-700' :
                        'bg-blue-100 text-blue-700'
                      }`}>
                        {site.status}
                      </span>
                      <span className="text-[10px] text-gray-400">{site.page_count} items</span>
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
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="lg:col-span-3">
          {!selectedSite ? (
            <div className="card h-[600px] flex flex-col items-center justify-center p-12 text-gray-400 border-dashed border-2">
              <div className="bg-amber-50 p-6 rounded-full mb-6">
                <Cpu className="w-12 h-12 text-amber-200" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">No Site Selected</h3>
              <p className="max-w-xs text-center text-sm">
                Enter a URL on the left to start the AI-powered extraction process or select an existing import to view its status.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Top Status Bar */}
              <div className="card p-4 flex items-center justify-between bg-white border-l-4 border-amber-500 shadow-sm">
                <div className="flex items-center gap-4">
                  <div className="bg-amber-100 p-2 rounded-lg">
                    <Globe className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <h2 className="font-bold text-lg">{selectedSite.root_url}</h2>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs font-medium text-gray-500">ID: {selectedSite.id}</span>
                      <span className="text-xs font-medium text-gray-500">•</span>
                      <span className="text-xs font-medium text-gray-500">Created: {new Date(selectedSite.created_at).toLocaleDateString()}</span>
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
                      onClick={() => setView('staged')} 
                      className={`px-4 py-1.5 text-xs font-bold rounded-md flex items-center gap-2 transition-all ${view === 'staged' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                      <Database className="w-3.5 h-3.5" /> STAGED ITEMS
                    </button>
                  </div>
                  {selectedSite.status === 'crawled' && (
                    <button onClick={triggerRuleGen} className="btn btn-primary btn-sm bg-amber-500 hover:bg-amber-600 border-none">
                      Generate Rules
                    </button>
                  )}
                </div>
              </div>

              {view === 'overview' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Platform Info */}
                  <div className="card overflow-hidden">
                    <div className="p-4 bg-gray-50 border-b flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-gray-500" />
                      <h3 className="font-bold text-xs uppercase tracking-wider text-gray-600">AI Platform Analysis</h3>
                    </div>
                    <div className="p-4 space-y-4">
                      {selectedSite.platform_info ? (
                        <>
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-500">Detected Platform</span>
                            <span className="text-sm font-bold text-primary-600 uppercase bg-primary-50 px-2 py-0.5 rounded">{selectedSite.platform_info.platform}</span>
                          </div>
                          {selectedSite.platform_info.theme_name && (
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-gray-500">Theme</span>
                              <span className="text-sm font-medium">{selectedSite.platform_info.theme_name}</span>
                            </div>
                          )}
                          <div className="pt-2">
                            <h4 className="text-[10px] font-bold text-gray-400 uppercase mb-2">Color Palette</h4>
                            <div className="flex gap-2">
                              {selectedSite.platform_info.color_palette?.map((color, i) => (
                                <div key={i} className="w-8 h-8 rounded border shadow-sm" style={{ backgroundColor: color }} title={color} />
                              ))}
                            </div>
                          </div>
                          <div className="pt-2">
                            <h4 className="text-[10px] font-bold text-gray-400 uppercase mb-2">Detected Fonts</h4>
                            <div className="flex flex-wrap gap-2">
                              {selectedSite.platform_info.fonts?.map((font, i) => (
                                <span key={i} className="text-xs bg-gray-100 px-2 py-1 rounded border">{font}</span>
                              ))}
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="p-8 text-center text-gray-400 italic text-sm">
                          Analysis pending...
                        </div>
                      )}
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
                          <div className="text-xs text-gray-600 leading-relaxed bg-amber-50 p-3 rounded border border-amber-100 italic">
                            "{selectedSite.llm_ruleset.discovery_info}"
                          </div>
                          <div className="space-y-2">
                            <h4 className="text-[10px] font-bold text-gray-400 uppercase">Structural Groups</h4>
                            <div className="divide-y border rounded overflow-hidden">
                              {Object.entries(selectedSite.llm_ruleset.types || {}).map(([hash, type]) => (
                                <div key={hash} className="p-3 hover:bg-gray-50 flex items-center justify-between">
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-bold text-gray-800 uppercase">{type.page_type}</span>
                                      <span className="text-[10px] font-mono text-gray-400">#{hash.substring(0,8)}</span>
                                    </div>
                                    <div className="text-[10px] text-gray-400 truncate max-w-[200px] mt-0.5">{type.summary}</div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-bold text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full">{Math.round(type.confidence * 100)}%</span>
                                    {type.template_id && <Layers className="w-3.5 h-3.5 text-blue-500" title="Template Generated" />}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="p-8 text-center text-gray-400 italic text-sm">
                          Ruleset will be generated after crawling.
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
                      <h3 className="font-bold text-xs uppercase tracking-wider text-gray-600">Discovered Content</h3>
                    </div>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
                      <input type="text" placeholder="Search items..." className="input py-1 pl-8 text-xs w-48" />
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b">
                          <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-400 uppercase">Type</th>
                          <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-400 uppercase">Title & URL</th>
                          <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-400 uppercase">Structural Hash</th>
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
                              <code className="text-[10px] bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">{item.structural_hash?.substring(0, 12)}...</code>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1.5">
                                {item.status === 'transformed' ? (
                                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                                ) : item.status === 'crawled' ? (
                                  <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
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
                              No items staged yet.
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
