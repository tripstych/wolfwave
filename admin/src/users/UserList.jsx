import { Link } from 'react-router-dom';
import { Plus, Edit2, Trash2 } from 'lucide-react';
import DataTable from '../components/DataTable';
import api from '../lib/api';

export default function UserList() {
  const formatDate = (date) =>
    new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

  const getRoleBadgeColor = (role) => {
    switch (role) {
      case 'admin': return 'bg-purple-100 text-purple-700';
      case 'editor': return 'bg-blue-100 text-blue-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const columns = [
    {
      key: 'name',
      label: 'Name',
      render: (value) => <span className="font-medium text-gray-900">{value || '—'}</span>,
    },
    { key: 'email', label: 'Email' },
    {
      key: 'role',
      label: 'Role',
      render: (value) => (
        <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${getRoleBadgeColor(value)}`}>
          {value}
        </span>
      ),
    },
    {
      key: 'created_at',
      label: 'Created',
      render: (value) => formatDate(value),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Users</h1>
        <Link to="/users/new" className="btn btn-primary">
          <Plus className="w-4 h-4 mr-2" />
          New User
        </Link>
      </div>

      <DataTable
        endpoint="/auth/users"
        pagination={{ mode: 'none' }}
        columns={columns}
        selection={{
          enabled: true,
          bulkActions: [
            {
              label: 'Delete Selected',
              icon: Trash2,
              variant: 'danger',
              onAction: async (ids) => {
                if (!window.confirm(`Delete ${ids.length} user(s)? This cannot be undone.`)) return;
                await Promise.all(ids.map(id => api.delete(`/auth/users/${id}`)));
              },
            },
          ],
        }}
        actions={[
          {
            icon: Edit2,
            title: 'Edit',
            onClick: (row) => window.location.href = `/users/${row.id}`,
          },
          {
            icon: Trash2,
            title: 'Delete',
            variant: 'danger',
            onClick: async (row, { refetch }) => {
              if (!window.confirm('Delete this user? This action cannot be undone.')) return;
              await api.delete(`/auth/users/${row.id}`);
              refetch();
            },
          },
        ]}
        emptyState={{
          message: 'No users found',
        }}
      />
    </div>
  );
}
