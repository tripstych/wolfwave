import { useState, useEffect } from 'react';
import api from '../lib/api';
import { Save, AlertCircle, CheckCircle, Send, Settings as SettingsIcon, Search, CreditCard, Mail, ShoppingCart, Cpu, HardDrive } from 'lucide-react';
import { useSettings } from '../context/SettingsContext';
import { useTranslation } from '../context/TranslationContext';
import { toast } from 'sonner';
import AmazonDashboard from './AmazonDashboard';

const AWS_REGIONS = [
  { value: 'us-east-1', label: 'US East (N. Virginia)' },
  { value: 'us-east-2', label: 'US East (Ohio)' },
  { value: 'us-west-1', label: 'US West (N. California)' },
  { value: 'us-west-2', label: 'US West (Oregon)' },
  { value: 'af-south-1', label: 'Africa (Cape Town)' },
  { value: 'ap-east-1', label: 'Asia Pacific (Hong Kong)' },
  { value: 'ap-south-1', label: 'Asia Pacific (Mumbai)' },
  { value: 'ap-northeast-3', label: 'Asia Pacific (Osaka)' },
  { value: 'ap-northeast-2', label: 'Asia Pacific (Seoul)' },
  { value: 'ap-southeast-1', label: 'Asia Pacific (Singapore)' },
  { value: 'ap-southeast-2', label: 'Asia Pacific (Sydney)' },
  { value: 'ap-northeast-1', label: 'Asia Pacific (Tokyo)' },
  { value: 'ca-central-1', label: 'Canada (Central)' },
  { value: 'eu-central-1', label: 'Europe (Frankfurt)' },
  { value: 'eu-west-1', label: 'Europe (Ireland)' },
  { value: 'eu-west-2', label: 'Europe (London)' },
  { value: 'eu-south-1', label: 'Europe (Milan)' },
  { value: 'eu-west-3', label: 'Europe (Paris)' },
  { value: 'eu-north-1', label: 'Europe (Stockholm)' },
  { value: 'me-south-1', label: 'Middle East (Bahrain)' },
  { value: 'sa-east-1', label: 'South America (São Paulo)' },
];

export default function Settings() {
  const { refreshSettings } = useSettings();
  const { _ } = useTranslation();
  const [activeTab, setActiveTab] = useState('general');
  const [enabledModules, setEnabledModules] = useState([]);

  const ALL_TABS = [
    { id: 'general', label: _('settings.tab.general', 'General'), icon: SettingsIcon },
    { id: 'seo', label: _('settings.tab.seo', 'SEO & Analytics'), icon: Search },
    { id: 'storage', label: _('settings.tab.storage', 'Storage'), icon: HardDrive },
    { id: 'payments', label: _('settings.tab.payments', 'Payments'), icon: CreditCard, module: 'Ecommerce' },
    { id: 'email', label: _('settings.tab.email', 'Email'), icon: Mail },
    { id: 'amazon', label: _('settings.tab.amazon', 'Amazon'), icon: ShoppingCart, module: 'Amazon Integration' },
    { id: 'ai', label: _('settings.tab.ai', 'AI Services'), icon: Cpu, module: 'AI Services' },
    { id: 'shipstation', label: _('settings.tab.shipstation', 'ShipStation'), icon: ShoppingCart },
  ];

  // Filter tabs based on enabled modules
  const TABS = ALL_TABS.filter(tab => !tab.module || enabledModules.includes(tab.module));

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
    openai_api_key: '',
    openai_api_url: '',
    anthropic_api_key: '',
    gemini_api_key: '',
    gemini_model: '',
    ai_simulation_mode: 'false',
    ai_default_provider: 'gemini',
    ai_fallback_provider: 'none',
    anthropic_model: '',
    openai_model: '',
    openai_image_model: '',
    gemini_image_model: '',
    s3_bucket_name: '',
    s3_region: 'us-east-1',
    s3_auth_method: 'access_key',
    s3_access_key_id: '',
    s3_secret_access_key: '',
    s3_role_arn: '',
    s3_external_id: '',
    s3_prefix: '',
    shipstation_auth_key: '',
    shipstation_api_secret: '',
  });
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [testEmail, setTestEmail] = useState('');
  const [sendingTest, setSendingTest] = useState(false);
  const [testingS3, setTestingS3] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const [data, pagesData, modulesData] = await Promise.all([
        api.get('/settings'),
        api.get('/pages'),
        api.get('/settings/modules')
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
      setEnabledModules(modulesData || []);
    } catch (err) {
      console.error('Failed to load settings:', err);
      setError(_('settings.error.load_failed', 'Failed to load settings'));
    } finally {
      setLoading(false);
    }
  };

  // Ensure active tab is valid after modules load
  useEffect(() => {
    if (!loading && !TABS.find(t => t.id === activeTab)) {
      setActiveTab('general');
    }
  }, [enabledModules, loading]);

  const handleSave = async () => {
    setError('');
    setSuccess('');
    setSaving(true);

    try {
      const response = await api.put('/settings', settings);
      await refreshSettings();
      if (response.warning) {
        setError(response.warning);
        setSuccess(_('settings.success.partial', 'General settings saved, but there were integration issues (see above).'));
      } else {
        setSuccess(_('settings.success.saved', 'Settings saved successfully'));
      }
    } catch (err) {
      setError(err.message || _('settings.error.save_failed', 'Failed to save settings'));
    } finally {
      setSaving(false);
    }
  };

  const handleTestEmail = async () => {
    if (!testEmail) return;
    setSendingTest(true);
    const toastId = toast.loading(_('settings.email.sending_test', `Sending test email to ${testEmail}...`));
    try {
      await api.post('/email-templates/test', { to: testEmail });
      toast.success(_('settings.email.test_sent', 'Test email sent!'), { id: toastId });
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || _('settings.email.test_failed', 'Failed to send test email'), { id: toastId });
    } finally {
      setSendingTest(false);
    }
  };

  const handleTestS3 = async () => {
    setTestingS3(true);
    const toastId = toast.loading(_('settings.storage.testing', 'Testing S3 connection...'));
    try {
      const res = await api.post('/settings/test-s3', {
        s3_bucket_name: settings.s3_bucket_name,
        s3_region: settings.s3_region,
        s3_auth_method: settings.s3_auth_method,
        s3_access_key_id: settings.s3_access_key_id,
        s3_secret_access_key: settings.s3_secret_access_key,
        s3_role_arn: settings.s3_role_arn,
        s3_external_id: settings.s3_external_id,
      });
      toast.success(res.message || _('settings.storage.test_success', 'S3 connection successful!'), { id: toastId });
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || _('settings.storage.test_failed', 'S3 connection failed'), { id: toastId });
    } finally {
      setTestingS3(false);
    }
  };

  const field = (key, label, opts = {}) => {
    const { type = 'text', placeholder = '', hint = '', rows } = opts;
    const fieldId = `input-${key.replace(/_/g, '-')}`;
    return (
      <div>
        <label className="label" htmlFor={fieldId}>{label}</label>
        {rows ? (
          <textarea
            id={fieldId}
            value={settings[key]}
            onChange={(e) => setSettings({ ...settings, [key]: e.target.value })}
            className={`input ${opts.className || ''}`}
            rows={rows}
            placeholder={placeholder}
          />
        ) : (
          <input
            id={fieldId}
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
          <h1 className="text-2xl font-bold text-gray-900">{_('settings.title', 'Settings')}</h1>
          <button id="btn-save-settings" onClick={handleSave} disabled={saving} className="btn btn-primary">
            <Save className="w-4 h-4 mr-2" />
            {saving ? _('common.saving', 'Saving...') : _('common.save_changes', 'Save Changes')}
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
              <h2 className="font-semibold text-gray-900 pb-2 border-b border-gray-200">{_('settings.section.general', 'General')}</h2>
              {field('site_name', _('settings.site_name', 'Site Name'), { placeholder: _('settings.site_name_placeholder', 'My Website') })}
              {field('site_tagline', _('settings.site_tagline', 'Site Tagline'), { placeholder: _('settings.site_tagline_placeholder', 'Just another awesome website') })}
              {field('site_url', _('settings.site_url', 'Site URL'), { type: 'url', placeholder: 'https://example.com', hint: _('settings.site_url_hint', 'Used for sitemap generation and canonical URLs') })}
              <div>
                <label className="label" htmlFor="select-home-page">{_('settings.home_page', 'Home Page')}</label>
                <select
                  id="select-home-page"
                  value={settings.home_page_id}
                  onChange={(e) => setSettings({ ...settings, home_page_id: e.target.value })}
                  className="input"
                >
                  <option value="">{_('settings.home_page_root', 'None (use root path)')}</option>
                  {pages.map((page) => (
                    <option key={page.id} value={page.id}>
                      {page.title || _('common.untitled', 'Untitled')} ({page.slug})
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">{_('settings.home_page_hint', 'The page to display at the root URL (/)')}</p>
              </div>
              {field('site_address', _('settings.site_address', 'Site Address'), { rows: 2, placeholder: '123 Main St, City, Country', hint: _('settings.site_address_hint', 'Used in contact forms and footers') })}
              {field('admin_page_size', _('settings.admin_page_size', 'Admin Entries Per Page'), { type: 'number', placeholder: '25', min: 1, max: 100, hint: _('settings.admin_page_size_hint', 'Default number of items to show in admin tables') })}
            </div>
          </div>
        )}

        {/* SEO & Analytics Tab */}
        {activeTab === 'seo' && (
          <div className="space-y-6">
            <div className="card p-6 space-y-4">
              <h2 className="font-semibold text-gray-900 pb-2 border-b border-gray-200">{_('settings.section.seo', 'Default SEO')}</h2>
              {field('default_meta_title', _('settings.meta_title', 'Default Meta Title'), { placeholder: _('settings.meta_title_placeholder', 'Default page title'), hint: _('settings.meta_title_hint', "Used when pages don't have a custom meta title") })}
              {field('default_meta_description', _('settings.meta_description', 'Default Meta Description'), { rows: 3, placeholder: _('settings.meta_description_placeholder', 'Default description for search engines') })}
              {field('robots_txt', _('settings.robots_txt', 'Robots.txt Content'), { rows: 6, placeholder: 'User-agent: *\nAllow: /', className: 'font-mono text-sm' })}
            </div>

            <div className="card p-6 space-y-4">
              <h2 className="font-semibold text-gray-900 pb-2 border-b border-gray-200">{_('settings.section.analytics', 'Analytics')}</h2>
              {field('google_analytics_id', _('settings.google_analytics', 'Google Analytics ID'), { placeholder: 'G-XXXXXXXXXX or UA-XXXXXXXX-X', hint: _('settings.google_analytics_hint', 'Leave empty to disable Google Analytics') })}
              {field('google_maps_api_key', _('settings.google_maps', 'Google Maps API Key'), { type: 'password', placeholder: 'AIza...', hint: _('settings.google_maps_hint', 'Required for the Google Maps block') })}
            </div>
          </div>
        )}

        {/* Storage Tab */}
        {activeTab === 'storage' && (
          <div className="space-y-6">
            {/* Setup Guide */}
            <div className="card p-6 space-y-3 bg-blue-50 border-blue-200">
              <h2 className="font-semibold text-blue-900">{_('settings.storage.guide_title', 'How to set up S3 storage')}</h2>
              <div className="text-sm text-blue-800 space-y-2">
                <p>{_('settings.storage.guide_intro', 'Store your media uploads in Amazon S3 instead of the local server. Follow these steps:')}</p>
                <ol className="list-decimal list-inside space-y-1 ml-1">
                  <li>{_('settings.storage.step1', 'Log in to the')} <a href="https://console.aws.amazon.com/s3" target="_blank" rel="noopener noreferrer" className="underline font-medium">AWS S3 Console</a> {_('settings.storage.step1_cont', 'and create a bucket (or use an existing one).')}</li>
                  <li>{_('settings.storage.step2', 'Choose an authentication method below, then fill in the credentials.')}</li>
                  <li>{_('settings.storage.step3', 'Click')} <strong>{_('common.save_changes', 'Save Changes')}</strong>, {_('settings.storage.step3_cont', 'then')} <strong>{_('settings.storage.test_connection', 'Test Connection')}</strong> {_('settings.storage.step3_end', 'to verify it works.')}</li>
                </ol>
              </div>
              <p className="text-xs text-blue-600">
                {_('settings.storage.guide_footer', "If left blank, this site will use the default site's S3 configuration. If no S3 is configured anywhere, files are stored locally on the server.")}
              </p>
            </div>

            {/* Bucket & Region */}
            <div className="card p-6 space-y-4">
              <h2 className="font-semibold text-gray-900 pb-2 border-b border-gray-200">{_('settings.storage.bucket_section', 'Bucket')}</h2>
              {field('s3_bucket_name', _('settings.storage.bucket_name', 'S3 Bucket Name'), { placeholder: 'my-media-bucket', hint: _('settings.storage.bucket_hint', 'The name of your S3 bucket. Find this in the AWS S3 Console under "Buckets".') })}
              <div>
                <label className="label">{_('settings.storage.aws_region', 'AWS Region')}</label>
                <select
                  value={settings.s3_region}
                  onChange={(e) => setSettings({ ...settings, s3_region: e.target.value })}
                  className="input"
                >
                  {AWS_REGIONS.map(r => (
                    <option key={r.value} value={r.value}>{r.label} ({r.value})</option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">{_('settings.storage.region_hint', 'Must match the region your bucket was created in. Check the bucket\'s "Properties" tab in the AWS console.')}</p>
              </div>
              {field('s3_prefix', _('settings.storage.prefix', 'Key Prefix'), { placeholder: 'my-site', hint: _('settings.storage.prefix_hint', 'Optional. A folder prefix for organizing files in the bucket. Defaults to the site subdomain if left blank.') })}
            </div>

            {/* Auth Method Selector */}
            <div className="card p-6 space-y-4">
              <h2 className="font-semibold text-gray-900 pb-2 border-b border-gray-200">{_('settings.storage.auth_section', 'Authentication')}</h2>
              <div>
                <label className="label">{_('settings.storage.auth_method', 'Auth Method')}</label>
                <select
                  value={settings.s3_auth_method}
                  onChange={(e) => setSettings({ ...settings, s3_auth_method: e.target.value })}
                  className="input"
                >
                  <option value="access_key">{_('settings.storage.auth.access_key', 'Access Key (Recommended for getting started)')}</option>
                  <option value="role">{_('settings.storage.auth.role', 'IAM Role + External ID (Recommended for production / cross-account)')}</option>
                </select>
              </div>

              {settings.s3_auth_method === 'access_key' && (
                <div className="space-y-4">
                  <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg space-y-2">
                    <p className="font-medium">{_('settings.storage.access_key.how_to', 'How to get your Access Keys:')}</p>
                    <ol className="list-decimal list-inside space-y-1 text-xs">
                      <li>{_('settings.storage.access_key.step1', 'Go to the')} <a href="https://console.aws.amazon.com/iam/home#/users" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">{_('settings.storage.access_key.iam_users', 'IAM Users page')}</a> {_('settings.storage.access_key.step1_cont', 'in AWS.')}</li>
                      <li>{_('settings.storage.access_key.step2', 'Select your user (or create one), then go to the')} <strong>{_('settings.storage.access_key.security_tab', '"Security credentials"')}</strong> {_('settings.storage.access_key.step2_cont', 'tab.')}</li>
                      <li>{_('settings.storage.access_key.step3', 'Under')} <strong>{_('settings.storage.access_key.access_keys_section', '"Access keys"')}</strong>, {_('settings.storage.access_key.step3_cont', 'click')} <strong>{_('settings.storage.access_key.create_btn', '"Create access key"')}</strong>.</li>
                      <li>{_('settings.storage.access_key.step4', 'Copy both the')} <strong>{_('settings.storage.access_key.id_label', 'Access Key ID')}</strong> {_('settings.storage.access_key.step4_cont', 'and')} <strong>{_('settings.storage.access_key.secret_label', 'Secret Access Key')}</strong> {_('settings.storage.access_key.step4_end', 'and paste them below.')}</li>
                    </ol>
                    <p className="text-xs text-amber-700">{_('settings.storage.access_key.policy_warning', 'Make sure the IAM user has a policy that allows')} <code className="bg-gray-200 px-1 rounded">s3:PutObject</code>, <code className="bg-gray-200 px-1 rounded">s3:GetObject</code>, {_('settings.storage.access_key.and', 'and')} <code className="bg-gray-200 px-1 rounded">s3:DeleteObject</code> {_('settings.storage.access_key.on_bucket', 'on your bucket.')}</p>
                  </div>
                  {field('s3_access_key_id', _('settings.storage.access_key_id', 'Access Key ID'), { placeholder: 'AKIAIOSFODNN7EXAMPLE', hint: _('settings.storage.access_key_id_hint', 'Starts with "AKIA". Found in IAM > Users > Security credentials > Access keys.') })}
                  {field('s3_secret_access_key', _('settings.storage.secret_access_key', 'Secret Access Key'), { type: 'password', placeholder: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', hint: _('settings.storage.secret_access_key_hint', 'Only shown once when created. If lost, create a new access key.') })}
                </div>
              )}

              {settings.s3_auth_method === 'role' && (
                <div className="space-y-4">
                  <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg space-y-2">
                    <p className="font-medium">{_('settings.storage.role.how_to', 'How to set up IAM Role access:')}</p>
                    <ol className="list-decimal list-inside space-y-1 text-xs">
                      <li>{_('settings.storage.role.step1', 'Go to')} <a href="https://console.aws.amazon.com/iam/home#/roles" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">{_('settings.storage.role.iam_roles', 'IAM Roles')}</a> {_('settings.storage.role.step1_cont', 'in AWS and create a new role.')}</li>
                      <li>{_('settings.storage.role.step2', 'Select')} <strong>{_('settings.storage.role.another_account', '"Another AWS account"')}</strong> {_('settings.storage.role.step2_cont', 'as the trusted entity and enter the account ID of the server running this app.')}</li>
                      <li>{_('settings.storage.role.step3', 'Check')} <strong>{_('settings.storage.role.require_external_id', '"Require external ID"')}</strong> {_('settings.storage.role.step3_cont', 'and enter a unique string (paste it below too).')}</li>
                      <li>{_('settings.storage.role.step4', 'Attach a policy granting S3 access to your bucket (PutObject, GetObject, DeleteObject).')}</li>
                      <li>{_('settings.storage.role.step5', 'Copy the')} <strong>{_('settings.storage.role.arn_label', 'Role ARN')}</strong> ({_('settings.storage.role.looks_like', 'looks like')} <code className="bg-gray-200 px-1 rounded">arn:aws:iam::123456789012:role/MyRole</code>).</li>
                    </ol>
                    <p className="text-xs text-amber-700">{_('settings.storage.role.security_hint', 'This method is more secure for production. The external ID prevents unauthorized access even if someone knows the role ARN.')}</p>
                  </div>
                  {field('s3_role_arn', _('settings.storage.role_arn', 'IAM Role ARN'), { placeholder: 'arn:aws:iam::123456789012:role/MyS3Role', hint: _('settings.storage.role_arn_hint', 'Found in IAM > Roles > your role. Copy the "ARN" value.') })}
                  {field('s3_external_id', _('settings.storage.external_id', 'External ID'), { placeholder: 'my-unique-external-id-123', hint: _('settings.storage.external_id_hint', 'A shared secret between you and the role. Must match what you entered when creating the role.') })}
                </div>
              )}
            </div>

            {/* Test Connection */}
            <div className="card p-6 space-y-4">
              <h2 className="font-semibold text-gray-900 pb-2 border-b border-gray-200">{_('settings.storage.test_connection', 'Test Connection')}</h2>
              <p className="text-sm text-gray-500">{_('settings.storage.test_hint', 'Save your settings first, then test the connection to verify everything is configured correctly.')}</p>
              <button
                onClick={handleTestS3}
                disabled={testingS3 || !settings.s3_bucket_name || (
                  settings.s3_auth_method === 'access_key'
                    ? (!settings.s3_access_key_id || !settings.s3_secret_access_key)
                    : (!settings.s3_role_arn || !settings.s3_external_id)
                )}
                className="btn btn-secondary"
              >
                <HardDrive className="w-4 h-4 mr-2" />
                {testingS3 ? _('common.testing', 'Testing...') : _('settings.storage.test_btn', 'Test S3 Connection')}
              </button>
            </div>
          </div>
        )}

        {/* Payments Tab */}
        {activeTab === 'payments' && (
          <div className="space-y-6">
            <div className="card p-6 space-y-4">
              <h2 className="font-semibold text-gray-900 pb-2 border-b border-gray-200">Stripe</h2>
              {field('stripe_public_key', _('settings.payments.stripe_public', 'Stripe Public Key'), { type: 'password', placeholder: 'pk_test_...' })}
              {field('stripe_secret_key', _('settings.payments.stripe_secret', 'Stripe Secret Key'), { type: 'password', placeholder: 'sk_test_...' })}
              <p className="text-xs text-gray-500">
                {_('settings.payments.stripe_hint', 'Get your keys from')} <a href="https://dashboard.stripe.com/apikeys" target="_blank" className="text-blue-600 hover:underline">Stripe Dashboard</a>
              </p>
            </div>

            <div className="card p-6 space-y-4">
              <h2 className="font-semibold text-gray-900 pb-2 border-b border-gray-200">PayPal</h2>
              <div>
                <label className="label">{_('settings.payments.paypal_mode', 'PayPal Mode')}</label>
                <select
                  value={settings.paypal_mode}
                  onChange={(e) => setSettings({ ...settings, paypal_mode: e.target.value })}
                  className="input"
                >
                  <option value="sandbox">{_('settings.payments.paypal.sandbox', 'Sandbox (Testing)')}</option>
                  <option value="live">{_('settings.payments.paypal.live', 'Live (Production)')}</option>
                </select>
              </div>
              {field('paypal_client_id', _('settings.payments.paypal_client_id', 'PayPal Client ID'), { type: 'password', placeholder: 'AY2...' })}
              {field('paypal_client_secret', _('settings.payments.paypal_secret', 'PayPal Client Secret'), { type: 'password', placeholder: 'ECn...' })}
              <p className="text-xs text-gray-500">
                {_('settings.payments.paypal_hint', 'Get your credentials from')} <a href="https://developer.paypal.com/dashboard" target="_blank" className="text-blue-600 hover:underline">PayPal Developer Dashboard</a>
              </p>
            </div>
          </div>
        )}

        {/* Email Tab */}
        {activeTab === 'email' && (
          <div className="space-y-6">
            <div className="card p-6 space-y-4">
              <h2 className="font-semibold text-gray-900 pb-2 border-b border-gray-200">{_('settings.section.email_provider', 'Email Provider')}</h2>
              <div>
                <label className="label">{_('settings.email.active_provider', 'Active Provider')}</label>
                <select
                  value={settings.email_provider}
                  onChange={(e) => setSettings({ ...settings, email_provider: e.target.value })}
                  className="input"
                >
                  <option value="mailersend">MailerSend</option>
                  <option value="resend">Resend</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  {_('settings.email.provider_hint', 'All transactional emails (order confirmations, password resets, etc.) will use the selected provider. If unconfigured, the other provider is used as fallback.')}
                </p>
              </div>
            </div>

            <div className={`card p-6 space-y-4 ${settings.email_provider === 'mailersend' ? 'ring-2 ring-primary-200' : ''}`}>
              <h2 className="font-semibold text-gray-900 pb-2 border-b border-gray-200">
                MailerSend
                {settings.email_provider === 'mailersend' && <span className="ml-2 text-xs font-normal text-primary-600 bg-primary-50 px-2 py-0.5 rounded-full">{_('common.active', 'Active')}</span>}
              </h2>
              {field('mailersend_api_key', _('settings.email.api_key', 'API Key'), { type: 'password', placeholder: 'mlsn.xxx...' })}
              {field('mailersend_from', _('settings.email.from_email', 'From Email'), { placeholder: 'Name <hello@yourdomain.com>', hint: _('settings.email.verified_domain_hint', 'Must be a verified domain in your MailerSend account.') })}
              <p className="text-xs text-gray-500">
                {_('settings.email.mailersend_hint_prefix', 'Get your key from')} <a href="https://app.mailersend.com/api-tokens" target="_blank" className="text-blue-600 hover:underline">MailerSend Dashboard</a>.
                {_('settings.email.mailersend_hint_suffix', 'Templates from the Email Templates section will be used.')}
              </p>
            </div>

            <div className={`card p-6 space-y-4 ${settings.email_provider === 'resend' ? 'ring-2 ring-primary-200' : ''}`}>
              <h2 className="font-semibold text-gray-900 pb-2 border-b border-gray-200">
                Resend
                {settings.email_provider === 'resend' && <span className="ml-2 text-xs font-normal text-primary-600 bg-primary-50 px-2 py-0.5 rounded-full">{_('common.active', 'Active')}</span>}
              </h2>
              {field('resend_api_key', _('settings.email.api_key', 'API Key'), { type: 'password', placeholder: 're_...' })}
              {field('resend_from', _('settings.email.from_email', 'From Email'), { placeholder: 'Name <hello@yourdomain.com>', hint: _('settings.email.resend_domain_hint', 'Must be a verified domain in your Resend account.') })}
              <p className="text-xs text-gray-500">
                {_('settings.email.resend_hint', 'Get your key from')} <a href="https://resend.com/api-keys" target="_blank" className="text-blue-600 hover:underline">Resend Dashboard</a>.
              </p>
            </div>

            <div className="card p-6 space-y-4">
              <h2 className="font-semibold text-gray-900 pb-2 border-b border-gray-200">{_('settings.email.test_title', 'Test Email')}</h2>
              <div className="flex gap-2">
                <input id="input-test-email" type="email" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} className="input flex-1" placeholder="test@example.com" />
                <button id="btn-send-test-email" onClick={handleTestEmail} disabled={sendingTest || !testEmail} className="btn btn-secondary whitespace-nowrap">
                  <Send className="w-4 h-4 mr-2" />
                  {sendingTest ? _('common.sending', 'Sending...') : _('settings.email.send_test', 'Send Test')}
                </button>
              </div>
              <p className="text-xs text-gray-500">{_('settings.email.test_footer', 'Save settings first, then send a test to verify your configuration.')}</p>
            </div>
          </div>
        )}

        {/* Amazon Tab */}
        {activeTab === 'amazon' && (
          <AmazonDashboard settings={settings} setSettings={setSettings} onSave={handleSave} saving={saving} />
        )}

        {/* ShipStation Tab */}
        {activeTab === 'shipstation' && (
          <div className="space-y-6">
            <div className="card p-6 space-y-4">
              <h2 className="font-semibold text-gray-900 pb-2 border-b border-gray-200">ShipStation</h2>
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-2">
                <p className="text-sm text-blue-800 font-medium">Connect to ShipStation</p>
                <ol className="list-decimal list-inside text-xs text-blue-700 space-y-1">
                  <li>In ShipStation, add a new store of type <strong>WooCommerce</strong>.</li>
                  <li>Enter your site URL: <code>{settings.site_url || '(Set site URL first)'}</code></li>
                  <li>Enter the <strong>Authentication Key</strong> below in the "Auth Key" or "Password" field in ShipStation.</li>
                </ol>
              </div>
              {field('shipstation_auth_key', _('settings.shipstation.api_key', 'API Key'), { 
                type: 'password', 
                placeholder: 'Your ShipStation API Key',
              })}
              {field('shipstation_api_secret', _('settings.shipstation.api_secret', 'API Secret'), { 
                type: 'password', 
                placeholder: 'Your ShipStation API Secret',
                hint: _('settings.shipstation.keys_hint', 'Found in ShipStation > Settings > API Settings > API Keys.') 
              })}
            </div>
          </div>
        )}

        {/* AI Tab */}
        {activeTab === 'ai' && (
          <div className="space-y-6">
            <div className="card p-6 space-y-4">
              <h2 className="font-semibold text-gray-900 pb-2 border-b border-gray-200">{_('settings.section.ai_config', 'AI Configuration')}</h2>
              <div>
                <label className="label">{_('settings.ai.simulation_mode', 'Simulation Mode')}</label>
                <select
                  value={settings.ai_simulation_mode}
                  onChange={(e) => setSettings({ ...settings, ai_simulation_mode: e.target.value })}
                  className="input"
                >
                  <option value="false">{_('settings.ai.simulation.off', 'Off (Use Real APIs)')}</option>
                  <option value="true">{_('settings.ai.simulation.on', 'On (Mock Responses)')}</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  {_('settings.ai.simulation_hint', 'When enabled, AI features will return mock data instead of calling external APIs. Useful for testing or when no keys are provided.')}
                </p>
              </div>
            </div>

            <div className="card p-6 space-y-4">
              <h2 className="font-semibold text-gray-900 pb-2 border-b border-gray-200">{_('settings.ai.provider_preferences', 'Provider Preferences')}</h2>
              <div>
                <label className="label">{_('settings.ai.default_provider', 'Default Provider')}</label>
                <select
                  value={settings.ai_default_provider}
                  onChange={(e) => setSettings({ ...settings, ai_default_provider: e.target.value })}
                  className="input"
                >
                  <option value="gemini">Google Gemini</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="openai">OpenAI</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  {_('settings.ai.default_provider_hint', 'The primary provider used for all AI operations. Make sure you have a valid API key configured for this provider.')}
                </p>
              </div>
              <div>
                <label className="label">{_('settings.ai.fallback_provider', 'Fallback Provider')}</label>
                <select
                  value={settings.ai_fallback_provider}
                  onChange={(e) => setSettings({ ...settings, ai_fallback_provider: e.target.value })}
                  className="input"
                >
                  <option value="none">{_('settings.ai.fallback.none', 'None')}</option>
                  <option value="gemini">Google Gemini</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="openai">OpenAI</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  {_('settings.ai.fallback_provider_hint', 'If the default provider fails, this provider will be tried next. Choose a different provider than your default.')}
                </p>
              </div>
            </div>

            <div className={`card p-6 space-y-4 ${settings.ai_default_provider === 'gemini' ? 'ring-2 ring-primary-200' : ''}`}>
              <h2 className="font-semibold text-gray-900 pb-2 border-b border-gray-200 flex items-center gap-2">
                Google Gemini
                {settings.ai_default_provider === 'gemini' && <span className="text-xs font-normal text-primary-600 bg-primary-50 px-2 py-0.5 rounded-full">{_('common.default', 'Default')}</span>}
                {settings.ai_fallback_provider === 'gemini' && <span className="text-xs font-normal text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">{_('common.fallback', 'Fallback')}</span>}
              </h2>
              {field('gemini_api_key', _('settings.ai.gemini_key', 'Gemini API Key'), { type: 'password', placeholder: 'AIza...', hint: _('settings.ai.gemini_hint', 'Get from Google AI Studio') })}
              {field('gemini_model', _('settings.ai.gemini_model', 'Text Model'), { placeholder: 'gemini-3-flash-preview', hint: _('settings.ai.gemini_model_hint', 'Default: gemini-3-flash-preview') })}
              {field('gemini_image_model', _('settings.ai.gemini_image_model', 'Image Model'), { placeholder: _('settings.ai.auto_detected', 'auto-detected'), hint: _('settings.ai.gemini_image_model_hint', 'Leave blank to auto-detect the best Imagen model available.') })}
            </div>

            <div className={`card p-6 space-y-4 ${settings.ai_default_provider === 'anthropic' ? 'ring-2 ring-primary-200' : ''}`}>
              <h2 className="font-semibold text-gray-900 pb-2 border-b border-gray-200 flex items-center gap-2">
                Anthropic
                {settings.ai_default_provider === 'anthropic' && <span className="text-xs font-normal text-primary-600 bg-primary-50 px-2 py-0.5 rounded-full">{_('common.default', 'Default')}</span>}
                {settings.ai_fallback_provider === 'anthropic' && <span className="text-xs font-normal text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">{_('common.fallback', 'Fallback')}</span>}
              </h2>
              {field('anthropic_api_key', _('settings.ai.anthropic_key', 'Anthropic API Key'), { type: 'password', placeholder: 'sk-ant-api03-...', hint: _('settings.ai.anthropic_hint', 'Used for Claude models') })}
              {field('anthropic_model', _('settings.ai.anthropic_model', 'Text Model'), { placeholder: 'claude-sonnet-4-20250514', hint: _('settings.ai.anthropic_model_hint', 'Default: claude-sonnet-4-20250514. Anthropic does not support image generation.') })}
            </div>

            <div className={`card p-6 space-y-4 ${settings.ai_default_provider === 'openai' ? 'ring-2 ring-primary-200' : ''}`}>
              <h2 className="font-semibold text-gray-900 pb-2 border-b border-gray-200 flex items-center gap-2">
                OpenAI
                {settings.ai_default_provider === 'openai' && <span className="text-xs font-normal text-primary-600 bg-primary-50 px-2 py-0.5 rounded-full">{_('common.default', 'Default')}</span>}
                {settings.ai_fallback_provider === 'openai' && <span className="text-xs font-normal text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">{_('common.fallback', 'Fallback')}</span>}
              </h2>
              {field('openai_api_key', _('settings.ai.openai_key', 'OpenAI API Key'), { type: 'password', placeholder: 'sk-...', hint: _('settings.ai.openai_hint', 'Used for GPT models and DALL-E') })}
              {field('openai_model', _('settings.ai.openai_model', 'Text Model'), { placeholder: 'gpt-4o', hint: _('settings.ai.openai_model_hint', 'Default: gpt-4o') })}
              {field('openai_image_model', _('settings.ai.openai_image_model', 'Image Model'), { placeholder: 'dall-e-3', hint: _('settings.ai.openai_image_model_hint', 'Default: dall-e-3') })}
              {field('openai_api_url', _('settings.ai.api_url_override', 'API URL Override'), { placeholder: 'https://api.openai.com/v1', hint: _('settings.ai.api_url_hint', 'Useful for proxies or Azure OpenAI') })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
