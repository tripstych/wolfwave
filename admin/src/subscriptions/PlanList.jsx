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
        <div style={{
          padding: '1rem',
          backgroundColor: '#fee2e2',
          border: '1px solid #fecaca',
          borderRadius: '4px',
          color: '#991b1b'
        }}>
          {error}
        </div>
      )}

      {plans.length === 0 ? (
        <div style={{
          padding: '2rem',
          backgroundColor: '#f9fafb',
          borderRadius: '8px',
          border: '1px solid #e5e7eb',
          textAlign: 'center',
          color: '#6b7280'
        }}>
          No subscription plans yet. Create one to get started.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Plan</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Price</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Subscribers</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Stripe</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Status</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((plan) => (
                <tr
                  key={plan.id}
                  style={{ borderBottom: '1px solid #e5e7eb', cursor: 'pointer' }}
                  onClick={() => navigate(`/subscriptions/${plan.id}`)}
                >
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <div style={{ fontWeight: 500 }}>{plan.name}</div>
                    <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>{plan.slug}</div>
                  </td>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 500 }}>
                    {formatPrice(plan.price, plan.interval)}
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '0.125rem 0.5rem',
                      backgroundColor: '#f3f4f6',
                      borderRadius: '9999px',
                      fontSize: '0.875rem'
                    }}>
                      {plan._count?.customer_subscriptions || 0}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    {plan.stripe_price_id ? (
                      <span style={{ color: '#059669', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <Check className="w-4 h-4" /> Synced
                      </span>
                    ) : (
                      <span style={{ color: '#d97706' }}>Not synced</span>
                    )}
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    {plan.is_active ? (
                      <span style={{
                        display: 'inline-flex',
                        padding: '0.125rem 0.5rem',
                        backgroundColor: '#d1fae5',
                        color: '#065f46',
                        borderRadius: '9999px',
                        fontSize: '0.75rem',
                        fontWeight: 500
                      }}>Active</span>
                    ) : (
                      <span style={{
                        display: 'inline-flex',
                        padding: '0.125rem 0.5rem',
                        backgroundColor: '#f3f4f6',
                        color: '#6b7280',
                        borderRadius: '9999px',
                        fontSize: '0.75rem',
                        fontWeight: 500
                      }}>Inactive</span>
                    )}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => navigate(`/subscriptions/${plan.id}`)}
                        className="btn btn-sm btn-secondary"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      {plan.is_active && (
                        <button
                          onClick={() => deletePlan(plan.id)}
                          className="btn btn-sm btn-ghost"
                          style={{ color: '#ef4444' }}
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
