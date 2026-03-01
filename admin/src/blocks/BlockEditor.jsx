import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import api from '../lib/api';
import slugify from 'slugify';
import CodeEditor from '../components/CodeEditor';
import {
  Save,
  ArrowLeft,
  AlertCircle,
  CheckCircle,
  Lock,
  Unlock,
  Shield,
  Copy
} from 'lucide-react';

export default function BlockEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id;

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [subscriptionPlans, setSubscriptionPlans] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSlugLocked, setIsSlugLocked] = useState(!isNew);
  const [history, setHistory] = useState([]);
  const [activeTab, setActiveTab] = useState('editor');

  const [block, setBlock] = useState({
    name: '',
    slug: '',
    content_type: 'blocks',
    source: '',
    access_rules: {
      auth: 'any',
      subscription: 'any',
      plans: []
    }
  });

  useEffect(() => {
    loadSubscriptionPlans();
    if (!isNew) {
      loadBlock();
    }
  }, [id]);

  const loadSubscriptionPlans = async () => {
    try {
      const response = await api.get('/subscription-plans');
      setSubscriptionPlans(response.data || []);
    } catch (err) {
      console.error('Failed to load subscription plans:', err);
    }
  };

  const loadBlock = async () => {
    try {
      const data = await api.get(`/blocks/${id}`);
      setBlock({
        name: data.name,
        slug: data.slug,
        source: data.source || '',
        access_rules: {
          auth: data.access_rules?.auth || 'any',
          subscription: data.access_rules?.subscription || 'any',
          plans: data.access_rules?.plans || []
        }
      });

      if (data.content_id) {
        loadHistory(data.content_id);
      }
    } catch (err) {
      console.error('Failed to load block:', err);
      setError('Failed to load block');
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async (contentId) => {
    try {
      const res = await api.get(`/content/${contentId}/history`);
      setHistory(res || []);
    } catch (err) {
      console.error('Failed to load history:', err);
    } finally {
    }
  };

  const restoreVersion = async (historyId) => {
    if (!confirm('Restore this version? Current unsaved changes will be lost.')) return;
    try {
      setSaving(true);
      await api.post(`/content/history/${historyId}/restore`);
      toast.success('Version restored!');
      await loadBlock();
    } catch (err) {
      toast.error('Failed to restore version');
    } finally {
      setSaving(false);
    }
  };

  const handleNameChange = (name) => {
    if (isSlugLocked) {
      setBlock(b => ({ ...b, name }));
    } else {
      const slug = slugify(name, { lower: true, strict: true });
      setBlock(b => ({ ...b, name, slug }));
    }
  };

  const handleToggleLock = () => {
    if (isSlugLocked) {
      toast.warning('Pages using this block\'s short code will need to be updated if you change it!', {
        duration: 6000,
      });
    }
    setIsSlugLocked(!isSlugLocked);
  };

  const handleSave = async () => {
    setError('');
    setSuccess('');
    setSaving(true);

    try {
      if (isNew) {
        const result = await api.post('/blocks', block);
        setSuccess('Block created successfully!');

        if (result.content_id) {
          loadHistory(result.content_id);
        }

        navigate(`/blocks/${result.id}`, { replace: true });
      } else {
        await api.put(`/blocks/${id}`, block);
        setSuccess('Block saved successfully!');

        if (block.content_id) {
          loadHistory(block.content_id);
        }
      }
    } catch (err) {
      setError(err.message || 'Failed to save block');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this block?')) return;
    setSaving(true);
    try {
      await api.delete(`/blocks/${id}`);
      navigate('/blocks');
    } catch (err) {
      setError(err.message || 'Failed to delete block');
      setSaving(false);
    }
  };

  const copyShortCode = () => {
    const code = `[[block:${block.slug}]]`;
    navigator.clipboard.writeText(code);
    toast.success(`Copied ${code}`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/blocks')} className="btn btn-ghost">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h1 className="text-2xl font-bold text-gray-900">
            {isNew ? 'New Block' : 'Edit Block'}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {!isNew && (
            <button
              onClick={handleDelete}
              disabled={saving}
              className="btn btn-ghost text-red-600"
            >
              Delete
            </button>
          )}
          <button
            id="btn-save-block"
            onClick={handleSave}
            disabled={saving}
            className="btn btn-primary"
          >
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          {error}
        </div>
      )}
      {success && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700">
          <CheckCircle className="w-5 h-5 flex-shrink-0" />
          {success}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Basic Info */}
          <div className="card p-6 space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-semibold text-gray-900">Block Identity</h2>
              <button
                type="button"
                onClick={handleToggleLock}
                className="btn btn-ghost px-3"
                title={isSlugLocked ? 'Unlock to edit name and short code' : 'Lock to prevent accidental changes'}
              >
                {isSlugLocked ? (
                  <Lock className="w-4 h-4 text-gray-600" />
                ) : (
                  <Unlock className="w-4 h-4 text-amber-600" />
                )}
              </button>
            </div>

            <div>
              <label className="label">
                Name
                {isSlugLocked && (
                  <span className="ml-2 text-xs text-gray-500">(locked)</span>
                )}
              </label>
              <input
                id="input-block-name"
                type="text"
                value={block.name}
                onChange={(e) => handleNameChange(e.target.value)}
                className="input"
                placeholder="Block name"
                disabled={isSlugLocked}
              />
            </div>

            <div>
              <label className="label">
                Short Code
                {isSlugLocked && (
                  <span className="ml-2 text-xs text-gray-500">(locked)</span>
                )}
              </label>
              <div className="flex gap-2">
                <input
                  id="input-block-slug"
                  type="text"
                  value={block.slug}
                  onChange={(e) => setBlock(b => ({ ...b, slug: e.target.value }))}
                  className="input flex-1"
                  placeholder="my-block"
                  disabled={isSlugLocked}
                />
                {block.slug && (
                  <button
                    type="button"
                    onClick={copyShortCode}
                    className="btn btn-ghost px-3"
                    title="Copy short code"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                )}
              </div>
              {block.slug && (
                <p className="text-xs text-gray-500 mt-1">
                  Use <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">{'[[block:' + block.slug + ']]'}</code> in your templates
                </p>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              <button
                id="tab-editor"
                onClick={() => setActiveTab('editor')}
                className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
                  activeTab === 'editor'
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Editor
              </button>
              <button
                id="tab-history"
                onClick={() => setActiveTab('history')}
                className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
                  activeTab === 'history'
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                History {history.length > 0 && <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-[10px]">{history.length}</span>}
              </button>
            </nav>
          </div>

          {activeTab === 'editor' ? (
            <div className="card p-6 space-y-4">
              <h2 className="font-semibold text-gray-900">Source</h2>
              <p className="text-xs text-gray-500">
                Write HTML and Nunjucks code. You have access to <code className="bg-gray-100 px-1 py-0.5 rounded">site</code>, <code className="bg-gray-100 px-1 py-0.5 rounded">block</code>, and all global template variables.
              </p>
              <CodeEditor
                value={block.source}
                onChange={(val) => setBlock(b => ({ ...b, source: val }))}
                mode="html"
                height="500px"
              />
            </div>
          ) : (
            <div className="card overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-6 py-3 font-bold text-gray-500 uppercase text-xs">Version</th>
                    <th className="px-6 py-3 font-bold text-gray-500 uppercase text-xs">Date</th>
                    <th className="px-6 py-3 font-bold text-gray-500 uppercase text-xs">Title</th>
                    <th className="px-6 py-3 text-right"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {history.map((ver) => (
                    <tr key={ver.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 font-medium">v{ver.version_number}</td>
                      <td className="px-6 py-4 text-gray-500">{new Date(ver.created_at).toLocaleString()}</td>
                      <td className="px-6 py-4">{ver.title}</td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => restoreVersion(ver.id)}
                          className="text-primary-600 hover:text-primary-900 font-medium"
                        >
                          Restore
                        </button>
                      </td>
                    </tr>
                  ))}
                  {history.length === 0 && (
                    <tr>
                      <td colSpan="4" className="px-6 py-12 text-center text-gray-400 italic">No version history yet. Updates will create recovery points.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Access Control */}
          <div className="card p-6 space-y-4">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <Lock className="w-4 h-4" />
              Access Control
            </h2>
            <div className="space-y-4">
              <div>
                <label className="label">Authentication</label>
                <select
                  id="select-auth-rule"
                  value={block.access_rules?.auth || 'any'}
                  onChange={(e) => setBlock(b => ({
                    ...b,
                    access_rules: { ...b.access_rules, auth: e.target.value }
                  }))}
                  className="input"
                >
                  <option value="any">Everyone</option>
                  <option value="logged_in">Logged In Only</option>
                  <option value="logged_out">Logged Out Only</option>
                </select>
              </div>
              <div>
                <label className="label">Subscription</label>
                <select
                  id="select-subscription-rule"
                  value={block.access_rules?.subscription || 'any'}
                  onChange={(e) => setBlock(b => ({
                    ...b,
                    access_rules: { ...b.access_rules, subscription: e.target.value, plans: e.target.value === 'any' ? [] : (b.access_rules.plans || []) }
                  }))}
                  className="input"
                >
                  <option value="any">No Subscription Required</option>
                  <option value="required">Active Subscription Required</option>
                </select>
              </div>

              {block.access_rules?.subscription === 'required' && (
                <div className="space-y-2">
                  <label className="label text-xs">Required Tiers (Optional)</label>
                  <div className="space-y-1 max-h-32 overflow-y-auto p-2 border border-gray-200 rounded-md">
                    {subscriptionPlans.length === 0 ? (
                      <p className="text-xs text-gray-500 italic">No plans defined</p>
                    ) : (
                      subscriptionPlans.map(plan => (
                        <label key={plan.id} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-50 p-1 rounded">
                          <input
                            type="checkbox"
                            checked={(block.access_rules?.plans || []).includes(plan.slug)}
                            onChange={(e) => {
                              const currentPlans = block.access_rules?.plans || [];
                              const newPlans = e.target.checked
                                ? [...currentPlans, plan.slug]
                                : currentPlans.filter(s => s !== plan.slug);
                              setBlock(b => ({
                                ...b,
                                access_rules: { ...b.access_rules, plans: newPlans }
                              }));
                            }}
                          />
                          {plan.name}
                        </label>
                      ))
                    )}
                  </div>
                  <p className="text-[10px] text-gray-500">If no tiers are selected, any active subscription will grant access.</p>
                </div>
              )}

              {block.access_rules?.subscription === 'required' && (
                <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700">
                  <p className="flex items-start gap-2">
                    <Shield className="w-3 h-3 mt-0.5 flex-shrink-0" />
                    This block will only be rendered for users with an active subscription.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
