import { useState, useEffect } from 'react';
import api from '../lib/api';
import { Package, Truck, Warehouse, TestTube, RefreshCw, Send, CheckCircle, XCircle, ChevronDown, ChevronUp, Globe, Tag } from 'lucide-react';

const tabs = [
  { id: 'orders', label: 'Orders', icon: Package },
  { id: 'shipments', label: 'Shipments', icon: Truck },
  { id: 'carriers', label: 'Carriers', icon: Globe },
  { id: 'warehouses', label: 'Warehouses', icon: Warehouse },
  { id: 'settings', label: 'Settings', icon: TestTube },
];

export default function ShipStation() {
  const [activeTab, setActiveTab] = useState('orders');
  const [connected, setConnected] = useState(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    testConnection(true);
  }, []);

  const testConnection = async (silent = false) => {
    if (!silent) setTesting(true);
    try {
      await api.post('/shipstation/test-connection');
      setConnected(true);
    } catch {
      setConnected(false);
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
            ShipStation is not connected. Add your API key in the settings table with key <code className="bg-yellow-100 px-1 rounded">shipstation_auth_key</code>.
          </p>
        </div>
      ) : (
        <>
          {activeTab === 'orders' && <OrdersTab />}
          {activeTab === 'shipments' && <ShipmentsTab />}
          {activeTab === 'carriers' && <CarriersTab />}
          {activeTab === 'warehouses' && <WarehousesTab />}
          {activeTab === 'settings' && <SettingsTab />}
        </>
      )}
    </div>
  );
}

// ─── Orders Tab ──────────────────────────────────────────────────────

function OrdersTab() {
  const [wolfwaveOrders, setWolfwaveOrders] = useState([]);
  const [ssOrders, setSsOrders] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pushing, setPushing] = useState({});
  const [view, setView] = useState('wolfwave'); // 'wolfwave' or 'shipstation'
  const [message, setMessage] = useState(null);

  useEffect(() => {
    loadOrders();
  }, [view]);

  const loadOrders = async () => {
    setLoading(true);
    try {
      if (view === 'wolfwave') {
        setWolfwaveOrders(data.orders || (Array.isArray(data) ? data : []));
      } else {
        const data = await api.get('/shipstation/orders?pageSize=50&sortBy=OrderDate&sortDir=DESC');
        setSsOrders(data);
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
      setWolfwaveOrders([]); // Ensure it's an array on error
    } finally {
      setLoading(false);
    }
  };

  const pushOrder = async (orderId) => {
    setPushing(prev => ({ ...prev, [orderId]: true }));
    try {
      const result = await api.post(`/shipstation/orders/push/${orderId}`);
      setMessage({ type: 'success', text: `Order pushed to ShipStation (SS ID: ${result.shipstation_order_id})` });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setPushing(prev => ({ ...prev, [orderId]: false }));
    }
  };

  const pushAll = async () => {
    const processableOrders = wolfwaveOrders.filter(o =>
      ['processing', 'pending'].includes(o.status) && o.payment_status === 'paid'
    );
    if (processableOrders.length === 0) {
      setMessage({ type: 'info', text: 'No paid orders to push' });
      return;
    }

    const orderIds = processableOrders.map(o => o.id);
    try {
      const result = await api.post('/shipstation/orders/push-batch', { orderIds });
      setMessage({ type: 'success', text: `Pushed ${result.success}/${result.total} orders` });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const statusColor = (status) => {
    const colors = {
      pending: 'bg-yellow-100 text-yellow-800',
      processing: 'bg-blue-100 text-blue-800',
      shipped: 'bg-green-100 text-green-800',
      completed: 'bg-green-100 text-green-800',
      cancelled: 'bg-red-100 text-red-800',
      awaiting_shipment: 'bg-blue-100 text-blue-800',
      awaiting_payment: 'bg-yellow-100 text-yellow-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="space-y-4">
      {message && (
        <div className={`p-3 rounded-lg text-sm ${
          message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' :
          message.type === 'error' ? 'bg-red-50 text-red-800 border border-red-200' :
          'bg-blue-50 text-blue-800 border border-blue-200'
        }`}>
          {message.text}
          <button onClick={() => setMessage(null)} className="float-right font-bold">&times;</button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <button
            onClick={() => setView('wolfwave')}
            className={`px-3 py-1.5 text-sm rounded-lg ${view === 'wolfwave' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            WolfWave Orders
          </button>
          <button
            onClick={() => setView('shipstation')}
            className={`px-3 py-1.5 text-sm rounded-lg ${view === 'shipstation' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            ShipStation Orders
          </button>
        </div>
        <div className="flex gap-2">
          {view === 'wolfwave' && (
            <button onClick={pushAll} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              <Send className="w-3.5 h-3.5" /> Push All Paid
            </button>
          )}
          <button onClick={loadOrders} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-500">Loading orders...</div>
      ) : view === 'wolfwave' ? (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Order #</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Payment</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {wolfwaveOrders.map(order => (
                <tr key={order.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium">{order.order_number}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{order.email}</td>
                  <td className="px-4 py-3 text-sm font-medium">${parseFloat(order.total).toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(order.status)}`}>
                      {order.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(order.payment_status)}`}>
                      {order.payment_status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => pushOrder(order.id)}
                      disabled={pushing[order.id]}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                    >
                      {pushing[order.id] ? (
                        <RefreshCw className="w-3 h-3 animate-spin" />
                      ) : (
                        <Send className="w-3 h-3" />
                      )}
                      Push
                    </button>
                  </td>
                </tr>
              ))}
              {wolfwaveOrders.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">No orders found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Order #</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ship Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {(ssOrders?.orders || []).map(order => (
                <tr key={order.orderId} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium">{order.orderNumber}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{order.customerEmail}</td>
                  <td className="px-4 py-3 text-sm font-medium">${parseFloat(order.orderTotal || 0).toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(order.orderStatus)}`}>
                      {order.orderStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {order.shipDate ? new Date(order.shipDate).toLocaleDateString() : '-'}
                  </td>
                </tr>
              ))}
              {(!ssOrders?.orders || ssOrders.orders.length === 0) && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">No orders in ShipStation</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Shipments Tab ───────────────────────────────────────────────────

function ShipmentsTab() {
  const [shipments, setShipments] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadShipments(); }, []);

  const loadShipments = async () => {
    setLoading(true);
    try {
      const data = await api.get('/shipstation/shipments?pageSize=50&sortBy=ShipDate&sortDir=DESC');
      setShipments(data);
    } catch (err) {
      console.error('Failed to load shipments:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="text-center py-8 text-gray-500">Loading shipments...</div>;

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <table className="w-full">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Order #</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Carrier</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Service</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tracking</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ship Date</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cost</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {(shipments?.shipments || []).map(s => (
            <tr key={s.shipmentId} className="hover:bg-gray-50">
              <td className="px-4 py-3 text-sm font-medium">{s.orderNumber}</td>
              <td className="px-4 py-3 text-sm">{s.carrierCode}</td>
              <td className="px-4 py-3 text-sm">{s.serviceCode}</td>
              <td className="px-4 py-3 text-sm">
                {s.trackingNumber ? (
                  <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">{s.trackingNumber}</code>
                ) : '-'}
              </td>
              <td className="px-4 py-3 text-sm text-gray-600">
                {s.shipDate ? new Date(s.shipDate).toLocaleDateString() : '-'}
              </td>
              <td className="px-4 py-3 text-sm">{s.shipmentCost ? `$${parseFloat(s.shipmentCost).toFixed(2)}` : '-'}</td>
            </tr>
          ))}
          {(!shipments?.shipments || shipments.shipments.length === 0) && (
            <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">No shipments found</td></tr>
          )}
        </tbody>
      </table>
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
