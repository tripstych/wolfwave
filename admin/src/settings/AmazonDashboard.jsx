import { useState } from 'react';
import api from '../lib/api';
import { toast } from 'sonner';
import { Save, Wifi, WifiOff, Search, Package, RefreshCw, ShoppingCart, Download, ChevronDown, ChevronUp, Check } from 'lucide-react';

const REGIONS = [
  { value: 'na', label: 'North America (US, CA, MX)' },
  { value: 'eu', label: 'Europe (UK, DE, FR, IT, ES)' },
  { value: 'fe', label: 'Far East (JP, AU)' },
];

export default function AmazonDashboard({ settings, setSettings, onSave, saving }) {
  const [connectionStatus, setConnectionStatus] = useState(null);
  const [testing, setTesting] = useState(false);
  const [activePanel, setActivePanel] = useState(null); // 'products' | 'inventory' | 'orders'

  // Product search state
  const [searchKeywords, setSearchKeywords] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedAsins, setSelectedAsins] = useState(new Set());
  const [importing, setImporting] = useState(false);

  // Inventory state
  const [inventory, setInventory] = useState([]);
  const [loadingInventory, setLoadingInventory] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Orders state
  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [selectedOrderIds, setSelectedOrderIds] = useState(new Set());
  const [importingOrders, setImportingOrders] = useState(false);

  const field = (key, label, opts = {}) => {
    const { type = 'text', placeholder = '', hint = '' } = opts;
    return (
      <div>
        <label className="label">{label}</label>
        <input
          type={type}
          value={settings[key] || ''}
          onChange={(e) => setSettings({ ...settings, [key]: e.target.value })}
          className="input"
          placeholder={placeholder}
        />
        {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
      </div>
    );
  };

  const testConnection = async () => {
    setTesting(true);
    try {
      const result = await api.get('/amazon/status');
      setConnectionStatus(result);
      if (result.connected) {
        toast.success('Connected to Amazon SP-API');
      } else {
        toast.error(result.error || 'Connection failed');
      }
    } catch (err) {
      setConnectionStatus({ connected: false, error: err.message });
      toast.error(err.message);
    } finally {
      setTesting(false);
    }
  };

  const handleSearch = async () => {
    if (!searchKeywords.trim()) return;
    setSearching(true);
    try {
      const result = await api.get(`/amazon/search?keywords=${encodeURIComponent(searchKeywords)}`);
      setSearchResults(result.items || []);
      if (!result.items?.length) toast('No results found');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSearching(false);
    }
  };

  const toggleAsin = (asin) => {
    setSelectedAsins(prev => {
      const next = new Set(prev);
      if (next.has(asin)) next.delete(asin);
      else next.add(asin);
      return next;
    });
  };

  const importProducts = async () => {
    if (!selectedAsins.size) return;
    setImporting(true);
    const toastId = toast.loading(`Importing ${selectedAsins.size} product(s)...`);
    try {
      const result = await api.post('/amazon/import-products', { asins: [...selectedAsins] });
      const imported = result.results.filter(r => r.status === 'imported').length;
      const skipped = result.results.filter(r => r.status === 'skipped').length;
      toast.success(`Imported: ${imported}, Skipped: ${skipped}`, { id: toastId });
      setSelectedAsins(new Set());
    } catch (err) {
      toast.error(err.message, { id: toastId });
    } finally {
      setImporting(false);
    }
  };

  const loadInventory = async () => {
    setLoadingInventory(true);
    try {
      const result = await api.get('/amazon/inventory');
      setInventory(result.items || []);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoadingInventory(false);
    }
  };

  const syncInventory = async () => {
    setSyncing(true);
    const toastId = toast.loading('Syncing inventory...');
    try {
      const result = await api.post('/amazon/sync-inventory');
      toast.success(`Synced ${result.total} product(s)`, { id: toastId });
      loadInventory();
    } catch (err) {
      toast.error(err.message, { id: toastId });
    } finally {
      setSyncing(false);
    }
  };

  const loadOrders = async () => {
    setLoadingOrders(true);
    try {
      const result = await api.get('/amazon/orders');
      setOrders(result.orders || []);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoadingOrders(false);
    }
  };

  const toggleOrder = (orderId) => {
    setSelectedOrderIds(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  const importOrders = async () => {
    if (!selectedOrderIds.size) return;
    setImportingOrders(true);
    const toastId = toast.loading(`Importing ${selectedOrderIds.size} order(s)...`);
    try {
      const result = await api.post('/amazon/import-orders', { orderIds: [...selectedOrderIds] });
      const imported = result.results.filter(r => r.status === 'imported').length;
      toast.success(`Imported ${imported} order(s)`, { id: toastId });
      setSelectedOrderIds(new Set());
    } catch (err) {
      toast.error(err.message, { id: toastId });
    } finally {
      setImportingOrders(false);
    }
  };

  const PanelToggle = ({ id, label, icon: Icon }) => (
    <button
      onClick={() => setActivePanel(activePanel === id ? null : id)}
      className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
    >
      <div className="flex items-center gap-2 font-medium text-gray-700">
        <Icon className="w-5 h-5" />
        {label}
      </div>
      {activePanel === id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
    </button>
  );

  return (
    <div className="space-y-6">
      {/* Credentials */}
      <div className="card p-6 space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">Amazon SP-API Credentials</h2>
          {connectionStatus && (
            <span className={`flex items-center gap-1 text-sm ${connectionStatus.connected ? 'text-green-600' : 'text-red-500'}`}>
              {connectionStatus.connected ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
              {connectionStatus.connected ? 'Connected' : 'Disconnected'}
            </span>
          )}
        </div>

        {field('amazon_seller_id', 'Seller ID', { placeholder: 'A1B2C3D4E5F6G7', hint: 'Your Amazon Seller Central merchant ID' })}
        {field('amazon_marketplace_id', 'Marketplace ID', { placeholder: 'ATVPDKIKX0DER', hint: 'e.g. ATVPDKIKX0DER for US. Leave blank for US default.' })}

        <div>
          <label className="label">Region</label>
          <select
            value={settings.amazon_region || 'na'}
            onChange={(e) => setSettings({ ...settings, amazon_region: e.target.value })}
            className="input"
          >
            {REGIONS.map(r => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>

        <div className="border-t border-gray-200 pt-4">
          <h3 className="font-medium text-gray-900 mb-3">OAuth / LWA Credentials</h3>
          {field('amazon_client_id', 'LWA Client ID', { placeholder: 'amzn1.application-oa2-client.xxx' })}
          {field('amazon_client_secret', 'LWA Client Secret', { type: 'password', placeholder: '••••••••' })}
          {field('amazon_refresh_token', 'Refresh Token', { type: 'password', placeholder: 'Atzr|...', hint: 'Generated when you authorize your app in Seller Central' })}
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={onSave} disabled={saving} className="btn btn-primary">
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Saving...' : 'Save Credentials'}
          </button>
          <button onClick={testConnection} disabled={testing} className="btn btn-secondary">
            <Wifi className="w-4 h-4 mr-2" />
            {testing ? 'Testing...' : 'Test Connection'}
          </button>
        </div>

        <p className="text-xs text-gray-500">
          Set up SP-API access in <a href="https://sellercentral.amazon.com/apps/manage" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Seller Central &rarr; Apps &amp; Services</a>.
          You need a Developer account and an authorized self-hosted app.
        </p>
      </div>

      {/* Action Panels */}
      <div className="space-y-3">
        {/* Products Panel */}
        <div className="card overflow-hidden">
          <PanelToggle id="products" label="Import Products" icon={Package} />
          {activePanel === 'products' && (
            <div className="p-4 border-t border-gray-200 space-y-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={searchKeywords}
                  onChange={(e) => setSearchKeywords(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="input flex-1"
                  placeholder="Search Amazon catalog by keywords..."
                />
                <button onClick={handleSearch} disabled={searching || !searchKeywords.trim()} className="btn btn-secondary">
                  <Search className="w-4 h-4 mr-2" />
                  {searching ? 'Searching...' : 'Search'}
                </button>
              </div>

              {searchResults.length > 0 && (
                <>
                  <div className="border border-gray-200 rounded-lg divide-y divide-gray-200 max-h-96 overflow-y-auto">
                    {searchResults.map(item => (
                      <label key={item.asin} className="flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedAsins.has(item.asin)}
                          onChange={() => toggleAsin(item.asin)}
                          className="rounded border-gray-300"
                        />
                        {item.images?.[0] && (
                          <img src={item.images[0]} alt="" className="w-12 h-12 object-contain rounded" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{item.title}</p>
                          <p className="text-xs text-gray-500">ASIN: {item.asin} {item.brand && `| ${item.brand}`}</p>
                        </div>
                      </label>
                    ))}
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">{selectedAsins.size} selected</span>
                    <button onClick={importProducts} disabled={importing || !selectedAsins.size} className="btn btn-primary">
                      <Download className="w-4 h-4 mr-2" />
                      {importing ? 'Importing...' : `Import ${selectedAsins.size} Product(s)`}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Inventory Panel */}
        <div className="card overflow-hidden">
          <PanelToggle id="inventory" label="Inventory Sync" icon={RefreshCw} />
          {activePanel === 'inventory' && (
            <div className="p-4 border-t border-gray-200 space-y-4">
              <div className="flex gap-2">
                <button onClick={loadInventory} disabled={loadingInventory} className="btn btn-secondary">
                  <RefreshCw className={`w-4 h-4 mr-2 ${loadingInventory ? 'animate-spin' : ''}`} />
                  {loadingInventory ? 'Loading...' : 'Load Amazon Inventory'}
                </button>
                <button onClick={syncInventory} disabled={syncing || !inventory.length} className="btn btn-primary">
                  <Download className="w-4 h-4 mr-2" />
                  {syncing ? 'Syncing...' : 'Sync to WolfWave'}
                </button>
              </div>

              {inventory.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left p-2 font-medium text-gray-600">Product</th>
                        <th className="text-left p-2 font-medium text-gray-600">SKU</th>
                        <th className="text-left p-2 font-medium text-gray-600">ASIN</th>
                        <th className="text-right p-2 font-medium text-gray-600">Fulfillable</th>
                        <th className="text-right p-2 font-medium text-gray-600">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {inventory.map((item, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="p-2 truncate max-w-xs">{item.productName}</td>
                          <td className="p-2 text-gray-500">{item.sku}</td>
                          <td className="p-2 text-gray-500">{item.asin}</td>
                          <td className="p-2 text-right">{item.fulfillableQuantity}</td>
                          <td className="p-2 text-right font-medium">{item.totalQuantity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Orders Panel */}
        <div className="card overflow-hidden">
          <PanelToggle id="orders" label="Import Orders" icon={ShoppingCart} />
          {activePanel === 'orders' && (
            <div className="p-4 border-t border-gray-200 space-y-4">
              <div className="flex gap-2">
                <button onClick={loadOrders} disabled={loadingOrders} className="btn btn-secondary">
                  <RefreshCw className={`w-4 h-4 mr-2 ${loadingOrders ? 'animate-spin' : ''}`} />
                  {loadingOrders ? 'Loading...' : 'Load Recent Orders'}
                </button>
                {selectedOrderIds.size > 0 && (
                  <button onClick={importOrders} disabled={importingOrders} className="btn btn-primary">
                    <Download className="w-4 h-4 mr-2" />
                    {importingOrders ? 'Importing...' : `Import ${selectedOrderIds.size} Order(s)`}
                  </button>
                )}
              </div>

              {orders.length > 0 && (
                <div className="border border-gray-200 rounded-lg divide-y divide-gray-200 max-h-96 overflow-y-auto">
                  {orders.map(order => (
                    <label key={order.amazonOrderId} className="flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedOrderIds.has(order.amazonOrderId)}
                        onChange={() => toggleOrder(order.amazonOrderId)}
                        className="rounded border-gray-300"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-gray-900">{order.amazonOrderId}</p>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            order.status === 'Shipped' ? 'bg-green-100 text-green-700' :
                            order.status === 'Pending' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-gray-100 text-gray-700'
                          }`}>
                            {order.status}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {new Date(order.purchaseDate).toLocaleDateString()} | {order.totalAmount} {order.currency} | {order.numberOfItems} item(s)
                          {order.fulfillmentChannel === 'AFN' && ' | FBA'}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
