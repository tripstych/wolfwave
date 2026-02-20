import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { 
  FileText, 
  Layers, 
  Image, 
  Plus, 
  ArrowRight, 
  ShoppingBag, 
  DollarSign, 
  Users,
  AlertTriangle,
  Clock
} from 'lucide-react';

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      const response = await api.get('/dashboard/stats');
      setData(response);
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const { content, revenue, subscriptions, lowStock, recentOrders } = data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500">Welcome back to your WolfWave store overview.</p>
        </div>
        <div className="flex gap-2">
          <Link to="/products/new" className="btn btn-secondary">
            <ShoppingBag className="w-4 h-4 mr-2" />
            New Product
          </Link>
          <Link to="/pages/new" className="btn btn-primary">
            <Plus className="w-4 h-4 mr-2" />
            New Page
          </Link>
        </div>
      </div>

      {/* Main Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Revenue (30d)</p>
              <p className="text-2xl font-bold text-gray-900">${revenue.amount.toFixed(2)}</p>
              <p className="text-xs text-gray-500">{revenue.count} paid orders</p>
            </div>
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <Users className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Active Members</p>
              <p className="text-2xl font-bold text-gray-900">{subscriptions.active_subscribers}</p>
              <p className="text-xs text-gray-500">Recurring subscribers</p>
            </div>
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <ShoppingBag className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Total Products</p>
              <p className="text-2xl font-bold text-gray-900">{content.total_products}</p>
              <p className="text-xs text-gray-500">In your catalog</p>
            </div>
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
              <FileText className="w-6 h-6 text-orange-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Total Pages</p>
              <p className="text-2xl font-bold text-gray-900">{content.total_pages}</p>
              <p className="text-xs text-gray-500">Published content</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Orders */}
        <div className="lg:col-span-2 space-y-4">
          <div className="card">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                <Clock className="w-4 h-4 text-gray-500" />
                Recent Orders
              </h2>
              <Link to="/orders" className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1">
                View all
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="divide-y divide-gray-200">
              {recentOrders.length === 0 ? (
                <div className="px-6 py-8 text-center text-gray-500">
                  No orders yet.
                </div>
              ) : (
                recentOrders.map((order) => (
                  <Link
                    key={order.id}
                    to={`/orders/${order.id}`}
                    className="px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                  >
                    <div>
                      <p className="font-medium text-gray-900">{order.order_number}</p>
                      <p className="text-sm text-gray-500">{order.email}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-gray-900">${parseFloat(order.total).toFixed(2)}</p>
                      <span className={`inline-block px-2 py-0.5 text-[10px] uppercase font-bold rounded-full ${
                        order.status === 'shipped' || order.status === 'completed' 
                          ? 'bg-green-100 text-green-700' 
                          : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {order.status}
                      </span>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Alerts & Inventory */}
        <div className="space-y-4">
          {lowStock.length > 0 && (
            <div className="card border-orange-200 bg-orange-50/30">
              <div className="px-6 py-4 border-b border-orange-100 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-orange-600" />
                <h2 className="font-semibold text-orange-900 text-sm uppercase tracking-wider">Low Stock Alerts</h2>
              </div>
              <div className="p-4 space-y-3">
                {lowStock.map(item => (
                  <Link key={item.id} to={`/products/${item.id}`} className="flex items-center justify-between p-2 rounded hover:bg-orange-100/50 transition-colors">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{item.title}</p>
                      <p className="text-xs text-gray-500">SKU: {item.sku}</p>
                    </div>
                    <span className="text-sm font-bold text-orange-600">
                      {item.inventory_quantity} left
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          <div className="card p-6 space-y-4">
            <h3 className="font-semibold text-gray-900 text-sm uppercase tracking-wider">Quick Links</h3>
            <div className="grid grid-cols-1 gap-2">
              <Link to="/marketing/coupons" className="text-sm text-primary-600 hover:underline flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-primary-600 rounded-full" />
                Manage Coupons
              </Link>
              <Link to="/media" className="text-sm text-primary-600 hover:underline flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-primary-600 rounded-full" />
                Media Library ({content.total_media})
              </Link>
              <Link to="/settings" className="text-sm text-primary-600 hover:underline flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-primary-600 rounded-full" />
                Store Settings
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
