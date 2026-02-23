import { useState, useEffect } from 'react';
import { Plus, Trash2, Copy, Check, Eye, EyeOff, Key, Globe, User, AlertTriangle } from 'lucide-react';
import api from '../lib/api';
import { toast } from 'sonner';

const SCOPE_GROUPS = [
  { label: 'Pages', scopes: ['pages:read', 'pages:write'] },
  { label: 'Products', scopes: ['products:read', 'products:write'] },
  { label: 'Orders', scopes: ['orders:read', 'orders:write'] },
  { label: 'Customers', scopes: ['customers:read', 'customers:write'] },
  { label: 'Content', scopes: ['content:read', 'content:write'] },
  { label: 'Media', scopes: ['media:read', 'media:write'] },
  { label: 'Settings', scopes: ['settings:read', 'settings:write'] },
  { label: 'Menus', scopes: ['menus:read', 'menus:write'] },
];

export default function ApiKeys() {
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [createdKey, setCreatedKey] = useState(null);
  const [copied, setCopied] = useState(null);
  const [form, setForm] = useState({ name: '', type: 'site', permissions: [], expires_at: '' });
  const [creating, setCreating] = useState(false);

  useEffect(() => { loadKeys(); }, []);

  const loadKeys = async () => {
    try {
      const data = await api.get('/api-keys');
      setKeys(data);
    } catch (err) {
      toast.error('Failed to load API keys');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setCreating(true);
    try {
      const data = await api.post('/api-keys', {
        name: form.name,
        type: form.type,
        permissions: form.permissions,
        expires_at: form.expires_at || null,
      });
      setCreatedKey(data);
      setShowCreate(false);
      setForm({ name: '', type: 'site', permissions: [], expires_at: '' });
      loadKeys();
      toast.success('API key created');
    } catch (err) {
      toast.error(err.message || 'Failed to create API key');
    } finally {
      setCreating(false);
    }
  };

  const handleToggleActive = async (key) => {
    try {
      await api.put(`/api-keys/${key.id}`, { is_active: !key.is_active });
      loadKeys();
      toast.success(key.is_active ? 'Key deactivated' : 'Key activated');
    } catch (err) {
      toast.error('Failed to update key');
    }
  };

  const handleDelete = async (key) => {
    if (!window.confirm(`Delete "${key.name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/api-keys/${key.id}`);
      loadKeys();
      toast.success('API key deleted');
    } catch (err) {
      toast.error('Failed to delete key');
    }
  };

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const togglePermission = (scope) => {
    setForm(prev => ({
      ...prev,
      permissions: prev.permissions.includes(scope)
        ? prev.permissions.filter(s => s !== scope)
        : [...prev.permissions, scope]
    }));
  };

  const selectAllPermissions = () => {
    const all = SCOPE_GROUPS.flatMap(g => g.scopes);
    setForm(prev => ({ ...prev, permissions: all }));
  };

  const clearAllPermissions = () => {
    setForm(prev => ({ ...prev, permissions: [] }));
  };

  const formatDate = (date) =>
    date ? new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">API Keys</h1>
          <p className="text-sm text-gray-500 mt-1">Manage API keys for programmatic access to your site</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn btn-primary">
          <Plus className="w-4 h-4 mr-2" />
          Create Key
        </button>
      </div>

      {/* Secret key reveal modal - shown once after creation */}
      {createdKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setCreatedKey(null)}>
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              <h2 className="text-lg font-semibold text-gray-900">Save Your Secret Key</h2>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Copy your secret key now. It will <strong>not be shown again</strong>.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Public Key</label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-gray-50 px-3 py-2 rounded border text-sm font-mono break-all">{createdKey.public_key}</code>
                  <button
                    onClick={() => copyToClipboard(createdKey.public_key, 'public')}
                    className="p-2 text-gray-500 hover:text-gray-700"
                    title="Copy"
                  >
                    {copied === 'public' ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Secret Key</label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-amber-50 px-3 py-2 rounded border border-amber-200 text-sm font-mono break-all">{createdKey.secret_key}</code>
                  <button
                    onClick={() => copyToClipboard(createdKey.secret_key, 'secret')}
                    className="p-2 text-gray-500 hover:text-gray-700"
                    title="Copy"
                  >
                    {copied === 'secret' ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Full API Key (for X-API-Key header)</label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-gray-50 px-3 py-2 rounded border text-sm font-mono break-all">
                    {createdKey.public_key}:{createdKey.secret_key}
                  </code>
                  <button
                    onClick={() => copyToClipboard(`${createdKey.public_key}:${createdKey.secret_key}`, 'full')}
                    className="p-2 text-gray-500 hover:text-gray-700"
                    title="Copy"
                  >
                    {copied === 'full' ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-4 p-3 bg-gray-50 rounded text-xs text-gray-600">
              <strong>Usage:</strong> Add header <code className="bg-white px-1 py-0.5 rounded">X-API-Key: {'{public_key}:{secret_key}'}</code> to your API requests.
            </div>

            <button
              onClick={() => setCreatedKey(null)}
              className="mt-4 w-full btn btn-primary"
            >
              I've saved my key
            </button>
          </div>
        </div>
      )}

      {/* Create key modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Create API Key</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. Mobile App, Integration"
                  className="input w-full"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <div className="flex gap-3">
                  <label className={`flex-1 flex items-center gap-2 p-3 rounded-lg border-2 cursor-pointer transition-colors ${form.type === 'site' ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    <input type="radio" name="type" value="site" checked={form.type === 'site'} onChange={() => setForm(prev => ({ ...prev, type: 'site' }))} className="sr-only" />
                    <Globe className="w-5 h-5 text-gray-600" />
                    <div>
                      <div className="text-sm font-medium">Site</div>
                      <div className="text-xs text-gray-500">Server-to-server</div>
                    </div>
                  </label>
                  <label className={`flex-1 flex items-center gap-2 p-3 rounded-lg border-2 cursor-pointer transition-colors ${form.type === 'user' ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    <input type="radio" name="type" value="user" checked={form.type === 'user'} onChange={() => setForm(prev => ({ ...prev, type: 'user' }))} className="sr-only" />
                    <User className="w-5 h-5 text-gray-600" />
                    <div>
                      <div className="text-sm font-medium">User</div>
                      <div className="text-xs text-gray-500">Per-user access</div>
                    </div>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Expiration (optional)</label>
                <input
                  type="datetime-local"
                  value={form.expires_at}
                  onChange={e => setForm(prev => ({ ...prev, expires_at: e.target.value }))}
                  className="input w-full"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">Permissions</label>
                  <div className="flex gap-2">
                    <button type="button" onClick={selectAllPermissions} className="text-xs text-primary-600 hover:text-primary-800">Select all</button>
                    <span className="text-gray-300">|</span>
                    <button type="button" onClick={clearAllPermissions} className="text-xs text-gray-500 hover:text-gray-700">Clear</button>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mb-3">
                  {form.type === 'site' && form.permissions.length === 0
                    ? 'Site keys with no permissions selected get full access.'
                    : `${form.permissions.length} scope(s) selected`}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {SCOPE_GROUPS.map(group => (
                    <div key={group.label} className="bg-gray-50 rounded-lg p-3">
                      <div className="text-xs font-semibold text-gray-600 mb-2">{group.label}</div>
                      {group.scopes.map(scope => (
                        <label key={scope} className="flex items-center gap-2 text-sm cursor-pointer py-0.5">
                          <input
                            type="checkbox"
                            checked={form.permissions.includes(scope)}
                            onChange={() => togglePermission(scope)}
                            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                          />
                          <span className="text-gray-700">{scope.split(':')[1]}</span>
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={creating} className="btn btn-primary">
                  {creating ? 'Creating...' : 'Create Key'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Keys table */}
      {keys.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <Key className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-gray-900 mb-1">No API keys yet</h3>
          <p className="text-sm text-gray-500 mb-4">Create your first API key to enable programmatic access.</p>
          <button onClick={() => setShowCreate(true)} className="btn btn-primary">
            <Plus className="w-4 h-4 mr-2" />
            Create Key
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Public Key</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Permissions</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Used</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {keys.map(key => (
                  <tr key={key.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{key.name}</div>
                      {key.user_name && (
                        <div className="text-xs text-gray-500">{key.user_name} ({key.user_email})</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${key.type === 'site' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                        {key.type === 'site' ? <Globe className="w-3 h-3" /> : <User className="w-3 h-3" />}
                        {key.type}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <code className="text-xs font-mono text-gray-600 bg-gray-100 px-2 py-1 rounded">
                        {key.public_key.substring(0, 20)}...
                      </code>
                    </td>
                    <td className="px-4 py-3">
                      {key.permissions?.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {key.permissions.length <= 3
                            ? key.permissions.map(p => (
                                <span key={p} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{p}</span>
                              ))
                            : <>
                                <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{key.permissions[0]}</span>
                                <span className="text-xs text-gray-500">+{key.permissions.length - 1} more</span>
                              </>
                          }
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">{key.type === 'site' ? 'Full access' : 'None'}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleToggleActive(key)}
                        className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors ${
                          key.is_active
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'bg-red-100 text-red-700 hover:bg-red-200'
                        }`}
                      >
                        {key.is_active ? 'Active' : 'Inactive'}
                      </button>
                      {key.expires_at && new Date(key.expires_at) < new Date() && (
                        <span className="ml-1 text-xs text-red-500">Expired</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{formatDate(key.last_used_at)}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{formatDate(key.created_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleDelete(key)}
                        className="p-1.5 text-gray-400 hover:text-red-600 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
