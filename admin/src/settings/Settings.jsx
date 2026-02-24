import { useState, useEffect } from 'react';
import api from '../lib/api';
import { Save, AlertCircle, CheckCircle, Send, Settings as SettingsIcon, Search, CreditCard, Mail, ShoppingCart } from 'lucide-react';
import { useSettings } from '../context/SettingsContext';
import { toast } from 'sonner';
import AmazonDashboard from './AmazonDashboard';

const TABS = [
  { id: 'general', label: 'General', icon: SettingsIcon },
  { id: 'seo', label: 'SEO & Analytics', icon: Search },
  { id: 'payments', label: 'Payments', icon: CreditCard },
  { id: 'email', label: 'Email', icon: Mail },
  { id: 'amazon', label: 'Amazon', icon: ShoppingCart },
];

export default function Settings() {
  const { refreshSettings } = useSettings();
  const [activeTab, setActiveTab] = useState('general');
  const [settings, setSettings] = useState({
    site_name: '',
    site_tagline: '',
    site_url: '',
    default_meta_title: '',
    default_meta_description: '',
    google_analytics_id: '',
    robots_txt: '',
    home_page_id: '',
    site_address: '',
    google_maps_api_key: '',
    stripe_public_key: '',
    stripe_secret_key: '',
    paypal_client_id: '',
    paypal_client_secret: '',
    paypal_mode: 'sandbox',
    email_provider: 'mailersend',
    resend_api_key: '',
    resend_from: '',
    mailersend_api_key: '',
    mailersend_from: '',
    admin_page_size: '25',
    amazon_seller_id: '',
    amazon_marketplace_id: '',
    amazon_client_id: '',
    amazon_client_secret: '',
    amazon_refresh_token: '',
    amazon_region: 'na',
  });
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [testEmail, setTestEmail] = useState('');
  const [sendingTest, setSendingTest] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const [data, pagesData] = await Promise.all([
        api.get('/settings'),
        api.get('/pages')
      ]);
      setSettings(prev => {
        const loaded = {};
        for (const key of Object.keys(prev)) {
          loaded[key] = data[key] || prev[key];
        }
        if (!data.robots_txt) loaded.robots_txt = 'User-agent: *\nAllow: /';
        return loaded;
      });
      setPages(pagesData.data || pagesData || []);
    } catch (err) {
      console.error('Failed to load settings:', err);
      setError('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setError('');
    setSuccess('');
    setSaving(true);

    try {
      const response = await api.put('/settings', settings);
      await refreshSettings();
      if (response.warning) {
        setError(response.warning);
        setSuccess('General settings saved, but there were integration issues (see above).');
      } else {
        setSuccess('Settings saved successfully');
      }
    } catch (err) {
      setError(err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleTestEmail = async () => {
    if (!testEmail) return;
    setSendingTest(true);
    const toastId = toast.loading(`Sending test email to ${testEmail}...`);
    try {
      await api.post('/email-templates/test', { to: testEmail });
      toast.success('Test email sent!', { id: toastId });
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || 'Failed to send test email', { id: toastId });
    } finally {
      setSendingTest(false);
    }
  };

  const field = (key, label, opts = {}) => {
    const { type = 'text', placeholder = '', hint = '', rows } = opts;
    return (
      <div>
        <label className="label">{label}</label>
        {rows ? (
          <textarea
            value={settings[key]}
            onChange={(e) => setSettings({ ...settings, [key]: e.target.value })}
            className={`input ${opts.className || ''}`}
            rows={rows}
            placeholder={placeholder}
          />
        ) : (
          <input
            type={type}
            value={settings[key]}
            onChange={(e) => setSettings({ ...settings, [key]: e.target.value })}
            className="input"
            placeholder={placeholder}
            min={opts.min}
            max={opts.max}
          />
        )}
        {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
      </div>
    );
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
      <div className="sticky top-0 z-30 bg-gray-50/80 backdrop-blur-sm -mx-4 px-4 py-4 mb-6 border-b border-gray-200">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <button onClick={handleSave} disabled={saving} className="btn btn-primary">
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto">
        {/* Tab Navigation */}
        <div className="flex gap-1 border-b border-gray-200 mb-6 overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Alerts */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 mb-6">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            {error}
          </div>
        )}
        {success && (
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700 mb-6">
            <CheckCircle className="w-5 h-5 flex-shrink-0" />
            {success}
          </div>
        )}

        {/* General Tab */}
        {activeTab === 'general' && (
          <div className="space-y-6">
            <div className="card p-6 space-y-4">
              <h2 className="font-semibold text-gray-900 pb-2 border-b border-gray-200">General</h2>
              {field('site_name', 'Site Name', { placeholder: 'My Website' })}
              {field('site_tagline', 'Site Tagline', { placeholder: 'Just another awesome website' })}
              {field('site_url', 'Site URL', { type: 'url', placeholder: 'https://example.com', hint: 'Used for sitemap generation and canonical URLs' })}
              <div>
                <label className="label">Home Page</label>
                <select
                  value={settings.home_page_id}
                  onChange={(e) => setSettings({ ...settings, home_page_id: e.target.value })}
                  className="input"
                >
                  <option value="">None (use root path)</option>
                  {pages.map((page) => (
                    <option key={page.id} value={page.id}>
                      {page.title || 'Untitled'} ({page.slug})
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">The page to display at the root URL (/)</p>
              </div>
              {field('site_address', 'Site Address', { rows: 2, placeholder: '123 Main St, City, Country', hint: 'Used in contact forms and footers' })}
              {field('admin_page_size', 'Admin Entries Per Page', { type: 'number', placeholder: '25', min: 1, max: 100, hint: 'Default number of items to show in admin tables' })}
            </div>
          </div>
        )}

        {/* SEO & Analytics Tab */}
        {activeTab === 'seo' && (
          <div className="space-y-6">
            <div className="card p-6 space-y-4">
              <h2 className="font-semibold text-gray-900 pb-2 border-b border-gray-200">Default SEO</h2>
              {field('default_meta_title', 'Default Meta Title', { placeholder: 'Default page title', hint: "Used when pages don't have a custom meta title" })}
              {field('default_meta_description', 'Default Meta Description', { rows: 3, placeholder: 'Default description for search engines' })}
              {field('robots_txt', 'Robots.txt Content', { rows: 6, placeholder: 'User-agent: *\nAllow: /', className: 'font-mono text-sm' })}
            </div>

            <div className="card p-6 space-y-4">
              <h2 className="font-semibold text-gray-900 pb-2 border-b border-gray-200">Analytics</h2>
              {field('google_analytics_id', 'Google Analytics ID', { placeholder: 'G-XXXXXXXXXX or UA-XXXXXXXX-X', hint: 'Leave empty to disable Google Analytics' })}
              {field('google_maps_api_key', 'Google Maps API Key', { type: 'password', placeholder: 'AIza...', hint: 'Required for the Google Maps block' })}
            </div>
          </div>
        )}

        {/* Payments Tab */}
        {activeTab === 'payments' && (
          <div className="space-y-6">
            <div className="card p-6 space-y-4">
              <h2 className="font-semibold text-gray-900 pb-2 border-b border-gray-200">Stripe</h2>
              {field('stripe_public_key', 'Stripe Public Key', { type: 'password', placeholder: 'pk_test_...' })}
              {field('stripe_secret_key', 'Stripe Secret Key', { type: 'password', placeholder: 'sk_test_...' })}
              <p className="text-xs text-gray-500">
                Get your keys from <a href="https://dashboard.stripe.com/apikeys" target="_blank" className="text-blue-600 hover:underline">Stripe Dashboard</a>
              </p>
            </div>

            <div className="card p-6 space-y-4">
              <h2 className="font-semibold text-gray-900 pb-2 border-b border-gray-200">PayPal</h2>
              <div>
                <label className="label">PayPal Mode</label>
                <select
                  value={settings.paypal_mode}
                  onChange={(e) => setSettings({ ...settings, paypal_mode: e.target.value })}
                  className="input"
                >
                  <option value="sandbox">Sandbox (Testing)</option>
                  <option value="live">Live (Production)</option>
                </select>
              </div>
              {field('paypal_client_id', 'PayPal Client ID', { type: 'password', placeholder: 'AY2...' })}
              {field('paypal_client_secret', 'PayPal Client Secret', { type: 'password', placeholder: 'ECn...' })}
              <p className="text-xs text-gray-500">
                Get your credentials from <a href="https://developer.paypal.com/dashboard" target="_blank" className="text-blue-600 hover:underline">PayPal Developer Dashboard</a>
              </p>
            </div>
          </div>
        )}

        {/* Email Tab */}
        {activeTab === 'email' && (
          <div className="space-y-6">
            <div className="card p-6 space-y-4">
              <h2 className="font-semibold text-gray-900 pb-2 border-b border-gray-200">Email Provider</h2>
              <div>
                <label className="label">Active Provider</label>
                <select
                  value={settings.email_provider}
                  onChange={(e) => setSettings({ ...settings, email_provider: e.target.value })}
                  className="input"
                >
                  <option value="mailersend">MailerSend</option>
                  <option value="resend">Resend</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  All transactional emails (order confirmations, password resets, etc.) will use the selected provider.
                  If unconfigured, the other provider is used as fallback.
                </p>
              </div>
            </div>

            <div className={`card p-6 space-y-4 ${settings.email_provider === 'mailersend' ? 'ring-2 ring-primary-200' : ''}`}>
              <h2 className="font-semibold text-gray-900 pb-2 border-b border-gray-200">
                MailerSend
                {settings.email_provider === 'mailersend' && <span className="ml-2 text-xs font-normal text-primary-600 bg-primary-50 px-2 py-0.5 rounded-full">Active</span>}
              </h2>
              {field('mailersend_api_key', 'API Key', { type: 'password', placeholder: 'mlsn.xxx...' })}
              {field('mailersend_from', 'From Email', { placeholder: 'Name <hello@yourdomain.com>', hint: 'Must be a verified domain in your MailerSend account.' })}
              <p className="text-xs text-gray-500">
                Get your key from <a href="https://app.mailersend.com/api-tokens" target="_blank" className="text-blue-600 hover:underline">MailerSend Dashboard</a>.
                Templates from the <strong>Email Templates</strong> section will be used.
              </p>
            </div>

            <div className={`card p-6 space-y-4 ${settings.email_provider === 'resend' ? 'ring-2 ring-primary-200' : ''}`}>
              <h2 className="font-semibold text-gray-900 pb-2 border-b border-gray-200">
                Resend
                {settings.email_provider === 'resend' && <span className="ml-2 text-xs font-normal text-primary-600 bg-primary-50 px-2 py-0.5 rounded-full">Active</span>}
              </h2>
              {field('resend_api_key', 'API Key', { type: 'password', placeholder: 're_...' })}
              {field('resend_from', 'From Email', { placeholder: 'Name <hello@yourdomain.com>', hint: 'Must be a verified domain in your Resend account.' })}
              <p className="text-xs text-gray-500">
                Get your key from <a href="https://resend.com/api-keys" target="_blank" className="text-blue-600 hover:underline">Resend Dashboard</a>.
              </p>
            </div>

            <div className="card p-6 space-y-4">
              <h2 className="font-semibold text-gray-900 pb-2 border-b border-gray-200">Test Email</h2>
              <div className="flex gap-2">
                <input type="email" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} className="input flex-1" placeholder="test@example.com" />
                <button onClick={handleTestEmail} disabled={sendingTest || !testEmail} className="btn btn-secondary whitespace-nowrap">
                  <Send className="w-4 h-4 mr-2" />
                  {sendingTest ? 'Sending...' : 'Send Test'}
                </button>
              </div>
              <p className="text-xs text-gray-500">Save settings first, then send a test to verify your configuration.</p>
            </div>
          </div>
        )}

        {/* Amazon Tab */}
        {activeTab === 'amazon' && (
          <AmazonDashboard settings={settings} setSettings={setSettings} onSave={handleSave} saving={saving} />
        )}
      </div>
    </div>
  );
}
