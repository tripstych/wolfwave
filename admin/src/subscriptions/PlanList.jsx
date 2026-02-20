import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit2, Trash2, Check, X, GripVertical } from 'lucide-react';

export default function PlanList() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/subscription-plans', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (!response.ok) throw new Error('Failed to fetch plans');
      const data = await response.json();
      setPlans(data.data || []);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const deletePlan = async (id) => {
    if (!window.confirm('Deactivate this plan? Existing subscribers will keep their subscription.')) return;
    try {
      const response = await fetch(`/api/subscription-plans/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (!response.ok) throw new Error('Failed to deactivate plan');
      fetchPlans();
    } catch (err) {
      setError(err.message);
    }
  };

  const formatPrice = (price, interval) => {
    const amount = Number(price).toFixed(2);
    const intervalLabel = interval === 'yearly' ? '/yr' : interval === 'weekly' ? '/wk' : '/mo';
    return `$${amount}${intervalLabel}`;
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
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Subscription Plans</h1>
        <button
          onClick={() => navigate('/subscriptions/new')}
          className="btn btn-primary"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Plan
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded text-red-800">
          {error}
        </div>
      )}

      {plans.length === 0 ? (
        <div className="p-8 bg-gray-50 rounded-lg border border-gray-200 text-center text-gray-500">
          No subscription plans yet. Create one to get started.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Plan</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Price</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Subscribers</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Stripe</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((plan) => (
                <tr
                  key={plan.id}
                  className="border-b border-gray-200 cursor-pointer hover:bg-gray-50"
                  onClick={() => navigate(`/subscriptions/${plan.id}`)}
                >
                  <td className="px-4 py-3">
                    <div className="font-medium">{plan.name}</div>
                    <div className="text-sm text-gray-500">{plan.slug}</div>
                  </td>
                  <td className="px-4 py-3 font-medium">
                    {formatPrice(plan.price, plan.interval)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center px-2 py-0.5 bg-gray-100 rounded-full text-sm">
                      {plan._count?.customer_subscriptions || 0}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {plan.stripe_price_id ? (
                      <span className="text-green-600 flex items-center gap-1">
                        <Check className="w-4 h-4" /> Synced
                      </span>
                    ) : (
                      <span className="text-amber-600">Not synced</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {plan.is_active ? (
                      <span className="inline-flex px-2 py-0.5 bg-green-100 text-green-800 rounded-full text-xs font-medium">Active</span>
                    ) : (
                      <span className="inline-flex px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full text-xs font-medium">Inactive</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => navigate(`/subscriptions/${plan.id}`)}
                        className="btn btn-sm btn-secondary"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      {plan.is_active && (
                        <button
                          onClick={() => deletePlan(plan.id)}
                          className="btn btn-sm btn-ghost text-red-500"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
