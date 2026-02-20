import React, { useState, useEffect } from 'react';
import { Plus, Trash2, ExternalLink, Pause, Play } from 'lucide-react';

export default function TenantList() {
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTenant, setNewTenant] = useState({ 
    name: '', 
    subdomain: '',
    email: 'admin@example.com',
    password: ''
  });
  const [subdomainEdited, setSubdomainEdited] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  useEffect(() => {
    fetchTenants();
  }, []);

  const fetchTenants = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/tenants', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (!response.ok) throw new Error('Failed to fetch tenants');
      const data = await response.json();
      setTenants(data.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      setCreating(true);
      setError(null);
      const response = await fetch('/api/tenants', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(newTenant)
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create tenant');
      }
      setNewTenant({ 
        name: '', 
        subdomain: '',
        email: 'admin@example.com',
        password: ''
      });
      setSubdomainEdited(false);
      setShowCreate(false);
      fetchTenants();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      setError(null);
      const response = await fetch(`/api/tenants/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete tenant');
      }
      setDeleteConfirm(null);
      fetchTenants();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleStatusToggle = async (tenant) => {
    try {
      setError(null);
      const newStatus = tenant.status === 'active' ? 'suspended' : 'active';
      const response = await fetch(`/api/tenants/${tenant.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ status: newStatus })
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update status');
      }
      fetchTenants();
    } catch (err) {
      setError(err.message);
    }
  };

  const autoSubdomain = (name) => {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Tenants</h1>
        <button
          className="btn btn-primary"
          onClick={() => setShowCreate(!showCreate)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <Plus className="w-5 h-5" />
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
                  name: e.target.value,
                  subdomain: subdomainEdited ? newTenant.subdomain : autoSubdomain(e.target.value)
                })}
                placeholder="My Store"
                className="input"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Subdomain</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="text"
                  value={newTenant.subdomain}
                  onChange={(e) => { setSubdomainEdited(true); setNewTenant({ ...newTenant, subdomain: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }); }}
                  placeholder="my-store"
                  className="input"
                  style={{ flex: 1 }}
                  required
                />
                <span className="text-sm text-gray-500">.yourdomain.com</span>
              </div>
              <p className="text-xs text-gray-400 mt-1">Database: webwolf_{newTenant.subdomain || '...'}</p>
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

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="submit" className="btn btn-primary" disabled={creating}>
                {creating ? 'Provisioning...' : 'Create Tenant'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => { setShowCreate(false); setNewTenant({ name: '', subdomain: '' }); setSubdomainEdited(false); }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
          <p className="mt-4 text-gray-600">Loading tenants...</p>
        </div>
      ) : tenants.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
          <p className="text-gray-600">No tenants yet. Create one to get started.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              <tr>
                <th style={{ padding: '0.75rem 1.5rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>Name</th>
                <th style={{ padding: '0.75rem 1.5rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>Subdomain</th>
                <th style={{ padding: '0.75rem 1.5rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>Database</th>
                <th style={{ padding: '0.75rem 1.5rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>Status</th>
                <th style={{ padding: '0.75rem 1.5rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>Created</th>
                <th style={{ padding: '0.75rem 1.5rem', textAlign: 'center', fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((tenant) => (
                <tr key={tenant.id} style={{ borderBottom: '1px solid #e5e7eb' }} className="hover:bg-gray-50">
                  <td style={{ padding: '0.75rem 1.5rem', fontWeight: 500 }}>{tenant.name}</td>
                  <td style={{ padding: '0.75rem 1.5rem' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: '0.875rem', color: '#4b5563' }}>
                      {tenant.subdomain}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 1.5rem' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#6b7280' }}>
                      {tenant.database_name}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 1.5rem' }}>
                    <span style={{
                      display: 'inline-block',
                      padding: '0.125rem 0.625rem',
                      borderRadius: '9999px',
                      fontSize: '0.75rem',
                      fontWeight: 500,
                      backgroundColor: tenant.status === 'active' ? '#d1fae5' : '#fef3c7',
                      color: tenant.status === 'active' ? '#065f46' : '#92400e'
                    }}>
                      {tenant.status}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 1.5rem', fontSize: '0.875rem', color: '#6b7280' }}>
                    {new Date(tenant.created_at).toLocaleDateString()}
                  </td>
                  <td style={{ padding: '0.75rem 1.5rem', textAlign: 'center' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem' }}>
                      <button
                        onClick={() => handleStatusToggle(tenant)}
                        className="btn btn-ghost"
                        title={tenant.status === 'active' ? 'Suspend' : 'Activate'}
                        style={{ padding: '0.25rem 0.5rem' }}
                      >
                        {tenant.status === 'active'
                          ? <Pause className="w-4 h-4" />
                          : <Play className="w-4 h-4" />
                        }
                      </button>
                      {deleteConfirm === tenant.id ? (
                        <div style={{ display: 'flex', gap: '0.25rem' }}>
                          <button
                            onClick={() => handleDelete(tenant.id)}
                            className="btn btn-danger"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(null)}
                            className="btn btn-ghost"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirm(tenant.id)}
                          className="btn btn-ghost"
                          title="Delete tenant"
                          style={{ padding: '0.25rem 0.5rem', color: '#ef4444' }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
