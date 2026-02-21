import { useState } from 'react';
import { Plus, Trash2, Pause, Play } from 'lucide-react';
import DataTable from '../components/DataTable';
import api from '../lib/api';

export default function TenantList() {
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);
  const [newTenant, setNewTenant] = useState({ name: '', subdomain: '', email: 'admin@example.com', password: '' });
  const [subdomainEdited, setSubdomainEdited] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

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
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleStatusToggle = async (tenant, refetch) => {
    try {
      setError(null);
      const newStatus = tenant.status === 'active' ? 'suspended' : 'active';
      await api.put(`/tenants/${tenant.id}/status`, { status: newStatus });
      refetch();
    } catch (err) {
      setError(err.message);
    }
  };

  const columns = [
    {
      key: 'name',
      label: 'Name',
      render: (value) => <span className="font-medium">{value}</span>,
    },
    {
      key: 'subdomain',
      label: 'Subdomain',
      render: (value) => <span className="font-mono text-sm text-gray-600">{value}</span>,
    },
    {
      key: 'database_name',
      label: 'Database',
      render: (value) => <span className="font-mono text-xs text-gray-500">{value}</span>,
    },
    {
      key: 'status',
      label: 'Status',
      render: (value) => (
        <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${
          value === 'active' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
        }`}>
          {value}
        </span>
      ),
    },
    {
      key: 'created_at',
      label: 'Created',
      render: (value) => new Date(value).toLocaleDateString(),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Tenants</h1>
        <button className="btn btn-primary" onClick={() => setShowCreate(!showCreate)}>
          <Plus className="w-5 h-5 mr-2" />
          New Tenant
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error}
          <button onClick={() => setError(null)} className="float-right font-bold">&times;</button>
        </div>
      )}

      {showCreate && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Create New Tenant</h2>
          <p className="text-sm text-gray-500 mb-4">
            This will create a new database and run all migrations. The site will be accessible at the subdomain you specify.
          </p>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Site Name</label>
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
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Subdomain</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newTenant.subdomain}
                  onChange={(e) => { setSubdomainEdited(true); setNewTenant({ ...newTenant, subdomain: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }); }}
                  placeholder="my-store"
                  className="input flex-1"
                  required
                />
                <span className="text-sm text-gray-500">.yourdomain.com</span>
              </div>
              <p className="text-xs text-gray-400 mt-1">Database: wolfwave_{newTenant.subdomain || '...'}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Admin Email</label>
                <input
                  type="email"
                  value={newTenant.email}
                  onChange={(e) => setNewTenant({ ...newTenant, email: e.target.value })}
                  className="input"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Admin Password</label>
                <input
                  type="password"
                  value={newTenant.password}
                  onChange={(e) => setNewTenant({ ...newTenant, password: e.target.value })}
                  placeholder="Leave empty for 'admin123'"
                  className="input"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button type="submit" className="btn btn-primary" disabled={creating}>
                {creating ? 'Provisioning...' : 'Create Tenant'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => { setShowCreate(false); setNewTenant({ name: '', subdomain: '', email: 'admin@example.com', password: '' }); setSubdomainEdited(false); }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <DataTable
        key={refreshKey}
        endpoint="/tenants"
        pagination={{ mode: 'none' }}
        columns={columns}
        actions={[
          {
            icon: Pause,
            title: 'Suspend',
            onClick: (row, { refetch }) => handleStatusToggle(row, refetch),
            show: (row) => row.status === 'active',
          },
          {
            icon: Play,
            title: 'Activate',
            onClick: (row, { refetch }) => handleStatusToggle(row, refetch),
            show: (row) => row.status !== 'active',
          },
          {
            icon: Trash2,
            title: 'Delete',
            variant: 'danger',
            onClick: async (row, { refetch }) => {
              if (!window.confirm(`Delete tenant "${row.name}"? This will remove the database.`)) return;
              try {
                await api.delete(`/tenants/${row.id}`);
                refetch();
              } catch (err) {
                setError(err.message);
              }
            },
          },
        ]}
        emptyState={{
          message: 'No tenants yet.',
          hint: 'Create one to get started.',
        }}
      />
    </div>
  );
}
