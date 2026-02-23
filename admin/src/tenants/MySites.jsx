import { useState, useEffect } from 'react';
import api from '../lib/api';
import { 
  Globe, 
  Plus, 
  Loader2, 
  ExternalLink, 
  LogIn, 
  ShieldCheck,
  AlertCircle,
  CheckCircle2
} from 'lucide-react';
import { toast } from 'sonner';

export default function MySites() {
  const [sites, setSites] = useState([]);
  const [limits, setLimits] = useState(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [noCustomer, setNoCustomer] = useState(false);
  const [newSite, setNewSite] = useState({ name: '', subdomain: '' });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [sitesData, limitsData] = await Promise.all([
        api.get('/customer-tenants'),
        api.get('/customer-tenants/limits')
      ]);
      setSites(sitesData || []);
      setLimits(limitsData);
      setNoCustomer(!!limitsData?.no_customer);
    } catch (err) {
      console.error('Failed to load sites:', err);
      toast.error('Failed to load your sites');
    } finally {
      setLoading(false);
    }
  };

  const getTenantUrl = (subdomain) => {
    const host = window.location.hostname;
    const protocol = window.location.protocol;
    if (host === 'localhost') {
      return `${protocol}//${subdomain}.localhost:3000`;
    }
    const parts = host.split('.');
    if (parts.length > 2) parts.shift();
    return `${protocol}//${subdomain}.${parts.join('.')}`;
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newSite.name || !newSite.subdomain) return;

    try {
      setCreating(true);
      await api.post('/customer-tenants', newSite);
      toast.success('Site launched successfully!');
      setNewSite({ name: '', subdomain: '' });
      setShowCreate(false);
      loadData();
    } catch (err) {
      toast.error(err.message || 'Failed to create site');
    } finally {
      setCreating(false);
    }
  };

  const handleLoginAs = async (site) => {
    try {
      const { token } = await api.post(`/customer-tenants/${site.id}/impersonate`);
      const baseUrl = getTenantUrl(site.subdomain);
      window.open(`${baseUrl}/api/auth/impersonate?token=${token}`, '_blank');
    } catch (err) {
      console.error('Login error:', err);
      toast.error('Failed to log into site');
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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Globe className="w-6 h-6 text-primary-600" />
            My Sites
          </h1>
          <p className="text-sm text-gray-500">Manage and launch your personal WolfWave sites.</p>
        </div>
        {limits?.can_create && !noCustomer && (
          <button 
            onClick={() => setShowCreate(!showCreate)} 
            className="btn btn-primary"
          >
            <Plus className="w-4 h-4 mr-2" />
            Launch New Site
          </button>
        )}
      </div>

      {/* Limits Overview or No Customer Blurb */}
      {noCustomer ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-8 text-center space-y-4">
          <div className="mx-auto w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center text-amber-600">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div className="max-w-md mx-auto">
            <h2 className="text-lg font-bold text-amber-900">No Active License Found</h2>
            <p className="text-sm text-amber-700 mt-2">
              This site is not currently linked to a global customer profile. To launch additional sites or manage a network, you'll need an active subscription license.
            </p>
          </div>
          <div className="flex justify-center gap-3 pt-2">
            <a href="/subscribe" target="_blank" className="btn btn-primary bg-amber-600 border-amber-600 hover:bg-amber-700">View Plans</a>
            <button onClick={loadData} className="btn btn-secondary">Refresh Status</button>
          </div>
        </div>
      ) : limits && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-50 rounded-lg text-primary-600">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase text-gray-400 tracking-wider">Plan: {limits.plan_name}</p>
              <p className="text-sm font-medium text-gray-900">
                You have used <strong>{limits.used}</strong> of your <strong>{limits.limit}</strong> available sites.
              </p>
            </div>
          </div>
          {!limits.can_create && (
            <div className="flex items-center gap-2 text-amber-600 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-100 text-xs font-medium">
              <AlertCircle className="w-4 h-4" />
              Limit reached
            </div>
          )}
        </div>
      )}

      {showCreate && (
        <div className="card p-6 bg-primary-50/30 border-primary-100 animate-in fade-in slide-in-from-top-4 duration-200">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Launch New Site</h2>
          <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase text-gray-500">Site Name</label>
              <input
                type="text"
                value={newSite.name}
                onChange={(e) => setNewSite({ ...newSite, name: e.target.value })}
                placeholder="My Store"
                className="input"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase text-gray-500">Subdomain</label>
              <div className="flex items-center">
                <input
                  type="text"
                  value={newSite.subdomain}
                  onChange={(e) => setNewSite({ ...newSite, subdomain: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                  placeholder="my-store"
                  className="input rounded-r-none"
                  required
                />
                <span className="bg-gray-100 border border-l-0 border-gray-300 px-3 py-2 rounded-r-md text-sm text-gray-500">.wolfwave.com</span>
              </div>
            </div>
            <div className="md:col-span-2 flex justify-end gap-2 mt-2">
              <button type="button" className="btn btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={creating}>
                {creating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                Launch Site
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {sites.length === 0 ? (
          <div className="col-span-full card p-12 text-center text-gray-400 border-dashed border-2">
            <Globe className="w-12 h-12 mx-auto mb-4 opacity-10" />
            <p>You haven't created any sites yet.</p>
            {limits?.can_create && (
              <button onClick={() => setShowCreate(true)} className="text-primary-600 text-sm mt-2 hover:underline">Launch your first site now</button>
            )}
          </div>
        ) : (
          sites.map(site => (
            <div key={site.id} className={`card overflow-hidden hover:border-primary-300 transition-all group ${site.status !== 'active' ? 'opacity-75' : ''}`}>
              <div className={`h-2 ${site.status === 'active' ? 'bg-primary-500' : 'bg-amber-400'}`} />
              <div className="p-5">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-bold text-lg text-gray-900 group-hover:text-primary-600 transition-colors line-clamp-1">{site.name}</h3>
                    <p className="text-xs font-mono text-gray-500 mt-0.5">{site.subdomain}.wolfwave.com</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                    site.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {site.status}
                  </span>
                </div>

                <div className="flex gap-2 mt-6 pt-4 border-t border-gray-50">
                  <a 
                    href={getTenantUrl(site.subdomain)} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="btn btn-secondary flex-1 py-1.5 text-xs flex items-center justify-center gap-1.5"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Visit
                  </a>
                  <a 
                    href={`${getTenantUrl(site.subdomain)}/admin/`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    onClick={(e) => {
                      e.preventDefault();
                      handleLoginAs(site);
                    }}
                    className="btn btn-primary flex-1 py-1.5 text-xs flex items-center justify-center gap-1.5"
                  >
                    <LogIn className="w-3.5 h-3.5" /> Admin
                  </a>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
