import { useNavigate } from 'react-router-dom';
import DataTable from '../components/DataTable';
import { useTranslation } from '../context/TranslationContext';

export default function OrderList() {
  const navigate = useNavigate();
  const { _ } = useTranslation();

  const formatDate = (date) =>
    new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

  const formatCurrency = (amount) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

  const statusBadge = (value) => {
    const colors = {
      pending: 'bg-yellow-100 text-yellow-800',
      processing: 'bg-blue-100 text-blue-800',
      shipped: 'bg-green-100 text-green-800',
      completed: 'bg-green-100 text-green-800',
      cancelled: 'bg-red-100 text-red-800',
      refunded: 'bg-purple-100 text-purple-800',
    };
    return (
      <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${colors[value] || 'bg-gray-100 text-gray-800'}`}>
        {_( `status.${value}`, value)}
      </span>
    );
  };

  const paymentBadge = (value) => {
    const colors = {
      pending: 'bg-yellow-100 text-yellow-800',
      paid: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800',
      refunded: 'bg-purple-100 text-purple-800',
    };
    return (
      <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${colors[value] || 'bg-gray-100 text-gray-800'}`}>
        {_( `payment_status.${value}`, value)}
      </span>
    );
  };

  const columns = [
    { key: 'order_number', label: _('orders.order_num', 'Order #'), render: (v) => <span className="font-medium text-gray-900">{v}</span> },
    { key: 'email', label: _('orders.customer', 'Customer') },
    { key: 'created_at', label: _('orders.date', 'Date'), render: (v) => formatDate(v) },
    { key: 'total', label: _('orders.total', 'Total'), render: (v) => <span className="font-medium text-gray-900">{formatCurrency(v)}</span> },
    { key: 'status', label: _('orders.status', 'Status'), render: (v) => statusBadge(v) },
    { key: 'payment_status', label: _('orders.payment', 'Payment'), render: (v) => paymentBadge(v) },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{_('orders.title', 'Orders')}</h1>
      </div>

      <DataTable
        endpoint="/orders"
        pagination={{ mode: 'server' }}
        columns={columns}
        selection={{
          enabled: true,
          bulkActions: [],
        }}
        search={{
          enabled: true,
          placeholder: _('orders.search_placeholder', 'Search by order number or email...'),
        }}
        filters={[
          {
            type: 'select',
            key: 'status',
            options: [
              { value: '', label: _('orders.filter.all_status', 'All Status') },
              { value: 'pending', label: _('status.pending', 'Pending') },
              { value: 'processing', label: _('status.processing', 'Processing') },
              { value: 'shipped', label: _('status.shipped', 'Shipped') },
              { value: 'completed', label: _('status.completed', 'Completed') },
              { value: 'cancelled', label: _('status.cancelled', 'Cancelled') },
            ],
          },
          {
            type: 'select',
            key: 'payment_status',
            options: [
              { value: '', label: _('orders.filter.all_payment_status', 'All Payment Status') },
              { value: 'pending', label: _('payment_status.pending', 'Pending') },
              { value: 'paid', label: _('payment_status.paid', 'Paid') },
              { value: 'failed', label: _('payment_status.failed', 'Failed') },
              { value: 'refunded', label: _('payment_status.refunded', 'Refunded') },
            ],
          },
        ]}
        actions={[
          {
            title: _('common.view', 'View'),
            variant: 'blue',
            onClick: (row) => navigate(`/orders/${row.id}`),
          },
        ]}
        emptyState={{
          message: _('orders.empty_message', 'No orders found.'),
          hint: _('orders.empty_hint', 'Try adjusting your filters.'),
        }}
      />
    </div>
  );
}
