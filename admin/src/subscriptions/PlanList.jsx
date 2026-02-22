import { useNavigate } from 'react-router-dom';
import { Plus, Edit2, Trash2, Check } from 'lucide-react';
import DataTable from '../components/DataTable';
import api from '../lib/api';

export default function PlanList() {
  const navigate = useNavigate();

  const formatPrice = (price, interval) => {
    const amount = Number(price).toFixed(2);
    const label = interval === 'yearly' ? '/yr' : interval === 'weekly' ? '/wk' : '/mo';
    return `$${amount}${label}`;
  };

  const columns = [
    {
      key: 'name',
      label: 'Plan',
      render: (value, row) => (
        <div>
          <div className="font-medium">{value}</div>
          <div className="text-sm text-gray-500">{row.slug}</div>
        </div>
      ),
    },
    {
      key: 'price',
      label: 'Price',
      render: (value, row) => <span className="font-medium">{formatPrice(value, row.interval)}</span>,
    },
    {
      key: '_count',
      label: 'Subscribers',
      render: (value) => (
        <span className="inline-flex items-center px-2 py-0.5 bg-gray-100 rounded-full text-sm">
          {value?.customer_subscriptions || 0}
        </span>
      ),
    },
    {
      key: 'stripe_price_id',
      label: 'Stripe',
      render: (value) => value ? (
        <span className="text-green-600 flex items-center gap-1">
          <Check className="w-4 h-4" /> Synced
        </span>
      ) : (
        <span className="text-amber-600">Not synced</span>
      ),
    },
    {
      key: 'is_active',
      label: 'Status',
      render: (value) => value ? (
        <span className="inline-flex px-2 py-0.5 bg-green-100 text-green-800 rounded-full text-xs font-medium">Active</span>
      ) : (
        <span className="inline-flex px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full text-xs font-medium">Inactive</span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Subscription Plans</h1>
        <button onClick={() => navigate('/subscriptions/new')} className="btn btn-primary">
          <Plus className="w-4 h-4 mr-2" />
          New Plan
        </button>
      </div>

      <DataTable
        endpoint="/subscription-plans"
        pagination={{ mode: 'client' }}
        columns={columns}
        onRowClick={(row) => navigate(`/subscriptions/${row.id}`)}
        actions={[
          {
            icon: Edit2,
            title: 'Edit',
            onClick: (row) => navigate(`/subscriptions/${row.id}`),
          },
          {
            icon: Trash2,
            title: 'Deactivate',
            variant: 'danger',
            show: (row) => row.is_active,
            onClick: async (row, { refetch }) => {
              if (!window.confirm('Deactivate this plan? Existing subscribers will keep their subscription.')) return;
              await api.delete(`/subscription-plans/${row.id}`);
              refetch();
            },
          },
        ]}
        emptyState={{
          message: 'No subscription plans yet.',
          hint: 'Create one to get started.',
        }}
      />
    </div>
  );
}
