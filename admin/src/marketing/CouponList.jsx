import { Link } from 'react-router-dom';
import { Plus, Tag, Trash2, Edit, CheckCircle, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import DataTable from '../components/DataTable';
import api from '../lib/api';

export default function CouponList() {
  const columns = [
    {
      key: 'code',
      label: 'Code',
      render: (value) => (
        <div className="flex items-center gap-2">
          <Tag className="w-4 h-4 text-primary-600" />
          <span className="font-bold text-gray-900">{value}</span>
        </div>
      ),
    },
    {
      key: 'discount_value',
      label: 'Discount',
      render: (value, row) => (
        <span className="text-sm text-gray-600">
          {row.discount_type === 'percentage'
            ? `${parseFloat(value)}%`
            : `$${parseFloat(value).toFixed(2)}`}
        </span>
      ),
    },
    {
      key: 'used_count',
      label: 'Usage',
      render: (value, row) => (
        <span className="text-sm text-gray-600">
          {value || 0} / {row.max_uses || '\u221E'}
        </span>
      ),
    },
    {
      key: 'is_active',
      label: 'Status',
      render: (value) => value ? (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
          <CheckCircle className="w-3 h-3" /> Active
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
          <XCircle className="w-3 h-3" /> Inactive
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Coupons</h1>
        <Link to="/marketing/coupons/new" className="btn btn-primary">
          <Plus className="w-4 h-4 mr-2" />
          New Coupon
        </Link>
      </div>

      <DataTable
        endpoint="/coupons"
        pagination={{ mode: 'server' }}
        columns={columns}
        search={{
          enabled: true,
          placeholder: 'Search by code...',
          fields: ['code'],
        }}
        selection={{
          enabled: true,
          bulkActions: [
            {
              label: 'Delete Selected',
              icon: Trash2,
              variant: 'danger',
              onAction: async (ids, { refetch }) => {
                const countStr = ids === 'all' ? 'all results' : `${ids.length} coupon(s)`;
                if (!window.confirm(`Delete ${countStr}? This cannot be undone.`)) return;
                try {
                  await api.delete('/coupons/bulk', { ids });
                  toast.success(`Deleted ${countStr}`);
                  refetch();
                } catch {
                  toast.error('Failed to delete some coupons');
                }
              },
            },
          ],
        }}
        actions={[
          {
            icon: Edit,
            title: 'Edit',
            onClick: (row) => window.location.href = `/marketing/coupons/${row.id}`,
          },
          {
            icon: Trash2,
            title: 'Delete',
            variant: 'danger',
            onClick: async (row, { refetch }) => {
              if (!confirm('Are you sure you want to delete this coupon?')) return;
              try {
                await api.delete(`/coupons/${row.id}`);
                toast.success('Coupon deleted');
                refetch();
              } catch {
                toast.error('Failed to delete coupon');
              }
            },
          },
        ]}
        emptyState={{
          message: 'No coupons found',
        }}
      />
    </div>
  );
}
