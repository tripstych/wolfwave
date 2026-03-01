import { useState, useEffect } from 'react';
import api from '../lib/api';
import { Truck, Warehouse, TestTube, RefreshCw, CheckCircle, XCircle, ChevronDown, ChevronUp, Globe, Tag, Ban } from 'lucide-react';

const tabs = [
  { id: 'shipments', label: 'Shipments', icon: Truck },
  { id: 'carriers', label: 'Carriers', icon: Globe },
  { id: 'warehouses', label: 'Warehouses', icon: Warehouse },
  { id: 'settings', label: 'Settings', icon: TestTube },
];

export default function ShipStation() {
  const [activeTab, setActiveTab] = useState('shipments');
  const [connected, setConnected] = useState(null);
  const [testing, setTesting] = useState(false);
  const [connectionError, setConnectionError] = useState(null);

  useEffect(() => {
    testConnection(true);
  }, []);

  const testConnection = async (silent = false) => {
    if (!silent) setTesting(true);
    setConnectionError(null);
    try {
      await api.post('/shipstation/test-connection');
      setConnected(true);
    } catch (err) {
      setConnected(false);
      setConnectionError(err.response?.data?.error || err.message);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">ShipStation</h1>
          <p className="text-sm text-gray-500 mt-1">Manage shipping, labels, and fulfillment</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
            connected === null ? 'bg-gray-100 text-gray-600' :
            connected ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          }`}>
            {connected === null ? 'Checking...' : connected ? (
              <><CheckCircle className="w-3 h-3" /> Connected</>
            ) : (
              <><XCircle className="w-3 h-3" /> Disconnected</>
            )}
          </span>
          <button
            onClick={() => testConnection()}
            disabled={testing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${testing ? 'animate-spin' : ''}`} />
            Test
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {!connected && connected !== null ? (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-sm text-yellow-800">
            <strong>ShipStation is not connected.</strong> {connectionError || 'Please check your settings.'}
            <a href="/admin/settings" className="ml-2 underline font-medium">Go to Settings</a>
          </p>
        </div>
      ) : (
        <>
          {activeTab === 'shipments' && <ShipmentsTab />}
          {activeTab === 'carriers' && <CarriersTab />}
          {activeTab === 'warehouses' && <WarehousesTab />}
          {activeTab === 'settings' && <SettingsTab />}
        </>
      )}
    </div>
  );
}

// ─── Shipments Tab ───────────────────────────────────────────────────

function ShipmentsTab() {
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(null);

  const cancelShipment = async (shipmentId) => {
    if (!confirm('Cancel this shipment?')) return;
    setCancelling(shipmentId);
    try {
      await api.get(`/shipstation/shipments/${shipmentId}/cancel`);
      loadShipments();
    } catch (err) {
      console.error('Failed to cancel shipment:', err);
      alert(err.response?.data?.error || 'Failed to cancel shipment');
    } finally {
      setCancelling(null);
    }
  };

  useEffect(() => { loadShipments(); }, []);

  const loadShipments = async () => {
    setLoading(true);
    try {
      const data = await api.get('/shipstation/shipments?page_size=50&sort_by=created_at&sort_dir=desc');
      // v2 API returns { shipments: [...] } or an array directly
      const list = Array.isArray(data) ? data : (data?.shipments || []);
      setShipments(list);
    } catch (err) {
      console.error('Failed to load shipments:', err);
      setShipments([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={loadShipments} disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <table className="w-full">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Shipment</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ship To</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Service</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tracking</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {shipments.map(s => {
            const statusColors = {
              pending: 'bg-yellow-100 text-yellow-800',
              label_purchased: 'bg-blue-100 text-blue-800',
              shipped: 'bg-green-100 text-green-800',
              delivered: 'bg-green-100 text-green-800',
              cancelled: 'bg-red-100 text-red-800',
            };
            return (
            <tr key={s.shipment_id} className="hover:bg-gray-50">
              <td className="px-4 py-3">
                <div className="text-sm font-medium">{s.shipment_number || s.shipment_id}</div>
                {s.items?.length > 0 && (
                  <div className="text-xs text-gray-500 mt-0.5">{s.items.map(i => i.name).join(', ')}</div>
                )}
              </td>
              <td className="px-4 py-3">
                {s.ship_to ? (
                  <div>
                    <div className="text-sm">{s.ship_to.name}</div>
                    <div className="text-xs text-gray-500">{[s.ship_to.city_locality, s.ship_to.state_province, s.ship_to.country_code].filter(Boolean).join(', ')}</div>
                  </div>
                ) : <span className="text-sm text-gray-400">-</span>}
              </td>
              <td className="px-4 py-3 text-sm">{s.service_code?.replace(/_/g, ' ') || '-'}</td>
              <td className="px-4 py-3">
                <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${statusColors[s.shipment_status] || 'bg-gray-100 text-gray-700'}`}>
                  {s.shipment_status?.replace(/_/g, ' ') || '-'}
                </span>
              </td>
              <td className="px-4 py-3 text-sm">
                {s.tracking_number ? (
                  <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">{s.tracking_number}</code>
                ) : <span className="text-gray-400">-</span>}
              </td>
              <td className="px-4 py-3 text-sm text-gray-600">
                {s.created_at ? new Date(s.created_at).toLocaleDateString() : '-'}
              </td>
              <td className="px-4 py-3 text-right">
                {s.shipment_status !== 'cancelled' && (
                  <button
                    onClick={() => cancelShipment(s.shipment_id)}
                    disabled={cancelling === s.shipment_id}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded disabled:opacity-50"
                    title="Cancel shipment"
                  >
                    <Ban className="w-3 h-3" />
                    {cancelling === s.shipment_id ? 'Cancelling...' : 'Cancel'}
                  </button>
                )}
              </td>
            </tr>
            );
          })}
          {shipments.length === 0 && (
            <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">{loading ? 'Loading...' : 'No shipments found'}</td></tr>
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
}

// ─── Carriers Tab ────────────────────────────────────────────────────

function CarriersTab() {
  const [carriers, setCarriers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [services, setServices] = useState({});

  useEffect(() => { loadCarriers(); }, []);

  const loadCarriers = async () => {
    setLoading(true);
    try {
      const data = await api.get('/shipstation/carriers');
      setCarriers(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load carriers:', err);
      setCarriers([]);
    } finally {
      setLoading(false);
    }
  };

  const toggleCarrier = async (carrierCode) => {
    if (expanded === carrierCode) {
      setExpanded(null);
      return;
    }
    setExpanded(carrierCode);
    if (!services[carrierCode]) {
      try {
        const data = await api.get(`/shipstation/carriers/${carrierCode}/services`);
        setServices(prev => ({ ...prev, [carrierCode]: Array.isArray(data) ? data : [] }));
      } catch (err) {
        console.error('Failed to load services:', err);
      }
    }
  };

  if (loading) return <div className="text-center py-8 text-gray-500">Loading carriers...</div>;

  return (
    <div className="space-y-3">
      {carriers.map(carrier => (
        <div key={carrier.code} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <button
            onClick={() => toggleCarrier(carrier.code)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50"
          >
            <div className="flex items-center gap-3">
              <Truck className="w-5 h-5 text-gray-400" />
              <div className="text-left">
                <div className="font-medium text-sm">{carrier.name}</div>
                <div className="text-xs text-gray-500">{carrier.code}</div>
              </div>
            </div>
            {expanded === carrier.code ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </button>
          {expanded === carrier.code && (
            <div className="border-t border-gray-200 px-4 py-3 bg-gray-50">
              {services[carrier.code] ? (
                <div className="space-y-1">
                  {services[carrier.code].map(svc => (
                    <div key={svc.serviceCode} className="flex items-center justify-between py-1.5 text-sm">
                      <span>{svc.name}</span>
                      <code className="text-xs bg-gray-200 px-1.5 py-0.5 rounded">{svc.serviceCode}</code>
                    </div>
                  ))}
                  {services[carrier.code].length === 0 && (
                    <p className="text-sm text-gray-500">No services available</p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-500">Loading services...</p>
              )}
            </div>
          )}
        </div>
      ))}
      {carriers.length === 0 && (
        <div className="text-center py-8 text-gray-500">No carriers configured in ShipStation</div>
      )}
    </div>
  );
}

// ─── Warehouses Tab ──────────────────────────────────────────────────

function WarehousesTab() {
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadWarehouses(); }, []);

  const loadWarehouses = async () => {
    setLoading(true);
    try {
      const data = await api.get('/shipstation/warehouses');
      setWarehouses(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load warehouses:', err);
      setWarehouses([]);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="text-center py-8 text-gray-500">Loading warehouses...</div>;

  return (
    <div className="space-y-3">
      {warehouses.map(wh => (
        <div key={wh.warehouseId} className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-medium text-sm">{wh.warehouseName}</h3>
              <p className="text-sm text-gray-600 mt-1">
                {[wh.originAddress?.street1, wh.originAddress?.city, wh.originAddress?.state, wh.originAddress?.postalCode]
                  .filter(Boolean).join(', ')}
              </p>
              {wh.isDefault && (
                <span className="inline-block mt-2 px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">
                  Default
                </span>
              )}
            </div>
            <Warehouse className="w-5 h-5 text-gray-400" />
          </div>
        </div>
      ))}
      {warehouses.length === 0 && (
        <div className="text-center py-8 text-gray-500">No warehouses configured</div>
      )}
    </div>
  );
}

// ─── Settings Tab ────────────────────────────────────────────────────

function SettingsTab() {
  const [webhooks, setWebhooks] = useState([]);
  const [tags, setTags] = useState([]);
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/shipstation/webhooks').catch(() => ({ webhooks: [] })),
      api.get('/shipstation/tags').catch(() => []),
      api.get('/shipstation/stores').catch(() => []),
    ]).then(([wh, tg, st]) => {
      setWebhooks(wh?.webhooks || wh || []);
      setTags(Array.isArray(tg) ? tg : []);
      setStores(Array.isArray(st) ? st : []);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-8 text-gray-500">Loading settings...</div>;

  return (
    <div className="space-y-6">
      {/* Stores */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Connected Stores</h3>
        <div className="space-y-2">
          {stores.map(store => (
            <div key={store.storeId} className="bg-white border border-gray-200 rounded-lg px-4 py-3 flex items-center justify-between">
              <div>
                <span className="font-medium text-sm">{store.storeName}</span>
                <span className="text-xs text-gray-500 ml-2">{store.marketplaceName}</span>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full ${store.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                {store.active ? 'Active' : 'Inactive'}
              </span>
            </div>
          ))}
          {stores.length === 0 && <p className="text-sm text-gray-500">No stores connected</p>}
        </div>
      </div>

      {/* Tags */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Tags</h3>
        <div className="flex flex-wrap gap-2">
          {tags.map(tag => (
            <span key={tag.tagId} className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700" style={tag.color ? { backgroundColor: tag.color + '20', color: tag.color } : {}}>
              <Tag className="w-3 h-3" />
              {tag.name}
            </span>
          ))}
          {tags.length === 0 && <p className="text-sm text-gray-500">No tags configured</p>}
        </div>
      </div>

      {/* Webhooks */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Webhooks</h3>
        <div className="space-y-2">
          {(Array.isArray(webhooks) ? webhooks : []).map(wh => (
            <div key={wh.WebHookID} className="bg-white border border-gray-200 rounded-lg px-4 py-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium text-sm">{wh.Name || wh.Event}</span>
                  <span className="text-xs text-gray-500 ml-2">{wh.HookType || wh.Event}</span>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${wh.Active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                  {wh.Active ? 'Active' : 'Inactive'}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1 truncate">{wh.Url || wh.WebHookURI}</p>
            </div>
          ))}
          {(!Array.isArray(webhooks) || webhooks.length === 0) && <p className="text-sm text-gray-500">No webhooks configured</p>}
        </div>
      </div>
    </div>
  );
}
