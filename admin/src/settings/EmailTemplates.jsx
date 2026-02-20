import { useState, useEffect } from 'react';
import api from '../lib/api';
import { Save, ArrowLeft, AlertCircle, CheckCircle, Mail } from 'lucide-react';

const VARIABLE_REFERENCE = {
  'order-confirmation': [
    { var: 'order_number', desc: 'Order number (e.g. #1001)' },
    { var: 'customer_name', desc: 'Customer full name' },
    { var: 'total', desc: 'Order total' },
    { var: 'order_items', desc: 'HTML table rows of order items' },
    { var: 'site_name', desc: 'Site name from settings' },
    { var: 'site_url', desc: 'Site URL from settings' }
  ],
  'shipping-update': [
    { var: 'order_number', desc: 'Order number' },
    { var: 'customer_name', desc: 'Customer full name' },
    { var: 'tracking_number', desc: 'Tracking number' },
    { var: 'shipping_method', desc: 'Shipping method name' },
    { var: 'site_name', desc: 'Site name' }
  ],
  'payment-receipt': [
    { var: 'order_number', desc: 'Order number' },
    { var: 'total', desc: 'Amount paid' },
    { var: 'site_name', desc: 'Site name' }
  ],
  'password-reset': [
    { var: 'reset_url', desc: 'Password reset link' },
    { var: 'site_name', desc: 'Site name' }
  ]
};

export default function EmailTemplates() {
  const [templates, setTemplates] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      const data = await api.get('/email-templates');
      setTemplates(data);
    } catch (err) {
      setError('Failed to load email templates');
    } finally {
      setLoading(false);
    }
  };

  const loadTemplate = async (id) => {
    try {
      setError('');
      setSuccess('');
      const data = await api.get(`/email-templates/${id}`);
      setSelected(data);
    } catch (err) {
      setError('Failed to load template');
    }
  };

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await api.put(`/email-templates/${selected.id}`, {
        subject: selected.subject,
        html_body: selected.html_body
      });
      setSuccess('Template saved');
      loadTemplates();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  // Template editor view
  if (selected) {
    const vars = VARIABLE_REFERENCE[selected.slug] || [];
    return (
      <div className="space-y-6 max-w-4xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => setSelected(null)} className="p-2 hover:bg-gray-100 rounded-lg">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{selected.name}</h1>
              <p className="text-sm text-gray-500">{selected.slug}</p>
            </div>
          </div>
          <button onClick={handleSave} disabled={saving} className="btn btn-primary">
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />{error}
          </div>
        )}
        {success && (
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700">
            <CheckCircle className="w-5 h-5 flex-shrink-0" />{success}
          </div>
        )}

        <div className="card p-6 space-y-4">
          <div>
            <label className="label">Subject</label>
            <input
              type="text"
              value={selected.subject}
              onChange={(e) => setSelected({ ...selected, subject: e.target.value })}
              className="input"
            />
          </div>

          <div>
            <label className="label">HTML Body</label>
            <textarea
              value={selected.html_body}
              onChange={(e) => setSelected({ ...selected, html_body: e.target.value })}
              className="input font-mono text-sm"
              rows={20}
            />
          </div>
        </div>

        {vars.length > 0 && (
          <div className="card p-6">
            <h3 className="font-semibold text-gray-900 mb-3">Available Variables</h3>
            <div className="space-y-2">
              {vars.map(v => (
                <div key={v.var} className="flex items-start gap-3">
                  <code className="bg-gray-100 px-2 py-1 rounded text-sm font-mono text-primary-700 whitespace-nowrap">
                    {'{{' + v.var + '}}'}
                  </code>
                  <span className="text-sm text-gray-600">{v.desc}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Live preview */}
        <div className="card p-6">
          <h3 className="font-semibold text-gray-900 mb-3">Preview</h3>
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <iframe
              srcDoc={selected.html_body}
              title="Email preview"
              className="w-full h-96"
              sandbox=""
            />
          </div>
        </div>
      </div>
    );
  }

  // Template list view
  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-900">Email Templates</h1>
      <p className="text-gray-500">
        Customize the emails sent to customers for orders, shipping updates, payments, and password resets.
      </p>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />{error}
        </div>
      )}

      <div className="space-y-3">
        {templates.map(tpl => (
          <button
            key={tpl.id}
            onClick={() => loadTemplate(tpl.id)}
            className="w-full card p-4 flex items-center gap-4 hover:bg-gray-50 transition-colors text-left"
          >
            <div className="w-10 h-10 bg-primary-50 rounded-lg flex items-center justify-center flex-shrink-0">
              <Mail className="w-5 h-5 text-primary-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-900">{tpl.name}</p>
              <p className="text-sm text-gray-500 truncate">{tpl.subject}</p>
            </div>
            <span className="text-xs text-gray-400">{tpl.slug}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
