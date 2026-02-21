import { Link, useNavigate } from 'react-router-dom';
import { Plus, Edit, Copy, Trash2, ExternalLink } from 'lucide-react';
import DataTable from '../components/DataTable';
import { getSiteUrl } from '../lib/urls';

export default function Pages() {
  const navigate = useNavigate();

  const columns = [
    {
      key: 'title',
      label: 'Title',
      render: (value, row) => (
        <div>
          <div className="font-medium text-gray-900">{value || '(Untitled)'}</div>
          <div className="text-sm text-gray-500">{row.slug || '(no slug)'}</div>
        </div>
      ),
    },
    {
      key: 'template_name',
      label: 'Template',
      render: (value) => value || '-',
    },
    {
      key: 'status',
      label: 'Status',
      render: (value) => (
        <span
          className={`px-2 py-1 text-xs font-medium rounded-full ${
            value === 'published'
              ? 'bg-green-100 text-green-700'
              : value === 'draft'
              ? 'bg-yellow-100 text-yellow-700'
              : 'bg-gray-100 text-gray-700'
          }`}
        >
          {value}
        </span>
      ),
    },
    {
      key: 'updated_at',
      label: 'Updated',
      render: (value) => new Date(value).toLocaleDateString(),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Pages</h1>
        <Link to="/pages/new" className="btn btn-primary">
          <Plus className="w-4 h-4 mr-2" />
          New Page
        </Link>
      </div>

      <DataTable
        endpoint="/pages"
        pagination={{ mode: 'server', pageSize: 25 }}
        columns={columns}
        search={{
          enabled: true,
          placeholder: 'Search pages...',
          fields: ['title', 'slug'],
        }}
        filters={[
          {
            type: 'select',
            key: 'status',
            options: [
              { value: '', label: 'All Status' },
              { value: 'published', label: 'Published' },
              { value: 'draft', label: 'Draft' },
              { value: 'archived', label: 'Archived' },
            ],
          },
        ]}
        actions={[
          {
            icon: Edit,
            title: 'Edit',
            onClick: (row) => navigate(`/pages/${row.id}`),
          },
          {
            icon: Copy,
            title: 'Duplicate',
            onClick: async (row, { refetch }) => {
              try {
                const result = await fetch(`/api/pages/${row.id}/duplicate`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                }).then(res => res.json());
                navigate(`/pages/${result.id}`);
              } catch (err) {
                alert('Failed to duplicate page');
              }
            },
          },
          {
            icon: ExternalLink,
            title: 'View Page',
            show: (row) => row.status === 'published',
            onClick: (row) => window.open(getSiteUrl(row.slug), '_blank'),
          },
          {
            icon: Trash2,
            title: 'Delete',
            variant: 'danger',
            onClick: async (row, { refetch }) => {
              if (!confirm('Are you sure you want to delete this page?')) return;
              try {
                await fetch(`/api/pages/${row.id}`, { method: 'DELETE' });
                refetch();
              } catch (err) {
                alert('Failed to delete page');
              }
            },
          },
        ]}
        emptyState={{
          message: 'No pages yet. Create your first page!',
          hint: 'Get started by creating your first page.',
        }}
      />
    </div>
  );
}
