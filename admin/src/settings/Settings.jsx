import { useState, useEffect } from 'react';
import api from '../lib/api';
import { Save, AlertCircle, CheckCircle, Send } from 'lucide-react';
import { useSettings } from '../context/SettingsContext';

export default function Settings() {
  const { refreshSettings } = useSettings();
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
    smtp_host: '',
    smtp_port: '587',
    smtp_user: '',
    smtp_pass: '',
    smtp_from: '',
    smtp_secure: 'false',
    emailjs_service_id: '',
    emailjs_template_id: '',
    emailjs_public_key: '',
    emailjs_private_key: '',
    resend_api_key: '',
    resend_from: '',
    admin_page_size: '25'
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
      setSettings({
        site_name: data.site_name || '',
        site_tagline: data.site_tagline || '',
        site_url: data.site_url || '',
        default_meta_title: data.default_meta_title || '',
        default_meta_description: data.default_meta_description || '',
        google_analytics_id: data.google_analytics_id || '',
        site_address: data.site_address || '',
        google_maps_api_key: data.google_maps_api_key || '',
        robots_txt: data.robots_txt || 'User-agent: *\nAllow: /',
        home_page_id: data.home_page_id || '',
        stripe_public_key: data.stripe_public_key || '',
        stripe_secret_key: data.stripe_secret_key || '',
        paypal_client_id: data.paypal_client_id || '',
        paypal_client_secret: data.paypal_client_secret || '',
        paypal_mode: data.paypal_mode || 'sandbox',
        smtp_host: data.smtp_host || '',
        smtp_port: data.smtp_port || '587',
        smtp_user: data.smtp_user || '',
        smtp_pass: data.smtp_pass || '',
        smtp_from: data.smtp_from || '',
        smtp_secure: data.smtp_secure || 'false',
        emailjs_service_id: data.emailjs_service_id || '',
        emailjs_template_id: data.emailjs_template_id || '',
        emailjs_public_key: data.emailjs_public_key || '',
        emailjs_private_key: data.emailjs_private_key || '',
        resend_api_key: data.resend_api_key || '',
        resend_from: data.resend_from || '',
        admin_page_size: data.admin_page_size || '25'
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
    setError('');
    setSuccess('');
    try {
      await api.post('/email-templates/test', { to: testEmail });
      setSuccess(`Test email sent to ${testEmail}`);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to send test email');
    } finally {
      setSendingTest(false);
    }
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

      <div className="max-w-3xl mx-auto space-y-6">
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

      {/* General Settings */}
      <div className="card p-6 space-y-4">
        <h2 className="font-semibold text-gray-900 pb-2 border-b border-gray-200">
          General
        </h2>

        <div>
          <label className="label">Site Name</label>
          <input
            type="text"
            value={settings.site_name}
            onChange={(e) => setSettings({ ...settings, site_name: e.target.value })}
            className="input"
            placeholder="My Website"
          />
        </div>

        <div>
          <label className="label">Site Tagline</label>
          <input
            type="text"
            value={settings.site_tagline}
            onChange={(e) => setSettings({ ...settings, site_tagline: e.target.value })}
            className="input"
            placeholder="Just another awesome website"
          />
        </div>

        <div>
          <label className="label">Site URL</label>
          <input
            type="url"
            value={settings.site_url}
            onChange={(e) => setSettings({ ...settings, site_url: e.target.value })}
            className="input"
            placeholder="https://example.com"
          />
          <p className="text-xs text-gray-500 mt-1">
            Used for sitemap generation and canonical URLs
          </p>
        </div>

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
          <p className="text-xs text-gray-500 mt-1">
            The page to display at the root URL (/)
          </p>
        </div>

        <div>
          <label className="label">Site Address</label>
          <textarea
            value={settings.site_address}
            onChange={(e) => setSettings({ ...settings, site_address: e.target.value })}
            className="input"
            rows={2}
            placeholder="123 Main St, City, Country"
          />
          <p className="text-xs text-gray-500 mt-1">
            Used in contact forms and footers
          </p>
        </div>

        <div>
          <label className="label">Admin Entries Per Page</label>
          <input
            type="number"
            min="1"
            max="100"
            value={settings.admin_page_size}
            onChange={(e) => setSettings({ ...settings, admin_page_size: e.target.value })}
            className="input"
            placeholder="25"
          />
          <p className="text-xs text-gray-500 mt-1">
            Default number of items to show in admin tables (e.g. Products, Pages)
          </p>
        </div>
      </div>

      {/* SEO Settings */}
      <div className="card p-6 space-y-4">
        <h2 className="font-semibold text-gray-900 pb-2 border-b border-gray-200">
          Default SEO
        </h2>

        <div>
          <label className="label">Default Meta Title</label>
          <input
            type="text"
            value={settings.default_meta_title}
            onChange={(e) =>
              setSettings({ ...settings, default_meta_title: e.target.value })
            }
            className="input"
            placeholder="Default page title"
          />
          <p className="text-xs text-gray-500 mt-1">
            Used when pages don't have a custom meta title
          </p>
        </div>

        <div>
          <label className="label">Default Meta Description</label>
          <textarea
            value={settings.default_meta_description}
            onChange={(e) =>
              setSettings({ ...settings, default_meta_description: e.target.value })
            }
            className="input"
            rows={3}
            placeholder="Default description for search engines"
          />
        </div>

        <div>
          <label className="label">Robots.txt Content</label>
          <textarea
            value={settings.robots_txt}
            onChange={(e) => setSettings({ ...settings, robots_txt: e.target.value })}
            className="input font-mono text-sm"
            rows={6}
            placeholder="User-agent: *\nAllow: /"
          />
        </div>
      </div>

      {/* Analytics */}
      <div className="card p-6 space-y-4">
        <h2 className="font-semibold text-gray-900 pb-2 border-b border-gray-200">
          Analytics
        </h2>

        <div>
          <label className="label">Google Analytics ID</label>
          <input
            type="text"
            value={settings.google_analytics_id}
            onChange={(e) =>
              setSettings({ ...settings, google_analytics_id: e.target.value })
            }
            className="input"
            placeholder="G-XXXXXXXXXX or UA-XXXXXXXX-X"
          />
          <p className="text-xs text-gray-500 mt-1">
            Leave empty to disable Google Analytics
          </p>
        </div>

        <div>
          <label className="label">Google Maps API Key</label>
          <input
            type="password"
            value={settings.google_maps_api_key}
            onChange={(e) =>
              setSettings({ ...settings, google_maps_api_key: e.target.value })
            }
            className="input"
            placeholder="AIza..."
          />
          <p className="text-xs text-gray-500 mt-1">
            Required for the Google Maps block
          </p>
        </div>
      </div>

      {/* Payment Methods */}
      <div className="card p-6 space-y-4">
        <h2 className="font-semibold text-gray-900 pb-2 border-b border-gray-200">
          Payment Methods
        </h2>

        {/* Stripe */}
        <div className="border-b border-gray-200 pb-4">
          <h3 className="font-medium text-gray-900 mb-3">Stripe</h3>
          <div className="space-y-3">
            <div>
              <label className="label">Stripe Public Key</label>
              <input
                type="password"
                value={settings.stripe_public_key}
                onChange={(e) =>
                  setSettings({ ...settings, stripe_public_key: e.target.value })
                }
                className="input"
                placeholder="pk_test_..."
              />
            </div>
            <div>
              <label className="label">Stripe Secret Key</label>
              <input
                type="password"
                value={settings.stripe_secret_key}
                onChange={(e) =>
                  setSettings({ ...settings, stripe_secret_key: e.target.value })
                }
                className="input"
                placeholder="sk_test_..."
              />
            </div>
            <p className="text-xs text-gray-500">
              Get your keys from <a href="https://dashboard.stripe.com/apikeys" target="_blank" className="text-blue-600 hover:underline">Stripe Dashboard</a>
            </p>
          </div>
        </div>

        {/* PayPal */}
        <div>
          <h3 className="font-medium text-gray-900 mb-3">PayPal</h3>
          <div className="space-y-3">
            <div>
              <label className="label">PayPal Mode</label>
              <select
                value={settings.paypal_mode}
                onChange={(e) =>
                  setSettings({ ...settings, paypal_mode: e.target.value })
                }
                className="input"
              >
                <option value="sandbox">Sandbox (Testing)</option>
                <option value="live">Live (Production)</option>
              </select>
            </div>
            <div>
              <label className="label">PayPal Client ID</label>
              <input
                type="password"
                value={settings.paypal_client_id}
                onChange={(e) =>
                  setSettings({ ...settings, paypal_client_id: e.target.value })
                }
                className="input"
                placeholder="AY2..."
              />
            </div>
            <div>
              <label className="label">PayPal Client Secret</label>
              <input
                type="password"
                value={settings.paypal_client_secret}
                onChange={(e) =>
                  setSettings({ ...settings, paypal_client_secret: e.target.value })
                }
                className="input"
                placeholder="ECn..."
              />
            </div>
            <p className="text-xs text-gray-500">
              Get your credentials from <a href="https://developer.paypal.com/dashboard" target="_blank" className="text-blue-600 hover:underline">PayPal Developer Dashboard</a>
            </p>
          </div>
        </div>
      </div>

      {/* Email / SMTP */}
      <div className="card p-6 space-y-4">
        <h2 className="font-semibold text-gray-900 pb-2 border-b border-gray-200">
          Email / SMTP
        </h2>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">SMTP Host</label>
            <input
              type="text"
              value={settings.smtp_host}
              onChange={(e) => setSettings({ ...settings, smtp_host: e.target.value })}
              className="input"
              placeholder="smtp.example.com"
            />
          </div>
          <div>
            <label className="label">SMTP Port</label>
            <input
              type="text"
              value={settings.smtp_port}
              onChange={(e) => setSettings({ ...settings, smtp_port: e.target.value })}
              className="input"
              placeholder="587"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">SMTP Username</label>
            <input
              type="text"
              value={settings.smtp_user}
              onChange={(e) => setSettings({ ...settings, smtp_user: e.target.value })}
              className="input"
              placeholder="user@example.com"
            />
          </div>
          <div>
            <label className="label">SMTP Password</label>
            <input
              type="password"
              value={settings.smtp_pass}
              onChange={(e) => setSettings({ ...settings, smtp_pass: e.target.value })}
              className="input"
              placeholder="••••••••"
            />
          </div>
        </div>

        <div>
          <label className="label">From Address</label>
          <input
            type="email"
            value={settings.smtp_from}
            onChange={(e) => setSettings({ ...settings, smtp_from: e.target.value })}
            className="input"
            placeholder="noreply@example.com"
          />
          <p className="text-xs text-gray-500 mt-1">
            The email address that notifications are sent from
          </p>
        </div>

        <div>
          <label className="label">
            <input
              type="checkbox"
              checked={settings.smtp_secure === 'true'}
              onChange={(e) => setSettings({ ...settings, smtp_secure: e.target.checked ? 'true' : 'false' })}
              className="mr-2"
            />
            Use SSL/TLS (port 465)
          </label>
        </div>

        <div className="border-t border-gray-200 pt-4">
          <label className="label">Send Test Email</label>
          <div className="flex gap-2">
            <input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              className="input flex-1"
              placeholder="test@example.com"
            />
            <button
              onClick={handleTestEmail}
              disabled={sendingTest || !testEmail}
              className="btn btn-secondary whitespace-nowrap"
            >
              <Send className="w-4 h-4 mr-2" />
              {sendingTest ? 'Sending...' : 'Send Test'}
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Save your settings first, then send a test email to verify the configuration (uses Resend/EmailJS if configured, otherwise SMTP)
          </p>
        </div>
      </div>

      {/* Resend Integration */}
      <div className="card p-6 space-y-4 border-indigo-100 bg-indigo-50/10">
        <h2 className="font-semibold text-gray-900 pb-2 border-b border-gray-200">
          Resend Integration
        </h2>
        <p className="text-sm text-gray-500">
          Modern email API. If configured, Resend will be the primary email provider.
        </p>

        <div>
          <label className="label">Resend API Key</label>
          <input
            type="password"
            value={settings.resend_api_key}
            onChange={(e) => setSettings({ ...settings, resend_api_key: e.target.value })}
            className="input"
            placeholder="re_..."
          />
        </div>

        <div>
          <label className="label">From Email</label>
          <input
            type="text"
            value={settings.resend_from}
            onChange={(e) => setSettings({ ...settings, resend_from: e.target.value })}
            className="input"
            placeholder="Name <hello@yourdomain.com>"
          />
          <p className="text-xs text-gray-500 mt-1">
            Must be a verified domain in your Resend account.
          </p>
        </div>

        <p className="text-xs text-gray-500">
          Get your key from <a href="https://resend.com/api-keys" target="_blank" className="text-blue-600 hover:underline">Resend Dashboard</a>. 
          Templates from the <strong>Email Templates</strong> section will be used.
        </p>
      </div>

      {/* EmailJS Integration */}
      <div className="card p-6 space-y-4">
        <h2 className="font-semibold text-gray-900 pb-2 border-b border-gray-200">
          EmailJS Integration
        </h2>
        <p className="text-sm text-gray-500">
          Alternative to SMTP. If configured, EmailJS will be used as the primary email provider.
        </p>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Service ID</label>
            <input
              type="text"
              value={settings.emailjs_service_id}
              onChange={(e) => setSettings({ ...settings, emailjs_service_id: e.target.value })}
              className="input"
              placeholder="service_..."
            />
          </div>
          <div>
            <label className="label">Default Template ID</label>
            <input
              type="text"
              value={settings.emailjs_template_id}
              onChange={(e) => setSettings({ ...settings, emailjs_template_id: e.target.value })}
              className="input"
              placeholder="template_..."
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Public Key</label>
            <input
              type="text"
              value={settings.emailjs_public_key}
              onChange={(e) => setSettings({ ...settings, emailjs_public_key: e.target.value })}
              className="input"
              placeholder="user_..."
            />
          </div>
          <div>
            <label className="label">Private Key</label>
            <input
              type="password"
              value={settings.emailjs_private_key}
              onChange={(e) => setSettings({ ...settings, emailjs_private_key: e.target.value })}
              className="input"
              placeholder="••••••••"
            />
          </div>
        </div>
        <p className="text-xs text-gray-500">
          Get these from your <a href="https://dashboard.emailjs.com/" target="_blank" className="text-blue-600 hover:underline">EmailJS Dashboard</a>. 
          The template variables passed will include all standard CMS fields plus <code>message</code> and <code>subject</code>.
        </p>
      </div>
    </div>
  </div>
);
}
