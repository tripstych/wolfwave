import { Link } from 'react-router-dom';
import { Users, Eye, Mail, Calendar } from 'lucide-react';
import DataTable from '../components/DataTable';
import { getSiteUrl } from '../lib/urls';

export default function CustomerList() {
  const formatDate = (date) =>
    new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

  const columns = [
    {
      key: 'first_name',
      label: 'Name',
      render: (_, row) => <span className="font-medium text-gray-900">{row.first_name} {row.last_name}</span>,
    },
    {
      key: 'email',
      label: 'Email',
      render: (value) => (
        <a href={`mailto:${value}`} className="flex items-center gap-2 text-primary-600 hover:underline">
          <Mail className="w-4 h-4" />
          {value}
        </a>
      ),
    },
    {
      key: 'phone',
      label: 'Phone',
      render: (value) => value || '—',
    },
    {
      key: 'created_at',
      label: 'Registered',
      render: (value) => (
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-gray-400" />
          {formatDate(value)}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="w-8 h-8 text-primary-600" />
          <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
        </div>
      </div>

      <div className="flex justify-end">
        <a href={getSiteUrl('/customer/login')} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
          Customer Login
        </a>
      </div>

      <DataTable
        endpoint="/customers"
        pagination={{ mode: 'server', pageSize: 25 }}
        columns={columns}
        search={{
          enabled: true,
          placeholder: 'Search by name or email...',
          fields: ['email', 'first_name', 'last_name'],
        }}
        actions={[
          {
            icon: Eye,
            title: 'View Orders',
            variant: 'blue',
            onClick: (row) => window.location.href = `/customers/${row.id}`,
          },
        ]}
        emptyState={{
          icon: Users,
          message: 'No customers found',
          hint: 'Customers appear here when they place orders',
        }}
      />
    </div>
  );
}
