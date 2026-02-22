import { useNavigate } from 'react-router-dom';
import DataTable from '../components/DataTable';

export default function OrderList() {
  const navigate = useNavigate();

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
        {value}
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
        {value}
      </span>
    );
  };

  const columns = [
    { key: 'order_number', label: 'Order #', render: (v) => <span className="font-medium text-gray-900">{v}</span> },
    { key: 'email', label: 'Customer' },
    { key: 'created_at', label: 'Date', render: (v) => formatDate(v) },
    { key: 'total', label: 'Total', render: (v) => <span className="font-medium text-gray-900">{formatCurrency(v)}</span> },
    { key: 'status', label: 'Status', render: (v) => statusBadge(v) },
    { key: 'payment_status', label: 'Payment', render: (v) => paymentBadge(v) },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Orders</h1>
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
          placeholder: 'Search by order number or email...',
        }}
        filters={[
          {
            type: 'select',
            key: 'status',
            options: [
              { value: '', label: 'All Status' },
              { value: 'pending', label: 'Pending' },
              { value: 'processing', label: 'Processing' },
              { value: 'shipped', label: 'Shipped' },
              { value: 'completed', label: 'Completed' },
              { value: 'cancelled', label: 'Cancelled' },
            ],
          },
          {
            type: 'select',
            key: 'payment_status',
            options: [
              { value: '', label: 'All Payment Status' },
              { value: 'pending', label: 'Pending' },
              { value: 'paid', label: 'Paid' },
              { value: 'failed', label: 'Failed' },
              { value: 'refunded', label: 'Refunded' },
            ],
          },
        ]}
        actions={[
          {
            title: 'View',
            variant: 'blue',
            onClick: (row) => navigate(`/orders/${row.id}`),
          },
        ]}
        emptyState={{
          message: 'No orders found.',
          hint: 'Try adjusting your filters.',
        }}
      />
    </div>
  );
}
