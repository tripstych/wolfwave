import { useState, useEffect } from 'react';
import api from '../lib/api';
import { Truck, Warehouse, TestTube, RefreshCw, CheckCircle, XCircle, ChevronDown, ChevronUp, Globe, Tag, Ban, Plus, X, FileText, Download } from 'lucide-react';

const tabs = [
  { id: 'shipments', label: 'Shipments', icon: Truck },
  { id: 'labels', label: 'Labels', icon: FileText },
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
          {activeTab === 'labels' && <LabelsTab />}
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
  const [allTags, setAllTags] = useState([]);
  const [newTagName, setNewTagName] = useState('');
  const [creatingTag, setCreatingTag] = useState(false);
  const [taggingShipment, setTaggingShipment] = useState(null); // shipment_id currently adding a tag to
  const [tagAction, setTagAction] = useState(null); // tracks in-flight tag operations

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

  useEffect(() => {
    loadShipments();
    loadTags();
  }, []);

  const loadShipments = async () => {
    setLoading(true);
    try {
      const data = await api.get('/shipstation/shipments?page_size=50&sort_by=created_at&sort_dir=desc');
      const list = Array.isArray(data) ? data : (data?.shipments || []);
      setShipments(list);
    } catch (err) {
      console.error('Failed to load shipments:', err);
      setShipments([]);
    } finally {
      setLoading(false);
    }
  };

  const loadTags = async () => {
    try {
      const data = await api.get('/shipstation/tags');
      setAllTags(Array.isArray(data) ? data : (data?.tags || []));
    } catch (err) {
      console.error('Failed to load tags:', err);
    }
  };

  const handleCreateTag = async (e) => {
    e.preventDefault();
    if (!newTagName.trim()) return;
    setCreatingTag(true);
    try {
      await api.post('/shipstation/tags', { name: newTagName.trim() });
      setNewTagName('');
      loadTags();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create tag');
    } finally {
      setCreatingTag(false);
    }
  };

  const handleDeleteTag = async (name) => {
    if (!confirm(`Delete tag "${name}"?`)) return;
    try {
      await api.delete(`/shipstation/tags/${encodeURIComponent(name)}`);
      loadTags();
      loadShipments(); // refresh to update tag displays
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete tag');
    }
  };

  const handleAddTag = async (shipmentId, tagName) => {
    setTagAction(`add-${shipmentId}-${tagName}`);
    try {
      await api.post(`/shipstation/shipments/${shipmentId}/tags/${encodeURIComponent(tagName)}`);
      setTaggingShipment(null);
      loadShipments();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to add tag');
    } finally {
      setTagAction(null);
    }
  };

  const handleRemoveTag = async (shipmentId, tagName) => {
    setTagAction(`rm-${shipmentId}-${tagName}`);
    try {
      await api.delete(`/shipstation/shipments/${shipmentId}/tags/${encodeURIComponent(tagName)}`);
      loadShipments();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to remove tag');
    } finally {
      setTagAction(null);
    }
  };

  const statusColors = {
    pending: 'bg-yellow-100 text-yellow-800',
    label_purchased: 'bg-blue-100 text-blue-800',
    shipped: 'bg-green-100 text-green-800',
    delivered: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800',
  };

  return (
    <div className="space-y-4">
      {/* Tags management bar */}
      <div className="bg-white border border-gray-200 rounded-lg px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-gray-500 uppercase mr-1">Tags:</span>
            {allTags.map(tag => (
              <span key={tag.name || tag.tagId} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                <Tag className="w-3 h-3" />
                {tag.name}
                <button onClick={() => handleDeleteTag(tag.name)} className="ml-0.5 hover:text-red-600" title="Delete tag">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            {allTags.length === 0 && <span className="text-xs text-gray-400">No tags</span>}
          </div>
          <form onSubmit={handleCreateTag} className="flex items-center gap-2 ml-4">
            <input
              type="text"
              value={newTagName}
              onChange={e => setNewTagName(e.target.value)}
              placeholder="New tag..."
              className="px-2 py-1 text-xs border border-gray-300 rounded-lg w-32 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button type="submit" disabled={creatingTag || !newTagName.trim()}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              <Plus className="w-3 h-3" />
              Add
            </button>
          </form>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={loadShipments} disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-visible">
      <table className="w-full">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Shipment</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ship To</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Service</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tags</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tracking</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {shipments.map(s => {
            const shipmentTags = s.tags || [];
            const shipmentTagNames = shipmentTags.map(t => t.name || t);
            const availableTags = allTags.filter(t => !shipmentTagNames.includes(t.name));

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
              <td className="px-4 py-3">
                <div className="flex items-center gap-1 flex-wrap">
                  {shipmentTags.map(tag => {
                    const name = tag.name || tag;
                    return (
                      <span key={name} className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                        {name}
                        <button
                          onClick={() => handleRemoveTag(s.shipment_id, name)}
                          disabled={tagAction === `rm-${s.shipment_id}-${name}`}
                          className="ml-0.5 hover:text-red-600 disabled:opacity-50"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    );
                  })}
                  {taggingShipment === s.shipment_id ? (
                    <div className="relative">
                      <div className="absolute top-0 left-0 z-10 bg-white border border-gray-200 rounded-lg shadow-lg p-2 min-w-[140px]">
                        {availableTags.length > 0 ? availableTags.map(tag => (
                          <button
                            key={tag.name}
                            onClick={() => handleAddTag(s.shipment_id, tag.name)}
                            disabled={tagAction === `add-${s.shipment_id}-${tag.name}`}
                            className="block w-full text-left px-2 py-1.5 text-xs hover:bg-gray-100 rounded disabled:opacity-50"
                          >
                            <Tag className="w-3 h-3 inline mr-1" />{tag.name}
                          </button>
                        )) : (
                          <p className="text-xs text-gray-400 px-2 py-1">No more tags</p>
                        )}
                        <button onClick={() => setTaggingShipment(null)} className="block w-full text-left px-2 py-1.5 text-xs text-gray-500 hover:bg-gray-100 rounded mt-1 border-t border-gray-100">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setTaggingShipment(s.shipment_id)}
                      className="inline-flex items-center px-1.5 py-0.5 text-xs text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                      title="Add tag"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  )}
                </div>
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
            <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500">{loading ? 'Loading...' : 'No shipments found'}</td></tr>
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
}

// ─── Labels Tab ─────────────────────────────────────────────────────

const EMPTY_ADDRESS = {
  name: '', company_name: '', phone: '',
  address_line1: '', address_line2: '',
  city_locality: '', state_province: '', postal_code: '', country_code: 'US',
  address_residential_indicator: 'unknown'
};

const EMPTY_PACKAGE = {
  weight: { value: '', unit: 'ounce' },
  dimensions: { length: '', width: '', height: '', unit: 'inch' }
};

function LabelsTab() {
  const [labels, setLabels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [voiding, setVoiding] = useState(null);
  const [carriers, setCarriers] = useState([]);
  const [carrierServices, setCarrierServices] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [createdLabel, setCreatedLabel] = useState(null);

  const [form, setForm] = useState({
    carrier_id: '',
    service_code: '',
    ship_date: new Date().toISOString().split('T')[0],
    ship_to: { ...EMPTY_ADDRESS },
    ship_from: { ...EMPTY_ADDRESS },
    packages: [{ ...EMPTY_PACKAGE, weight: { ...EMPTY_PACKAGE.weight }, dimensions: { ...EMPTY_PACKAGE.dimensions } }]
  });

  useEffect(() => {
    loadLabels();
    loadCarriers();
    loadWarehouses();
  }, []);

  const loadLabels = async () => {
    setLoading(true);
    try {
      const data = await api.get('/shipstation/labels?page_size=50');
      const list = Array.isArray(data) ? data : (data?.labels || []);
      setLabels(list);
    } catch (err) {
      console.error('Failed to load labels:', err);
      setLabels([]);
    } finally {
      setLoading(false);
    }
  };

  const loadCarriers = async () => {
    try {
      const data = await api.get('/shipstation/carriers');
      setCarriers(Array.isArray(data) ? data : (data?.carriers || []));
    } catch (err) { console.error('Failed to load carriers:', err); }
  };

  const loadWarehouses = async () => {
    try {
      const data = await api.get('/shipstation/warehouses');
      const list = Array.isArray(data) ? data : [];
      setWarehouses(list);
      // Pre-fill ship_from with default warehouse
      const defaultWh = list.find(w => w.isDefault) || list[0];
      if (defaultWh?.originAddress) {
        const a = defaultWh.originAddress;
        setForm(f => ({
          ...f,
          ship_from: {
            name: a.name || defaultWh.warehouseName || '',
            company_name: a.company || '',
            phone: a.phone || '',
            address_line1: a.street1 || '',
            address_line2: a.street2 || '',
            city_locality: a.city || '',
            state_province: a.state || '',
            postal_code: a.postalCode || '',
            country_code: a.country || 'US',
            address_residential_indicator: 'no'
          }
        }));
      }
    } catch (err) { console.error('Failed to load warehouses:', err); }
  };

  const handleCarrierChange = async (carrierId) => {
    setForm(f => ({ ...f, carrier_id: carrierId, service_code: '' }));
    setCarrierServices([]);
    if (!carrierId) return;
    // Find carrier code from carrier_id
    const carrier = carriers.find(c => c.carrier_id === carrierId);
    if (carrier?.carrier_code) {
      try {
        const data = await api.get(`/shipstation/carriers/${carrier.carrier_code}/services`);
        setCarrierServices(Array.isArray(data) ? data : (data?.services || []));
      } catch (err) { console.error('Failed to load services:', err); }
    }
  };

  const updateAddress = (which, field, value) => {
    setForm(f => ({ ...f, [which]: { ...f[which], [field]: value } }));
  };

  const updatePackage = (field, value) => {
    setForm(f => {
      const pkg = { ...f.packages[0] };
      if (field === 'weight_value') pkg.weight = { ...pkg.weight, value };
      else if (field === 'weight_unit') pkg.weight = { ...pkg.weight, unit: value };
      else if (['length', 'width', 'height'].includes(field)) pkg.dimensions = { ...pkg.dimensions, [field]: value };
      else if (field === 'dim_unit') pkg.dimensions = { ...pkg.dimensions, unit: value };
      return { ...f, packages: [pkg] };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setCreating(true);
    setCreatedLabel(null);
    try {
      const payload = {
        shipment: {
          carrier_id: form.carrier_id,
          service_code: form.service_code,
          ship_date: form.ship_date,
          ship_to: { ...form.ship_to },
          ship_from: { ...form.ship_from },
          packages: form.packages.map(pkg => ({
            weight: { value: parseFloat(pkg.weight.value) || 0, unit: pkg.weight.unit },
            dimensions: {
              length: parseFloat(pkg.dimensions.length) || 0,
              width: parseFloat(pkg.dimensions.width) || 0,
              height: parseFloat(pkg.dimensions.height) || 0,
              unit: pkg.dimensions.unit
            }
          }))
        }
      };
      const result = await api.post('/shipstation/labels', payload);
      setCreatedLabel(result);
      loadLabels();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create label');
    } finally {
      setCreating(false);
    }
  };

  const handleVoid = async (labelId) => {
    if (!confirm('Void this label? This cannot be undone.')) return;
    setVoiding(labelId);
    try {
      await api.put(`/shipstation/labels/${labelId}/void`);
      loadLabels();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to void label');
    } finally {
      setVoiding(null);
    }
  };

  const AddressFields = ({ which, label }) => (
    <div>
      <h4 className="text-sm font-medium text-gray-700 mb-2">{label}</h4>
      <div className="grid grid-cols-2 gap-2">
        <input placeholder="Name" value={form[which].name} onChange={e => updateAddress(which, 'name', e.target.value)}
          className="px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg" />
        <input placeholder="Company" value={form[which].company_name} onChange={e => updateAddress(which, 'company_name', e.target.value)}
          className="px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg" />
        <input placeholder="Phone" value={form[which].phone} onChange={e => updateAddress(which, 'phone', e.target.value)}
          className="col-span-2 px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg" />
        <input placeholder="Address Line 1" value={form[which].address_line1} onChange={e => updateAddress(which, 'address_line1', e.target.value)}
          className="col-span-2 px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg" />
        <input placeholder="Address Line 2" value={form[which].address_line2} onChange={e => updateAddress(which, 'address_line2', e.target.value)}
          className="col-span-2 px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg" />
        <input placeholder="City" value={form[which].city_locality} onChange={e => updateAddress(which, 'city_locality', e.target.value)}
          className="px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg" />
        <input placeholder="State" value={form[which].state_province} onChange={e => updateAddress(which, 'state_province', e.target.value)}
          className="px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg" />
        <input placeholder="Postal Code" value={form[which].postal_code} onChange={e => updateAddress(which, 'postal_code', e.target.value)}
          className="px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg" />
        <input placeholder="Country" value={form[which].country_code} onChange={e => updateAddress(which, 'country_code', e.target.value)}
          className="px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg" />
        <select value={form[which].address_residential_indicator} onChange={e => updateAddress(which, 'address_residential_indicator', e.target.value)}
          className="col-span-2 px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg">
          <option value="unknown">Residential?</option>
          <option value="yes">Yes - Residential</option>
          <option value="no">No - Commercial</option>
        </select>
      </div>
    </div>
  );

  const statusColors = {
    completed: 'bg-green-100 text-green-800',
    processing: 'bg-yellow-100 text-yellow-800',
    voided: 'bg-red-100 text-red-800',
    error: 'bg-red-100 text-red-800',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => { setShowForm(!showForm); setCreatedLabel(null); }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          <Plus className="w-3.5 h-3.5" />
          Create Label
        </button>
        <button onClick={loadLabels} disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {/* Created label success */}
      {createdLabel && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-start justify-between">
            <div>
              <h4 className="text-sm font-medium text-green-800">Label Created Successfully</h4>
              <div className="text-xs text-green-700 mt-1 space-y-0.5">
                <p>Label ID: {createdLabel.label_id}</p>
                <p>Tracking: {createdLabel.tracking_number || 'N/A'}</p>
                <p>Cost: ${createdLabel.shipment_cost?.amount?.toFixed(2) || '0.00'} {createdLabel.shipment_cost?.currency?.toUpperCase()}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {createdLabel.label_download?.pdf && (
                <a href={createdLabel.label_download.pdf} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs bg-green-700 text-white rounded-lg hover:bg-green-800">
                  <Download className="w-3 h-3" /> PDF
                </a>
              )}
              {createdLabel.label_download?.png && (
                <a href={createdLabel.label_download.png} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs border border-green-600 text-green-700 rounded-lg hover:bg-green-100">
                  <Download className="w-3 h-3" /> PNG
                </a>
              )}
              <button onClick={() => setCreatedLabel(null)} className="text-green-600 hover:text-green-800">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Label Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-lg p-5 space-y-5">
          <h3 className="text-sm font-semibold text-gray-800">New Shipping Label</h3>

          {/* Carrier & Service */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Carrier</label>
              <select value={form.carrier_id} onChange={e => handleCarrierChange(e.target.value)} required
                className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg">
                <option value="">Select carrier...</option>
                {carriers.map(c => (
                  <option key={c.carrier_id} value={c.carrier_id}>{c.friendly_name || c.name || c.carrier_code}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Service</label>
              <select value={form.service_code} onChange={e => setForm(f => ({ ...f, service_code: e.target.value }))} required
                className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg">
                <option value="">Select service...</option>
                {carrierServices.map(s => (
                  <option key={s.serviceCode || s.service_code} value={s.serviceCode || s.service_code}>
                    {s.name || s.serviceCode || s.service_code}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Ship Date</label>
              <input type="date" value={form.ship_date} onChange={e => setForm(f => ({ ...f, ship_date: e.target.value }))} required
                className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg" />
            </div>
          </div>

          {/* Addresses */}
          <div className="grid grid-cols-2 gap-5">
            <AddressFields which="ship_from" label="Ship From" />
            <AddressFields which="ship_to" label="Ship To" />
          </div>

          {/* Package */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">Package</h4>
            <div className="grid grid-cols-5 gap-2">
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">Weight</label>
                <input type="number" step="0.01" min="0" placeholder="0" value={form.packages[0].weight.value}
                  onChange={e => updatePackage('weight_value', e.target.value)} required
                  className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">Unit</label>
                <select value={form.packages[0].weight.unit} onChange={e => updatePackage('weight_unit', e.target.value)}
                  className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg">
                  <option value="ounce">oz</option>
                  <option value="pound">lb</option>
                  <option value="gram">g</option>
                  <option value="kilogram">kg</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">L (in)</label>
                <input type="number" step="0.1" min="0" placeholder="0" value={form.packages[0].dimensions.length}
                  onChange={e => updatePackage('length', e.target.value)}
                  className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">W (in)</label>
                <input type="number" step="0.1" min="0" placeholder="0" value={form.packages[0].dimensions.width}
                  onChange={e => updatePackage('width', e.target.value)}
                  className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">H (in)</label>
                <input type="number" step="0.1" min="0" placeholder="0" value={form.packages[0].dimensions.height}
                  onChange={e => updatePackage('height', e.target.value)}
                  className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg" />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button type="submit" disabled={creating}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {creating ? 'Creating...' : 'Purchase Label'}
            </button>
            <button type="button" onClick={() => setShowForm(false)}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
              Cancel
            </button>
            <p className="text-xs text-amber-600 ml-auto">Creating a label will purchase it from the carrier.</p>
          </div>
        </form>
      )}

      {/* Labels list */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Label</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Carrier / Service</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tracking</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cost</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {labels.map(l => (
              <tr key={l.label_id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="text-sm font-medium">{l.label_id}</div>
                  {l.shipment_id && <div className="text-xs text-gray-500">{l.shipment_id}</div>}
                </td>
                <td className="px-4 py-3">
                  <div className="text-sm">{l.carrier_code || '-'}</div>
                  <div className="text-xs text-gray-500">{l.service_code?.replace(/_/g, ' ') || ''}</div>
                </td>
                <td className="px-4 py-3 text-sm">
                  {l.tracking_number ? (
                    <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">{l.tracking_number}</code>
                  ) : <span className="text-gray-400">-</span>}
                </td>
                <td className="px-4 py-3 text-sm">
                  {l.shipment_cost ? `$${l.shipment_cost.amount?.toFixed(2)}` : '-'}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${
                    l.voided ? 'bg-red-100 text-red-800' : (statusColors[l.status] || 'bg-gray-100 text-gray-700')
                  }`}>
                    {l.voided ? 'voided' : (l.status || '-')}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {l.created_at ? new Date(l.created_at).toLocaleDateString() : '-'}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    {l.label_download?.pdf && (
                      <a href={l.label_download.pdf} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded" title="Download PDF">
                        <Download className="w-3 h-3" /> PDF
                      </a>
                    )}
                    {!l.voided && l.status === 'completed' && (
                      <button onClick={() => handleVoid(l.label_id)} disabled={voiding === l.label_id}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded disabled:opacity-50">
                        <Ban className="w-3 h-3" /> {voiding === l.label_id ? 'Voiding...' : 'Void'}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {labels.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">{loading ? 'Loading...' : 'No labels found'}</td></tr>
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
