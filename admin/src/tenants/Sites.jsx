import { useState, useEffect } from 'react';
import { 
  Plus, 
  Trash2, 
  Pause, 
  Play, 
  ExternalLink, 
  Globe, 
  LogIn, 
  LayoutGrid, 
  List, 
  Search,
  MoreVertical,
  Shield,
  Loader2,
  AlertCircle
} from 'lucide-react';
import api from '../lib/api';
import { toast } from 'sonner';
import DataTable from '../components/DataTable';

export default function Sites() {
  const [view, setView] = useState('grid'); // 'grid' or 'table'
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  
  // New Tenant Form
  const [newTenant, setNewTenant] = useState({ name: '', subdomain: '', email: 'admin@example.com', password: '' });
  const [subdomainEdited, setSubdomainEdited] = useState(false);

  useEffect(() => {
    loadTenants();
  }, [refreshKey]);

  const loadTenants = async () => {
    try {
      setLoading(true);
      const res = await api.get('/tenants');
      setTenants(res.data || []);
    } catch (err) {
      console.error('Failed to load tenants:', err);
      setError('Failed to load sites');
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

  const autoSubdomain = (name) =>
    name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      setCreating(true);
      setError(null);
      await api.post('/tenants', newTenant);
      setNewTenant({ name: '', subdomain: '', email: 'admin@example.com', password: '' });
      setSubdomainEdited(false);
      setShowCreate(false);
      setRefreshKey(k => k + 1);
      toast.success('Site launched successfully!');
    } catch (err) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleStatusToggle = async (tenant) => {
    try {
      const newStatus = tenant.status === 'active' ? 'suspended' : 'active';
      await api.put(`/tenants/${tenant.id}/status`, { status: newStatus });
      setRefreshKey(k => k + 1);
      toast.success(`Site ${newStatus === 'active' ? 'activated' : 'suspended'}`);
    } catch (err) {
      toast.error('Failed to update status');
    }
  };

  const handleLoginAs = async (tenant) => {
    try {
      const { token } = await api.post(`/tenants/${tenant.id}/impersonate`);
      const baseUrl = getTenantUrl(tenant.subdomain);
      window.open(`${baseUrl}/api/auth/impersonate?token=${token}`, '_blank');
    } catch (err) {
      toast.error('Failed to generate login token');
    }
  };

  const handleDelete = async (tenant) => {
    if (!window.confirm(`Delete site "${tenant.name}"? This will remove the database and all content.`)) return;
    try {
      await api.delete(`/tenants/${tenant.id}`);
      setRefreshKey(k => k + 1);
      toast.success('Site deleted');
    } catch (err) {
      toast.error('Failed to delete site');
    }
  };

  const filteredTenants = tenants.filter(t => 
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    t.subdomain.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const tableColumns = [
    {
      key: 'name',
      label: 'Name',
      render: (value, row) => (
        <div className="flex flex-col">
          <a href={getTenantUrl(row.subdomain)} target="_blank" rel="noopener noreferrer" className="font-medium text-primary-600 hover:underline">
            {value}
          </a>
        </div>
      ),
    },
    {
      key: 'subdomain',
      label: 'URL',
      render: (value) => <span className="font-mono text-sm text-gray-500">{value}.wolfwave.com</span>,
    },
    {
      key: 'status',
      label: 'Status',
      render: (value) => (
        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
          value === 'active' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
        }`}>
          {value}
        </span>
      ),
    },
    {
      key: 'created_at',
      label: 'Created',
      render: (value) => new Date(value).toLocaleDateString(),
    }
  ];

  if (loading && tenants.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sites</h1>
          <p className="text-sm text-gray-500">Manage and monitor all your WolfWave tenant sites.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-gray-100 p-1 rounded-lg mr-2">
            <button 
              onClick={() => setView('grid')}
              className={`p-1.5 rounded-md ${view === 'grid' ? 'bg-white shadow-sm text-primary-600' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setView('table')}
              className={`p-1.5 rounded-md ${view === 'table' ? 'bg-white shadow-sm text-primary-600' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
          <button onClick={() => setShowCreate(!showCreate)} className="btn btn-primary">
            <Plus className="w-4 h-4 mr-2" />
            Launch New Site
          </button>
        </div>
      </div>

      {showCreate && (
        <div className="card p-6 bg-primary-50/30 border-primary-100">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Launch New Site</h2>
          <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase text-gray-500">Site Name</label>
              <input
                type="text"
                value={newTenant.name}
                onChange={(e) => setNewTenant({
                  ...newTenant,
                  name: e.target.value,
                  subdomain: subdomainEdited ? newTenant.subdomain : autoSubdomain(e.target.value),
                })}
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
                  value={newTenant.subdomain}
                  onChange={(e) => { setSubdomainEdited(true); setNewTenant({ ...newTenant, subdomain: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }); }}
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
                {creating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Globe className="w-4 h-4 mr-2" />}
                Launch Site
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Search & Stats */}
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="relative flex-1 max-w-md w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input 
            type="text" 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search sites..." 
            className="input pl-10 w-full" 
          />
        </div>
        <div className="flex items-center gap-4 text-sm text-gray-500">
          <span>Total: <strong>{tenants.length}</strong></span>
          <span>Active: <strong className="text-green-600">{tenants.filter(t => t.status === 'active').length}</strong></span>
        </div>
      </div>

      {view === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTenants.length === 0 ? (
            <div className="col-span-full card p-12 text-center text-gray-500 italic">
              No sites found matching your search.
            </div>
          ) : (
            filteredTenants.map(tenant => (
              <div key={tenant.id} className={`card overflow-hidden hover:border-primary-300 transition-all group ${tenant.status !== 'active' ? 'opacity-75' : ''}`}>
                <div className="h-2 bg-primary-500" />
                <div className="p-5">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="font-bold text-lg text-gray-900 group-hover:text-primary-600 transition-colors line-clamp-1">{tenant.name}</h3>
                      <p className="text-xs font-mono text-gray-500 mt-0.5">{tenant.subdomain}.wolfwave.com</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                      tenant.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {tenant.status}
                    </span>
                  </div>

                  <div className="flex gap-2 mt-6 pt-4 border-t border-gray-50">
                    <button 
                      onClick={() => window.open(getTenantUrl(tenant.subdomain), '_blank')}
                      className="btn btn-secondary flex-1 py-1.5 text-xs flex items-center justify-center gap-1.5"
                    >
                      <Globe className="w-3.5 h-3.5" /> Visit
                    </button>
                    <a 
                      href={`${getTenantUrl(tenant.subdomain)}/admin/`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => {
                        e.preventDefault();
                        handleLoginAs(tenant);
                      }}
                      className="btn btn-primary flex-1 py-1.5 text-xs flex items-center justify-center gap-1.5"
                    >
                      <LogIn className="w-3.5 h-3.5" /> Admin
                    </a>
                    
                    <div className="relative inline-block group/menu">
                      <button className="p-2 hover:bg-gray-100 rounded-lg text-gray-400">
                        <MoreVertical className="w-4 h-4" />
                      </button>
                      <div className="absolute bottom-full right-0 mb-2 w-48 bg-white rounded-lg shadow-xl border border-gray-200 py-1 hidden group-hover/menu:block z-10">
                        <button 
                          onClick={() => handleStatusToggle(tenant)}
                          className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                        >
                          {tenant.status === 'active' ? <><Pause className="w-4 h-4" /> Suspend Site</> : <><Play className="w-4 h-4" /> Activate Site</>}
                        </button>
                        <hr className="my-1 border-gray-100" />
                        <button 
                          onClick={() => handleDelete(tenant)}
                          className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                        >
                          <Trash2 className="w-4 h-4" /> Delete Permanently
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <DataTable
          endpoint="/tenants"
          columns={tableColumns}
          pagination={{ mode: 'client' }}
          actions={[
            {
              icon: Globe,
              title: 'Visit',
              onClick: (row) => window.open(getTenantUrl(row.subdomain), '_blank'),
            },
            {
              icon: LogIn,
              title: 'Admin Login',
              href: (row) => `${getTenantUrl(row.subdomain)}/admin/`,
              onClick: (row) => handleLoginAs(row),
            },
            {
              icon: tenant => tenant.status === 'active' ? Pause : Play,
              title: tenant => tenant.status === 'active' ? 'Suspend' : 'Activate',
              onClick: (row) => handleStatusToggle(row),
            },
            {
              icon: Trash2,
              title: 'Delete',
              variant: 'danger',
              onClick: (row) => handleDelete(row),
            }
          ]}
        />
      )}
    </div>
  );
}
