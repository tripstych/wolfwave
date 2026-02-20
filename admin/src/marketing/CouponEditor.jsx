import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Save, ArrowLeft, Calendar, Tag } from 'lucide-react';
import api from '../lib/api';
import { toast } from 'sonner';
import SlugAutocomplete from '../components/SlugAutocomplete';

export default function CouponEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id || id === 'new';

  const [coupon, setCoupon] = useState({
    code: '',
    discount_type: 'percentage',
    discount_value: '',
    min_purchase: 0,
    starts_at: '',
    expires_at: '',
    max_uses: '',
    is_active: true,
    target_slugs: []
  });

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isNew) loadCoupon();
  }, [id]);

  const loadCoupon = async () => {
    try {
      setLoading(true);
      const data = await api.get(`/coupons`);
      const found = data.find(c => String(c.id) === String(id));
      if (!found) throw new Error('Coupon not found');
      
      setCoupon({
        ...found,
        starts_at: found.starts_at ? new Date(found.starts_at).toISOString().split('T')[0] : '',
        expires_at: found.expires_at ? new Date(found.expires_at).toISOString().split('T')[0] : '',
        discount_value: parseFloat(found.discount_value),
        min_purchase: parseFloat(found.min_purchase || 0),
        max_uses: found.max_uses || '',
        target_slugs: Array.isArray(found.target_slugs) ? found.target_slugs : []
      });
    } catch (err) {
      toast.error('Failed to load coupon');
      navigate('/marketing/coupons');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!coupon.code || !coupon.discount_value) {
      toast.error('Code and value are required');
      return;
    }

    try {
      setSaving(true);
      const payload = {
        ...coupon,
        discount_value: parseFloat(coupon.discount_value),
        min_purchase: parseFloat(coupon.min_purchase || 0),
        max_uses: coupon.max_uses ? parseInt(coupon.max_uses) : null,
        target_slugs: coupon.target_slugs
      };

      if (isNew) {
        await api.post('/coupons', payload);
        toast.success('Coupon created');
      } else {
        await api.put(`/coupons/${id}`, payload);
        toast.success('Coupon updated');
      }
      navigate('/marketing/coupons');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save coupon');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/marketing/coupons')} className="btn btn-ghost">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h1 className="text-2xl font-bold text-gray-900">
            {isNew ? 'New Coupon' : `Edit: ${coupon.code}`}
          </h1>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn btn-primary"
        >
          <Save className="w-4 h-4 mr-2" />
          {saving ? 'Saving...' : 'Save Coupon'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card p-6 space-y-4">
          <h2 className="font-semibold flex items-center gap-2">
            <Tag className="w-4 h-4" /> Basics
          </h2>
          
          <div>
            <label className="label">Coupon Code</label>
            <input
              type="text"
              value={coupon.code}
              onChange={(e) => setCoupon({ ...coupon, code: e.target.value.toUpperCase() })}
              className="input font-mono"
              placeholder="SUMMER20"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Type</label>
              <select
                value={coupon.discount_type}
                onChange={(e) => setCoupon({ ...coupon, discount_type: e.target.value })}
                className="input"
              >
                <option value="percentage">Percentage (%)</option>
                <option value="fixed">Fixed Amount ($)</option>
              </select>
            </div>
            <div>
              <label className="label">Value</label>
              <input
                type="number"
                value={coupon.discount_value}
                onChange={(e) => setCoupon({ ...coupon, discount_value: e.target.value })}
                className="input"
                placeholder="10"
              />
            </div>
          </div>

          <div>
            <label className="label">Min. Purchase Amount ($)</label>
            <input
              type="number"
              value={coupon.min_purchase}
              onChange={(e) => setCoupon({ ...coupon, min_purchase: e.target.value })}
              className="input"
              placeholder="0.00"
            />
          </div>

          <div>
            <label className="label">Target Product Slugs</label>
            <SlugAutocomplete 
              value={coupon.target_slugs}
              onChange={(slugs) => setCoupon({ ...coupon, target_slugs: slugs })}
              placeholder="Search for products or enter wildcards..."
            />
          </div>
        </div>

        <div className="card p-6 space-y-4">
          <h2 className="font-semibold flex items-center gap-2">
            <Calendar className="w-4 h-4" /> Limits & Dates
          </h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Starts At</label>
              <input
                type="date"
                value={coupon.starts_at}
                onChange={(e) => setCoupon({ ...coupon, starts_at: e.target.value })}
                className="input"
              />
            </div>
            <div>
              <label className="label">Expires At</label>
              <input
                type="date"
                value={coupon.expires_at}
                onChange={(e) => setCoupon({ ...coupon, expires_at: e.target.value })}
                className="input"
              />
            </div>
          </div>

          <div>
            <label className="label">Max. Total Uses</label>
            <input
              type="number"
              value={coupon.max_uses}
              onChange={(e) => setCoupon({ ...coupon, max_uses: e.target.value })}
              className="input"
              placeholder="Leave blank for unlimited"
            />
          </div>

          <div className="flex items-center gap-2 pt-4">
            <input
              type="checkbox"
              id="is_active"
              checked={coupon.is_active}
              onChange={(e) => setCoupon({ ...coupon, is_active: e.target.checked })}
              className="w-4 h-4 rounded border-gray-300 text-primary-600"
            />
            <label htmlFor="is_active" className="text-sm font-medium text-gray-700">
              Coupon is active
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
