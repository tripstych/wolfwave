import { useState, useEffect } from 'react';
import { Plus, Trash2, Copy, Check, Key, Shield, Calendar } from 'lucide-react';

export default function WooCommerceKeys() {
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newKey, setNewKey] = useState({ description: '', permissions: 'read_write' });
  const [createdKey, setCreatedKey] = useState(null);
  const [copiedField, setCopiedField] = useState(null);

  useEffect(() => {
    loadKeys();
  }, []);

  const loadKeys = async () => {
    try {
      const res = await fetch('/api/woocommerce-keys');
      const data = await res.json();
      setKeys(data);
    } catch (error) {
      console.error('Failed to load keys:', error);
    } finally {
      setLoading(false);
    }
  };

  const createKey = async () => {
    try {
      const res = await fetch('/api/woocommerce-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newKey)
      });
      const data = await res.json();
      setCreatedKey(data);
      setShowCreateForm(false);
      setNewKey({ description: '', permissions: 'read_write' });
      loadKeys();
    } catch (error) {
      console.error('Failed to create key:', error);
      alert('Failed to create API key');
    }
  };

  const revokeKey = async (keyId) => {
    if (!confirm('Are you sure you want to revoke this API key? This cannot be undone.')) {
      return;
    }

    try {
      await fetch(`/api/woocommerce-keys/${keyId}`, { method: 'DELETE' });
      loadKeys();
    } catch (error) {
      console.error('Failed to revoke key:', error);
      alert('Failed to revoke API key');
    }
  };

  const copyToClipboard = (text, field) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return <div className="p-8">Loading...</div>;
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">WooCommerce API Keys</h1>
        <p className="text-gray-600">
          Manage API keys for third-party integrations (Zapier, ShipStation, etc.)
        </p>
      </div>

      {/* Created Key Display */}
      {createdKey && (
        <div className="mb-6 p-6 bg-green-50 border-2 border-green-200 rounded-lg">
          <div className="flex items-center gap-2 mb-4">
            <Check className="w-5 h-5 text-green-600" />
            <h3 className="font-semibold text-green-900">API Key Created Successfully!</h3>
          </div>
          <p className="text-sm text-green-800 mb-4">
            ⚠️ Copy these credentials now. The secret will not be shown again!
          </p>
          
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Authentication Key <span className="text-xs font-normal text-gray-500">(ShipStation field name)</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={createdKey.truncatedKey}
                  readOnly
                  className="flex-1 px-3 py-2 border rounded font-mono text-sm"
                />
                <button
                  onClick={() => copyToClipboard(createdKey.truncatedKey, 'truncated')}
                  className="px-4 py-2 bg-white border rounded hover:bg-gray-50"
                >
                  {copiedField === 'truncated' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Consumer Key <span className="text-xs font-normal text-gray-500">(ShipStation field name)</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={createdKey.consumerKey}
                  readOnly
                  className="flex-1 px-3 py-2 border rounded font-mono text-sm"
                />
                <button
                  onClick={() => copyToClipboard(createdKey.consumerKey, 'key')}
                  className="px-4 py-2 bg-white border rounded hover:bg-gray-50"
                >
                  {copiedField === 'key' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Consumer Secret <span className="text-xs font-normal text-gray-500">(ShipStation field name)</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={createdKey.consumerSecret}
                  readOnly
                  className="flex-1 px-3 py-2 border rounded font-mono text-sm"
                />
                <button
                  onClick={() => copyToClipboard(createdKey.consumerSecret, 'secret')}
                  className="px-4 py-2 bg-white border rounded hover:bg-gray-50"
                >
                  {copiedField === 'secret' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                URL to Custom XML Page <span className="text-xs font-normal text-gray-500">(ShipStation field name)</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={`${window.location.origin}/wc-api/v3/orders`}
                  readOnly
                  className="flex-1 px-3 py-2 border rounded font-mono text-sm"
                />
                <button
                  onClick={() => copyToClipboard(`${window.location.origin}/wc-api/v3/orders`, 'url')}
                  className="px-4 py-2 bg-white border rounded hover:bg-gray-50"
                >
                  {copiedField === 'url' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          <button
            onClick={() => setCreatedKey(null)}
            className="mt-4 text-sm text-green-700 hover:text-green-900"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Create Key Form */}
      {showCreateForm && (
        <div className="mb-6 p-6 bg-gray-50 border rounded-lg">
          <h3 className="font-semibold mb-4">Create New API Key</h3>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <input
                type="text"
                value={newKey.description}
                onChange={(e) => setNewKey({ ...newKey, description: e.target.value })}
                placeholder="e.g., Zapier Integration"
                className="w-full px-3 py-2 border rounded"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Permissions
              </label>
              <select
                value={newKey.permissions}
                onChange={(e) => setNewKey({ ...newKey, permissions: e.target.value })}
                className="w-full px-3 py-2 border rounded"
              >
                <option value="read">Read Only</option>
                <option value="write">Write Only</option>
                <option value="read_write">Read & Write</option>
              </select>
            </div>

            <div className="flex gap-2">
              <button
                onClick={createKey}
                disabled={!newKey.description}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                Generate Key
              </button>
              <button
                onClick={() => setShowCreateForm(false)}
                className="px-4 py-2 border rounded hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Key Button */}
      {!showCreateForm && (
        <button
          onClick={() => setShowCreateForm(true)}
          className="mb-6 flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" />
          Add Key
        </button>
      )}

      {/* Keys List */}
      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Description
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Key
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Permissions
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Last Access
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Created
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {keys.length === 0 ? (
              <tr>
                <td colSpan="6" className="px-6 py-8 text-center text-gray-500">
                  No API keys yet. Create one to get started.
                </td>
              </tr>
            ) : (
              keys.map((key) => (
                <tr key={key.key_id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <Key className="w-4 h-4 text-gray-400" />
                      <span className="font-medium">{key.description}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <code className="text-sm text-gray-600">...{key.truncated_key}</code>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-gray-400" />
                      <span className="text-sm capitalize">{key.permissions.replace('_', ' ')}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {key.last_access ? formatDate(key.last_access) : 'Never'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-gray-400" />
                      {formatDate(key.created_at)}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => revokeKey(key.key_id)}
                      className="text-red-600 hover:text-red-800"
                      title="Revoke Key"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Info Box */}
      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h4 className="font-semibold text-blue-900 mb-2">Using Your API Keys</h4>
        <p className="text-sm text-blue-800 mb-2">
          Use these credentials with third-party integrations like Zapier, ShipStation, etc.
        </p>
        <div className="text-sm text-blue-700 space-y-1">
          <p>• <strong>API Endpoint:</strong> <code className="bg-blue-100 px-1 rounded">{window.location.origin}/wp-json/wc/v3</code></p>
          <p>• <strong>Authentication:</strong> Basic Auth (username = consumer key, password = consumer secret)</p>
          <p>• <strong>Documentation:</strong> See WOOCOMMERCE_COMPATIBILITY.md</p>
        </div>
      </div>
    </div>
  );
}
