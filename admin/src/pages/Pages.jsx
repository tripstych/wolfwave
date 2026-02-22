import { Link, useNavigate } from 'react-router-dom';
import { Plus, Edit, Copy, Trash2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import DataTable from '../components/DataTable';
import { getSiteUrl } from '../lib/urls';
import api from '../lib/api';

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
        pagination={{ mode: 'server' }}
        columns={columns}
        selection={{
          enabled: true,
          bulkActions: [
            {
              label: 'Delete Selected',
              icon: Trash2,
              variant: 'danger',
              onAction: async (ids, { refetch }) => {
                const countStr = ids === 'all' ? 'all results' : `${ids.length} page(s)`;
                if (!confirm(`Delete ${countStr}? This cannot be undone.`)) return;
                try {
                  await api.delete('/pages/bulk', { ids });
                  toast.success(`Deleted ${countStr}`);
                  refetch();
                } catch (err) {
                  toast.error('Failed to delete some pages');
                }
              },
            },
          ],
        }}
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
                const result = await api.post(`/pages/${row.id}/duplicate`);
                toast.success('Page duplicated');
                navigate(`/pages/${result.id}`);
              } catch (err) {
                toast.error('Failed to duplicate page');
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
                await api.delete(`/pages/${row.id}`);
                toast.success('Page deleted');
                refetch();
              } catch (err) {
                toast.error('Failed to delete page');
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
