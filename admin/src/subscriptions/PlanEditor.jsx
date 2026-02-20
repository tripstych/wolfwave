import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Save, ArrowLeft, Plus, X } from 'lucide-react';
import SlugAutocomplete from '../components/SlugAutocomplete';

export default function PlanEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id || id === 'new';

  const [plan, setPlan] = useState({
    name: '',
    slug: '',
    description: '',
    price: '',
    interval: 'monthly',
    interval_count: 1,
    trial_days: 0,
    product_discount: 0,
    target_slugs: [],
    features: [],
    is_active: true,
    position: 0
  });

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [newFeature, setNewFeature] = useState('');

  useEffect(() => {
    if (!isNew) loadPlan();
  }, [id]);

  const loadPlan = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/subscription-plans/${id}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (!response.ok) throw new Error('Failed to load plan');
      const data = await response.json();
      setPlan({
        name: data.name || '',
        slug: data.slug || '',
        description: data.description || '',
        price: data.price || '',
        interval: data.interval || 'monthly',
        interval_count: data.interval_count || 1,
        trial_days: data.trial_days || 0,
        product_discount: data.product_discount || 0,
        target_slugs: Array.isArray(data.target_slugs) ? data.target_slugs : [],
        features: Array.isArray(data.features) ? data.features : [],
        is_active: data.is_active !== false,
        position: data.position || 0,
        stripe_product_id: data.stripe_product_id,
        stripe_price_id: data.stripe_price_id
      });
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);

      if (!plan.name.trim()) {
        setError('Plan name is required');
        setSaving(false);
        return;
      }
      if (!plan.slug.trim()) {
        setError('Slug is required');
        setSaving(false);
        return;
      }
      if (!plan.price && plan.price !== 0) {
        setError('Price is required');
        setSaving(false);
        return;
      }

      const method = isNew ? 'POST' : 'PUT';
      const url = isNew ? '/api/subscription-plans' : `/api/subscription-plans/${id}`;

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          name: plan.name,
          slug: plan.slug,
          description: plan.description,
          price: parseFloat(plan.price),
          interval: plan.interval,
          interval_count: parseInt(plan.interval_count) || 1,
          trial_days: parseInt(plan.trial_days) || 0,
          product_discount: parseFloat(plan.product_discount) || 0,
          target_slugs: plan.target_slugs,
          features: plan.features,
          is_active: plan.is_active,
          position: parseInt(plan.position) || 0
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save plan');
      }

      const saved = await response.json();
      navigate(`/subscriptions/${saved.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const generateSlug = (name) => {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  };

  const handleNameChange = (name) => {
    const updates = { name };
    if (isNew || !plan.slug) {
      updates.slug = generateSlug(name);
    }
    setPlan({ ...plan, ...updates });
  };

  const addFeature = () => {
    if (!newFeature.trim()) return;
    setPlan({ ...plan, features: [...plan.features, newFeature.trim()] });
    setNewFeature('');
  };

  const removeFeature = (index) => {
    setPlan({ ...plan, features: plan.features.filter((_, i) => i !== index) });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingBottom: '1rem',
        borderBottom: '1px solid #e5e7eb'
      }}>
        <h1 className="text-2xl font-bold text-gray-900">
          {isNew ? 'New Plan' : plan.name}
        </h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            className="btn btn-secondary"
            onClick={() => navigate('/subscriptions')}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Saving...' : 'Save Plan'}
          </button>
        </div>
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

      {/* Stripe Status */}
      {!isNew && (
        <div style={{
          padding: '0.75rem 1rem',
          backgroundColor: plan.stripe_price_id ? '#ecfdf5' : '#fffbeb',
          border: `1px solid ${plan.stripe_price_id ? '#a7f3d0' : '#fde68a'}`,
          borderRadius: '4px',
          fontSize: '0.875rem'
        }}>
          {plan.stripe_price_id ? (
            <span>Synced to Stripe — Product: <code style={{ fontSize: '0.8rem' }}>{plan.stripe_product_id}</code> | Price: <code style={{ fontSize: '0.8rem' }}>{plan.stripe_price_id}</code></span>
          ) : (
            <span>Not synced to Stripe. Configure your Stripe secret key in Settings to enable auto-sync.</span>
          )}
        </div>
      )}

      {/* Plan Details */}
      <div className="card p-6 space-y-4">
        <h2 style={{ fontSize: '1.125rem', fontWeight: 500, marginTop: 0 }}>Plan Details</h2>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div>
            <label className="label">Plan Name *</label>
            <input
              type="text"
              value={plan.name}
              onChange={(e) => handleNameChange(e.target.value)}
              className="input"
              placeholder="e.g., Pro, Premium, Business"
            />
          </div>
          <div>
            <label className="label">Slug *</label>
            <input
              type="text"
              value={plan.slug}
              onChange={(e) => setPlan({ ...plan, slug: e.target.value })}
              className="input"
              placeholder="e.g., pro, premium"
            />
          </div>
        </div>

        <div>
          <label className="label">Description</label>
          <textarea
            value={plan.description}
            onChange={(e) => setPlan({ ...plan, description: e.target.value })}
            className="input"
            rows={3}
            placeholder="Brief description of this plan"
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <input
            type="checkbox"
            checked={plan.is_active}
            onChange={(e) => setPlan({ ...plan, is_active: e.target.checked })}
            id="is_active"
          />
          <label htmlFor="is_active" style={{ fontSize: '0.875rem', fontWeight: 500 }}>Active</label>
        </div>
      </div>

      {/* Pricing */}
      <div className="card p-6 space-y-4">
        <h2 style={{ fontSize: '1.125rem', fontWeight: 500, marginTop: 0 }}>Pricing</h2>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
          <div>
            <label className="label">Price (USD) *</label>
            <input
              type="number"
              value={plan.price}
              onChange={(e) => setPlan({ ...plan, price: e.target.value })}
              className="input"
              min="0"
              step="0.01"
              placeholder="9.99"
            />
          </div>
          <div>
            <label className="label">Billing Interval</label>
            <select
              value={plan.interval}
              onChange={(e) => setPlan({ ...plan, interval: e.target.value })}
              className="input"
            >
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </div>
          <div>
            <label className="label">Interval Count</label>
            <input
              type="number"
              value={plan.interval_count}
              onChange={(e) => setPlan({ ...plan, interval_count: e.target.value })}
              className="input"
              min="1"
              placeholder="1"
            />
            <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
              e.g., 2 + monthly = every 2 months
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div style={{ maxWidth: '200px' }}>
            <label className="label">Free Trial Days</label>
            <input
              type="number"
              value={plan.trial_days}
              onChange={(e) => setPlan({ ...plan, trial_days: e.target.value })}
              className="input"
              min="0"
              placeholder="0"
            />
          </div>

          <div style={{ maxWidth: '200px' }}>
            <label className="label">Product Discount (%)</label>
            <input
              type="number"
              value={plan.product_discount}
              onChange={(e) => setPlan({ ...plan, product_discount: e.target.value })}
              className="input"
              min="0"
              max="100"
              step="0.1"
              placeholder="0"
            />
            <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
              Automatic discount for active subscribers
            </p>
          </div>
        </div>

        <div>
          <label className="label">Target Product Slugs</label>
          <SlugAutocomplete 
            value={plan.target_slugs}
            onChange={(slugs) => setPlan({ ...plan, target_slugs: slugs })}
            placeholder="Search for products or enter wildcards..."
          />
        </div>

        <div style={{ maxWidth: '200px' }}>
          <label className="label">Sort Position</label>
          <input
            type="number"
            value={plan.position}
            onChange={(e) => setPlan({ ...plan, position: e.target.value })}
            className="input"
            min="0"
            placeholder="0"
          />
        </div>
      </div>

      {/* Features */}
      <div className="card p-6 space-y-4">
        <h2 style={{ fontSize: '1.125rem', fontWeight: 500, marginTop: 0 }}>Features</h2>
        <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '-0.5rem' }}>
          List the features included in this plan. These are displayed on the pricing page.
        </p>

        {plan.features.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {plan.features.map((feature, index) => (
              <div
                key={index}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.5rem 0.75rem',
                  backgroundColor: '#f9fafb',
                  borderRadius: '4px',
                  border: '1px solid #e5e7eb'
                }}
              >
                <span style={{ flex: 1, fontSize: '0.875rem' }}>{feature}</span>
                <button
                  onClick={() => removeFeature(index)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#9ca3af',
                    padding: '0.25rem',
                    display: 'flex'
                  }}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            type="text"
            value={newFeature}
            onChange={(e) => setNewFeature(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addFeature())}
            className="input"
            placeholder="e.g., Unlimited downloads"
            style={{ flex: 1 }}
          />
          <button
            onClick={addFeature}
            className="btn btn-secondary"
            disabled={!newFeature.trim()}
          >
            <Plus className="w-4 h-4 mr-1" />
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
