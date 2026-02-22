import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Mail, Phone, Calendar, Package, CreditCard, 
  Save, Globe, User, Edit2, CheckCircle, XCircle, 
  DollarSign, ShoppingBag, Layout, Trash2
} from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';

export default function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [subscriptionPlans, setSubscriptionPlans] = useState([]);
  
  // Edit State
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditEditForm] = useState({
    first_name: '',
    last_name: '',
    phone: '',
    max_sites_override: ''
  });

  // Sub Edit State
  const [editingSub, setEditingSub] = useState(null);
  const [subForm, setSubForm] = useState({
    status: '',
    plan_id: '',
    current_period_end: ''
  });

  useEffect(() => {
    loadCustomer();
    loadPlans();
  }, [id]);

  const loadPlans = async () => {
    try {
      const res = await api.get('/subscription-plans');
      setSubscriptionPlans(res.data || []);
    } catch (e) {}
  };

  const loadCustomer = async () => {
    try {
      setLoading(true);
      const data = await api.get(`/customers/${id}`);
      setCustomer(data);
      setEditEditForm({
        first_name: data.first_name || '',
        last_name: data.last_name || '',
        phone: data.phone || '',
        max_sites_override: data.max_sites_override !== null ? String(data.max_sites_override) : ''
      });
      setError('');
    } catch (err) {
      console.error('Failed to load customer:', err);
      setError('Failed to load customer details');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateCustomer = async (e) => {
    e.preventDefault();
    try {
      setUpdating(true);
      await api.put(`/customers/${id}`, {
        ...editForm,
        max_sites_override: editForm.max_sites_override === '' ? '' : parseInt(editForm.max_sites_override)
      });
      
      toast.success('Customer profile updated');
      setIsEditing(false);
      loadCustomer();
    } catch (err) {
      toast.error(err.message || 'Failed to update');
    } finally {
      setUpdating(false);
    }
  };

  const handleUpdateSub = async (e) => {
    e.preventDefault();
    try {
      setUpdating(true);
      await api.put(`/customer-subscriptions/admin/${editingSub.id}`, subForm);
      toast.success('Subscription updated');
      setEditingSub(null);
      loadCustomer();
    } catch (err) {
      toast.error('Failed to update subscription');
    } finally {
      setUpdating(false);
    }
  };

  const handleDeleteSub = async (subId) => {
    if (!confirm('Delete this subscription record? This will NOT cancel it in Stripe.')) return;
    try {
      setUpdating(true);
      await api.delete(`/customer-subscriptions/admin/${subId}`);
      toast.success('Subscription record deleted');
      loadCustomer();
    } catch (err) {
      toast.error('Failed to delete subscription');
    } finally {
      setUpdating(false);
    }
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric'
    });
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency', currency: 'USD'
    }).format(amount || 0);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (error || !customer) {
    return (
      <div className="space-y-4">
        <button onClick={() => navigate('/customers')} className="btn btn-ghost flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" /> Back to Customers
        </button>
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error || 'Customer not found'}
        </div>
      </div>
    );
  }

  const lifetimeValue = customer.orders?.reduce((sum, o) => sum + parseFloat(o.total || 0), 0) || 0;

  return (
    <div className="space-y-6">
      {/* Top Navigation */}
      <div className="flex items-center justify-between">
        <button onClick={() => navigate('/customers')} className="btn btn-ghost flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" /> Back to Customers
        </button>
        <div className="flex gap-2">
          <button 
            onClick={() => setIsEditing(!isEditing)} 
            className={`btn ${isEditing ? 'btn-secondary' : 'btn-primary'} flex items-center gap-2`}
          >
            {isEditing ? <><XCircle className="w-4 h-4" /> Cancel</> : <><Edit2 className="w-4 h-4" /> Edit Profile</>}
          </button>
        </div>
      </div>

      {/* Header Info */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-2xl font-bold">
              {customer.first_name?.[0]}{customer.last_name?.[0]}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{customer.first_name} {customer.last_name}</h1>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-sm text-gray-500">
                <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" /> {customer.email}</span>
                {customer.phone && <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> {customer.phone}</span>}
                <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> Since {formatDate(customer.created_at)}</span>
              </div>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-4 md:border-l md:pl-6 border-gray-100">
            <div className="text-center px-4">
              <p className="text-xs uppercase tracking-wider text-gray-400 font-semibold">Lifetime Value</p>
              <p className="text-xl font-bold text-green-600">{formatCurrency(lifetimeValue)}</p>
            </div>
            <div className="text-center px-4">
              <p className="text-xs uppercase tracking-wider text-gray-400 font-semibold">Orders</p>
              <p className="text-xl font-bold text-gray-900">{customer.orders?.length || 0}</p>
            </div>
            <div className="text-center px-4">
              <p className="text-xs uppercase tracking-wider text-gray-400 font-semibold">Sites</p>
              <p className="text-xl font-bold text-gray-900">{customer.tenants?.length || 0}</p>
            </div>
            <div className="text-center px-4 border-l border-gray-100 ml-2">
              <p className="text-xs uppercase tracking-wider text-gray-400 font-semibold">Site Limit</p>
              <p className={`text-xl font-bold ${customer.max_sites_override !== null ? 'text-amber-600' : 'text-gray-900'}`}>
                {customer.max_sites_override !== null ? customer.max_sites_override : (customer.subscriptions?.[0]?.max_sites || 1)}
                {customer.max_sites_override !== null && <span className="text-[10px] ml-1 uppercase block leading-none">Override</span>}
              </p>
            </div>
          </div>
        </div>
      </div>

      {isEditing && (
        <div className="bg-primary-50 border border-primary-100 rounded-xl p-6">
          <h3 className="font-bold text-primary-900 mb-4 flex items-center gap-2">
            <User className="w-5 h-5" /> Edit Customer Details
          </h3>
          <form onSubmit={handleUpdateCustomer} className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="label text-xs">First Name</label>
              <input 
                type="text" 
                className="input" 
                value={editForm.first_name} 
                onChange={e => setEditEditForm({...editForm, first_name: e.target.value})}
              />
            </div>
            <div>
              <label className="label text-xs">Last Name</label>
              <input 
                type="text" 
                className="input" 
                value={editForm.last_name} 
                onChange={e => setEditEditForm({...editForm, last_name: e.target.value})}
              />
            </div>
            <div>
              <label className="label text-xs">Phone</label>
              <input 
                type="text" 
                className="input" 
                value={editForm.phone} 
                onChange={e => setEditEditForm({...editForm, phone: e.target.value})}
              />
            </div>
            <div>
              <label className="label text-xs">Site Limit Override</label>
              <input 
                type="number" 
                className="input" 
                value={editForm.max_sites_override} 
                onChange={e => setEditEditForm({...editForm, max_sites_override: e.target.value})}
                placeholder="Default"
              />
            </div>
            <div className="md:col-span-4 flex justify-end gap-2 mt-2">
              <button type="button" onClick={() => setIsEditing(false)} className="btn btn-ghost">Cancel</button>
              <button type="submit" disabled={updating} className="btn btn-primary">
                {updating ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {[
            { id: 'overview', label: 'Overview', icon: Layout },
            { id: 'orders', label: `Orders (${customer.orders?.length || 0})`, icon: ShoppingBag },
            { id: 'sites', label: `Owned Sites (${customer.tenants?.length || 0})`, icon: Globe },
            { id: 'subscriptions', label: 'Billing', icon: CreditCard },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2
                ${activeTab === tab.id 
                  ? 'border-primary-500 text-primary-600' 
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}
              `}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="mt-6">
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="card p-6">
              <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                <User className="w-5 h-5 text-gray-400" /> Recent Activity
              </h3>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="mt-1 bg-green-100 p-1.5 rounded-full"><CheckCircle className="w-3 h-3 text-green-600" /></div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Account created</p>
                    <p className="text-xs text-gray-500">{formatDate(customer.created_at)}</p>
                  </div>
                </div>
                {customer.orders?.[0] && (
                  <div className="flex items-start gap-3">
                    <div className="mt-1 bg-blue-100 p-1.5 rounded-full"><ShoppingBag className="w-3 h-3 text-blue-600" /></div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">Last order placed: {customer.orders[0].order_number}</p>
                      <p className="text-xs text-gray-500">{formatDate(customer.orders[0].created_at)}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="card p-6">
              <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Mail className="w-5 h-5 text-gray-400" /> Verification Status
              </h3>
              <div className={`p-4 rounded-lg border ${customer.email_verified ? 'bg-green-50 border-green-100' : 'bg-amber-50 border-amber-100'}`}>
                <div className="flex items-center gap-3">
                  {customer.email_verified ? (
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  ) : (
                    <XCircle className="w-5 h-5 text-amber-600" />
                  )}
                  <div>
                    <p className={`font-bold text-sm ${customer.email_verified ? 'text-green-800' : 'text-amber-800'}`}>
                      {customer.email_verified ? 'Email Verified' : 'Email Not Verified'}
                    </p>
                    <p className="text-xs opacity-80 mt-0.5">
                      {customer.email_verified ? 'Customer has access to all portal features.' : 'Access to some features may be restricted.'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'orders' && (
          <div className="card overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase">Order #</th>
                  <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase">Date</th>
                  <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-xs font-bold text-gray-500 uppercase text-right">Total</th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {customer.orders?.length > 0 ? (
                  customer.orders.map(order => (
                    <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 font-mono text-sm font-bold text-primary-600">{order.order_number}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{formatDate(order.created_at)}</td>
                      <td className="px-6 py-4 text-sm">
                        <span className={`px-2 py-1 rounded-full text-xs font-bold uppercase ${
                          order.status === 'completed' ? 'bg-green-100 text-green-700' :
                          order.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                          'bg-blue-100 text-blue-700'
                        }`}>
                          {order.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm font-bold text-gray-900 text-right">{formatCurrency(order.total)}</td>
                      <td className="px-6 py-4 text-right">
                        <Link to={`/orders/${order.id}`} className="text-xs font-bold text-primary-600 hover:text-primary-800 uppercase tracking-tight">View Details</Link>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="5" className="px-6 py-12 text-center text-gray-500 italic">No orders yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'sites' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {customer.tenants?.length > 0 ? (
              customer.tenants.map(site => (
                <div key={site.id} className="card p-5 hover:border-primary-200 transition-all group">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-bold text-gray-900 group-hover:text-primary-600 transition-colors">{site.name}</h4>
                      <p className="text-sm text-gray-500 font-mono mt-1">{site.subdomain}.wolfwave.com</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                      site.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {site.status}
                    </span>
                  </div>
                  <div className="mt-4 pt-4 border-t border-gray-50 flex justify-between items-center">
                    <span className="text-[10px] text-gray-400 uppercase font-bold tracking-widest">Added {formatDate(site.created_at)}</span>
                    <a href={`http://${site.subdomain}.localhost:3000`} target="_blank" className="text-primary-600 hover:text-primary-800">
                      <Globe className="w-4 h-4" />
                    </a>
                  </div>
                </div>
              ))
            ) : (
              <div className="md:col-span-2 card p-12 text-center text-gray-500 italic">
                No sites owned by this customer.
              </div>
            )}
          </div>
        )}

        {activeTab === 'subscriptions' && (
          <div className="space-y-6">
            {editingSub && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 mb-6">
                <h3 className="font-bold text-amber-900 mb-4">Edit Subscription Record</h3>
                <form onSubmit={handleUpdateSub} className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="label text-xs">Status</label>
                    <select 
                      className="input" 
                      value={subForm.status} 
                      onChange={e => setSubForm({...subForm, status: e.target.value})}
                    >
                      <option value="active">Active</option>
                      <option value="past_due">Past Due</option>
                      <option value="canceled">Canceled</option>
                      <option value="trialing">Trialing</option>
                      <option value="paused">Paused</option>
                    </select>
                  </div>
                  <div>
                    <label className="label text-xs">Plan</label>
                    <select 
                      className="input" 
                      value={subForm.plan_id} 
                      onChange={e => setSubForm({...subForm, plan_id: e.target.value})}
                    >
                      {subscriptionPlans.map(p => (
                        <option key={p.id} value={p.id}>{p.name} ({formatCurrency(p.price)})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label text-xs">Period End Date</label>
                    <input 
                      type="date" 
                      className="input" 
                      value={subForm.current_period_end ? subForm.current_period_end.split('T')[0] : ''} 
                      onChange={e => setSubForm({...subForm, current_period_end: e.target.value})}
                    />
                  </div>
                  <div className="md:col-span-3 flex justify-end gap-2">
                    <button type="button" onClick={() => setEditingSub(null)} className="btn btn-ghost">Cancel</button>
                    <button type="submit" disabled={updating} className="btn btn-primary bg-amber-600 border-amber-600 hover:bg-amber-700">Update Local Record</button>
                  </div>
                </form>
              </div>
            )}

            {customer.subscriptions?.length > 0 ? (
              customer.subscriptions.map(sub => (
                <div key={sub.id} className="card overflow-hidden">
                  <div className="p-6 flex justify-between items-center bg-gray-50 border-b border-gray-100">
                    <div>
                      <h4 className="text-lg font-bold text-gray-900">{sub.plan_name}</h4>
                      <p className="text-sm text-gray-500">
                        {formatCurrency(sub.plan_price)} / {sub.plan_interval}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest ${
                        sub.status === 'active' ? 'bg-green-100 text-green-700' :
                        sub.status === 'trialing' ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {sub.status}
                      </span>
                      <div className="flex border-l pl-3 ml-1 gap-1">
                        <button 
                          onClick={() => {
                            setEditingSub(sub);
                            setSubForm({
                              status: sub.status,
                              plan_id: sub.plan_id,
                              current_period_end: sub.current_period_end
                            });
                          }}
                          className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-gray-100 rounded"
                          title="Edit local record"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleDeleteSub(sub.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                          title="Delete local record"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                      <p className="text-xs text-gray-400 uppercase font-bold mb-1">Billing Period</p>
                      <p className="text-sm font-medium">
                        {formatDate(sub.current_period_start)} &rarr; {formatDate(sub.current_period_end)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 uppercase font-bold mb-1">Status</p>
                      <p className="text-sm font-medium flex items-center gap-2">
                        {sub.cancel_at_period_end ? (
                          <><XCircle className="w-4 h-4 text-red-500" /> Canceling at end of period</>
                        ) : (
                          <><CheckCircle className="w-4 h-4 text-green-500" /> Auto-renews</>
                        )}
                      </p>
                    </div>
                    <div className="flex justify-end items-center">
                      {sub.stripe_subscription_id && (
                        <span className="text-[10px] font-mono text-gray-400 bg-gray-100 px-2 py-1 rounded">
                          ID: {sub.stripe_subscription_id}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="card p-12 text-center text-gray-500 italic border-dashed border-2">
                No active subscriptions.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
