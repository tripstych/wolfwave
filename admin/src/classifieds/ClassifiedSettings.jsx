import { useState, useEffect } from 'react';
import api from '../lib/api';
import { toast } from 'sonner';
import { Save, Plus, Trash2, Shield, Settings } from 'lucide-react';

export default function ClassifiedSettings() {
  const [settings, setSettings] = useState({
    classifieds_enabled: 'true',
    classifieds_auto_approve: 'false',
    classifieds_expiry_days: '30',
    classifieds_max_images: '8',
    classifieds_ai_moderation: 'false',
  });
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newRule, setNewRule] = useState({ name: '', rule_type: 'block', description: '' });
  const [showAddRule, setShowAddRule] = useState(false);

  // Categories state
  const [categories, setCategories] = useState([]);
  const [newCatName, setNewCatName] = useState('');

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    try {
      const [settingsData, rulesData, catsData] = await Promise.all([
        api.get('/classifieds/admin/settings'),
        api.get('/classifieds/admin/moderation-rules'),
        api.get('/classifieds/admin/categories/all'),
      ]);
      setSettings(settingsData);
      setRules(rulesData);
      setCategories(catsData);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      await api.put('/classifieds/admin/settings', settings);
      toast.success('Settings saved');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAddRule = async () => {
    if (!newRule.name) return;
    try {
      await api.post('/classifieds/admin/moderation-rules', newRule);
      setNewRule({ name: '', rule_type: 'block', description: '' });
      setShowAddRule(false);
      const data = await api.get('/classifieds/admin/moderation-rules');
      setRules(data);
      toast.success('Rule added');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleDeleteRule = async (id) => {
    if (!confirm('Delete this rule?')) return;
    try {
      await api.delete(`/classifieds/admin/moderation-rules/${id}`);
      setRules(rules.filter(r => r.id !== id));
      toast.success('Rule deleted');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleToggleRule = async (rule) => {
    try {
      await api.post('/classifieds/admin/moderation-rules', { ...rule, enabled: !rule.enabled });
      setRules(rules.map(r => r.id === rule.id ? { ...r, enabled: !r.enabled } : r));
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    try {
      await api.post('/classifieds/admin/categories', { name: newCatName });
      setNewCatName('');
      const data = await api.get('/classifieds/admin/categories/all');
      setCategories(data);
      toast.success('Category added');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleDeleteCategory = async (id) => {
    if (!confirm('Delete this category? Ads will become uncategorized.')) return;
    try {
      await api.delete(`/classifieds/admin/categories/${id}`);
      const data = await api.get('/classifieds/admin/categories/all');
      setCategories(data);
      toast.success('Category deleted');
    } catch (err) {
      toast.error(err.message);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Classifieds Settings</h1>
        <button onClick={handleSaveSettings} disabled={saving} className="btn btn-primary">
          <Save className="w-4 h-4 mr-2" />
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>

      {/* General Settings */}
      <div className="card p-6 space-y-4">
        <h2 className="font-semibold text-gray-900 pb-2 border-b border-gray-200 flex items-center gap-2">
          <Settings className="w-4 h-4" /> General
        </h2>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.classifieds_enabled === 'true'}
            onChange={(e) => setSettings({ ...settings, classifieds_enabled: e.target.checked ? 'true' : 'false' })}
            className="rounded"
          />
          <span className="text-sm text-gray-700">Enable Classifieds Module</span>
        </label>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Ad Expiry (days)</label>
            <input
              type="number"
              value={settings.classifieds_expiry_days}
              onChange={(e) => setSettings({ ...settings, classifieds_expiry_days: e.target.value })}
              className="input"
              min={1}
              max={365}
            />
          </div>
          <div>
            <label className="label">Max Images Per Ad</label>
            <input
              type="number"
              value={settings.classifieds_max_images}
              onChange={(e) => setSettings({ ...settings, classifieds_max_images: e.target.value })}
              className="input"
              min={1}
              max={20}
            />
          </div>
        </div>
      </div>

      {/* Moderation Settings */}
      <div className="card p-6 space-y-4">
        <h2 className="font-semibold text-gray-900 pb-2 border-b border-gray-200 flex items-center gap-2">
          <Shield className="w-4 h-4" /> Moderation
        </h2>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.classifieds_auto_approve === 'true'}
            onChange={(e) => setSettings({ ...settings, classifieds_auto_approve: e.target.checked ? 'true' : 'false' })}
            className="rounded"
          />
          <span className="text-sm text-gray-700">Auto-approve all ads (skip moderation)</span>
        </label>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.classifieds_ai_moderation === 'true'}
            onChange={(e) => setSettings({ ...settings, classifieds_ai_moderation: e.target.checked ? 'true' : 'false' })}
            className="rounded"
          />
          <span className="text-sm text-gray-700">Enable AI-powered moderation</span>
        </label>
        <p className="text-xs text-gray-500">
          When enabled, ads are reviewed by AI against the rules below. Requires an OpenAI or Anthropic API key in your environment.
        </p>

        {/* Rules */}
        <div className="border-t border-gray-200 pt-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium text-gray-700">Moderation Rules</h3>
            <button onClick={() => setShowAddRule(!showAddRule)} className="btn btn-secondary text-sm py-1 px-3">
              <Plus className="w-3 h-3 mr-1" /> Add Rule
            </button>
          </div>

          {showAddRule && (
            <div className="bg-gray-50 rounded-lg p-4 mb-3 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  value={newRule.name}
                  onChange={(e) => setNewRule({ ...newRule, name: e.target.value })}
                  className="input"
                  placeholder="Rule name (e.g. Nudity)"
                />
                <select
                  value={newRule.rule_type}
                  onChange={(e) => setNewRule({ ...newRule, rule_type: e.target.value })}
                  className="input"
                >
                  <option value="block">Block</option>
                  <option value="allow">Allow</option>
                </select>
              </div>
              <input
                type="text"
                value={newRule.description}
                onChange={(e) => setNewRule({ ...newRule, description: e.target.value })}
                className="input"
                placeholder="Description (e.g. No explicit nudity in images)"
              />
              <button onClick={handleAddRule} className="btn btn-primary text-sm py-1 px-4">Add</button>
            </div>
          )}

          {rules.length === 0 ? (
            <p className="text-sm text-gray-400">No moderation rules configured. AI will use general content guidelines.</p>
          ) : (
            <div className="space-y-2">
              {rules.map(rule => (
                <div key={rule.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={rule.enabled}
                      onChange={() => handleToggleRule(rule)}
                      className="rounded"
                    />
                    <div>
                      <span className="text-sm font-medium text-gray-700">{rule.name}</span>
                      <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${rule.rule_type === 'block' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                        {rule.rule_type}
                      </span>
                      {rule.description && <p className="text-xs text-gray-500 mt-0.5">{rule.description}</p>}
                    </div>
                  </div>
                  <button onClick={() => handleDeleteRule(rule.id)} className="p-1 text-gray-400 hover:text-red-500">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Categories */}
      <div className="card p-6 space-y-4">
        <h2 className="font-semibold text-gray-900 pb-2 border-b border-gray-200">Categories</h2>

        <div className="flex gap-2">
          <input
            type="text"
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
            className="input flex-1"
            placeholder="New category name..."
          />
          <button onClick={handleAddCategory} disabled={!newCatName.trim()} className="btn btn-secondary">
            <Plus className="w-4 h-4 mr-1" /> Add
          </button>
        </div>

        {categories.length === 0 ? (
          <p className="text-sm text-gray-400">No categories yet. Add some above.</p>
        ) : (
          <div className="space-y-2">
            {categories.map(cat => (
              <div key={cat.id}>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <span className="text-sm font-medium text-gray-700">{cat.name}</span>
                    {cat._count?.classified_ads > 0 && (
                      <span className="text-xs text-gray-400 ml-2">({cat._count.classified_ads} ads)</span>
                    )}
                  </div>
                  <button onClick={() => handleDeleteCategory(cat.id)} className="p-1 text-gray-400 hover:text-red-500">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                {cat.children?.length > 0 && (
                  <div className="ml-6 mt-1 space-y-1">
                    {cat.children.map(child => (
                      <div key={child.id} className="flex items-center justify-between p-2 bg-gray-50/50 rounded">
                        <span className="text-sm text-gray-600">{child.name}</span>
                        <button onClick={() => handleDeleteCategory(child.id)} className="p-1 text-gray-400 hover:text-red-500">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
