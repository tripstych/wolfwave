import { Link, useNavigate } from 'react-router-dom';
import { Users, Eye, Mail, Calendar, CreditCard, DollarSign } from 'lucide-react';
import DataTable from '../components/DataTable';
import { getSiteUrl } from '../lib/urls';

export default function CustomerList() {
  const navigate = useNavigate();
  
  const formatDate = (date) =>
    new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount || 0);
  };

  const columns = [
    {
      key: 'first_name',
      label: 'Customer',
      render: (_, row) => (
        <div className="flex flex-col">
          <button 
            onClick={() => navigate(`/customers/${row.id}`)}
            className="text-left font-semibold text-primary-600 hover:text-primary-900 transition-colors"
          >
            {row.first_name} {row.last_name}
          </button>
          <span className="text-xs text-gray-500">{row.email}</span>
        </div>
      ),
    },
    {
      key: 'orders',
      label: 'Orders',
      render: (orders) => (
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-gray-900">{orders?.length || 0}</span>
          <span className="text-xs text-gray-400 uppercase">Total</span>
        </div>
      ),
    },
    {
      key: 'total_spent',
      label: 'Lifetime Value',
      render: (_, row) => {
        const total = row.orders?.reduce((sum, o) => sum + parseFloat(orderTotal(o)), 0) || 0;
        return (
          <div className="flex items-center gap-1 text-green-700 font-medium">
            <DollarSign className="w-3 h-3" />
            {formatCurrency(total)}
          </div>
        );
      },
    },
    {
      key: 'created_at',
      label: 'Customer Since',
      render: (value) => (
        <div className="flex items-center gap-2 text-gray-600 text-sm">
          <Calendar className="w-4 h-4 text-gray-400" />
          {formatDate(value)}
        </div>
      ),
    },
  ];

  const orderTotal = (order) => {
    return typeof order.total === 'object' ? order.total.toString() : order.total;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-primary-100 p-2 rounded-lg">
            <Users className="w-6 h-6 text-primary-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
        </div>
        <div className="flex gap-2">
          <a href={getSiteUrl('/customer/login')} target="_blank" rel="noopener noreferrer" className="btn btn-secondary flex items-center gap-2">
            <CreditCard className="w-4 h-4" />
            Portal Login
          </a>
        </div>
      </div>

      <DataTable
        endpoint="/customers"
        pagination={{ mode: 'server' }}
        columns={columns}
        search={{
          enabled: true,
          placeholder: 'Search by name or email...',
          fields: ['email', 'first_name', 'last_name'],
        }}
        actions={[
          {
            icon: Eye,
            title: 'View Details',
            variant: 'blue',
            onClick: (row) => navigate(`/customers/${row.id}`),
          },
          {
            icon: Mail,
            title: 'Send Email',
            onClick: (row) => window.location.href = `mailto:${row.email}`,
          },
        ]}
        emptyState={{
          icon: Users,
          message: 'No customers found',
          hint: 'Customers appear here when they create accounts or place orders.',
        }}
      />
    </div>
  );
}
