import { Link } from 'react-router-dom';
import { Plus, Tag, Trash2, Edit, CheckCircle, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import DataTable from '../components/DataTable';
import api from '../lib/api';
import { useTranslation } from '../context/TranslationContext';

export default function CouponList() {
  const { _ } = useTranslation();

  const columns = [
    {
      key: 'code',
      label: _('coupons.code', 'Code'),
      render: (value) => (
        <div className="flex items-center gap-2">
          <Tag className="w-4 h-4 text-primary-600" />
          <span className="font-bold text-gray-900">{value}</span>
        </div>
      ),
    },
    {
      key: 'discount_value',
      label: _('coupons.discount', 'Discount'),
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
      label: _('coupons.usage', 'Usage'),
      render: (value, row) => (
        <span className="text-sm text-gray-600">
          {value || 0} / {row.max_uses || '\u221E'}
        </span>
      ),
    },
    {
      key: 'is_active',
      label: _('common.status', 'Status'),
      render: (value) => value ? (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
          <CheckCircle className="w-3 h-3" /> {_('common.active', 'Active')}
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
          <XCircle className="w-3 h-3" /> {_('common.inactive', 'Inactive')}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{_('coupons.list_title', 'Coupons')}</h1>
        <Link to="/marketing/coupons/new" className="btn btn-primary">
          <Plus className="w-4 h-4 mr-2" />
          {_('coupons.new_coupon', 'New Coupon')}
        </Link>
      </div>

      <DataTable
        endpoint="/coupons"
        pagination={{ mode: 'server' }}
        columns={columns}
        search={{
          enabled: true,
          placeholder: _('coupons.search_placeholder', 'Search by code...'),
          fields: ['code'],
        }}
        selection={{
          enabled: true,
          bulkActions: [
            {
              label: _('common.delete_selected', 'Delete Selected'),
              icon: Trash2,
              variant: 'danger',
              onAction: async (ids, { refetch }) => {
                const countStr = ids === 'all' ? _('common.all_results', 'all results') : `${ids.length} ${_('coupons.count', 'coupon(s)')}`;
                if (!window.confirm(`${_('common.confirm_delete', 'Delete')} ${countStr}? ${_('common.cannot_be_undone', 'This cannot be undone.')}`)) return;
                try {
                  await api.delete('/coupons/bulk', { ids });
                  toast.success(`${_('common.deleted', 'Deleted')} ${countStr}`);
                  refetch();
                } catch {
                  toast.error(_('coupons.error.bulk_delete', 'Failed to delete some coupons'));
                }
              },
            },
          ],
        }}
        actions={[
          {
            icon: Edit,
            title: _('common.edit', 'Edit'),
            onClick: (row) => window.location.href = `/marketing/coupons/${row.id}`,
          },
          {
            icon: Trash2,
            title: _('common.delete', 'Delete'),
            variant: 'danger',
            onClick: async (row, { refetch }) => {
              if (!confirm(_('coupons.confirm_delete_single', 'Are you sure you want to delete this coupon?'))) return;
              try {
                await api.delete(`/coupons/${row.id}`);
                toast.success(_('coupons.success.deleted', 'Coupon deleted'));
                refetch();
              } catch {
                toast.error(_('coupons.error.delete', 'Failed to delete coupon'));
              }
            },
          },
        ]}
        emptyState={{
          message: _('coupons.empty_message', 'No coupons found'),
        }}
      />
    </div>
  );
}
