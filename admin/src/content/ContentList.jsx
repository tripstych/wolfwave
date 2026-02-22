import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Plus, Edit, Trash2 } from 'lucide-react';
import DataTable from '../components/DataTable';
import api from '../lib/api';

export default function ContentList() {
  const { contentType: contentTypeName } = useParams();
  const [contentType, setContentType] = useState(null);

  const endpoint = contentTypeName === 'blocks' ? '/blocks' : '/pages';

  useEffect(() => {
    api.get(`/content-types/${contentTypeName}`)
      .then(setContentType)
      .catch(err => console.error('Failed to load content type:', err));
  }, [contentTypeName]);

  if (!contentType) {
    return <div>Loading...</div>;
  }

  const columns = [
    {
      key: 'title',
      label: 'Title',
      render: (value, row) => (
        <div>
          <div className="font-medium">{value || row.name}</div>
          <div className="text-sm text-gray-500">{row.slug}</div>
        </div>
      ),
    },
    {
      key: 'template_name',
      label: 'Template',
    },
    ...(contentType.has_status ? [{
      key: 'status',
      label: 'Status',
      render: (value) => (
        <span className={`px-2 py-1 text-xs rounded-full ${
          value === 'published' ? 'bg-green-100 text-green-800' :
          value === 'draft' ? 'bg-yellow-100 text-yellow-800' :
          'bg-gray-100 text-gray-800'
        }`}>
          {value}
        </span>
      ),
    }] : []),
    {
      key: 'updated_at',
      label: 'Updated',
      render: (value) => new Date(value).toLocaleDateString(),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{contentType.plural_label}</h1>
        <Link to={`/${contentTypeName}/new`} className="btn btn-primary">
          <Plus className="w-4 h-4 mr-2" />
          New {contentType.label}
        </Link>
      </div>

      <DataTable
        endpoint={endpoint}
        queryParams={{ content_type: contentTypeName }}
        pagination={{ mode: 'server' }}
        columns={columns}
        search={{
          enabled: true,
          placeholder: 'Search...',
          fields: ['title', 'name', 'slug'],
        }}
        selection={{
          enabled: true,
          bulkActions: [
            {
              label: 'Delete Selected',
              icon: Trash2,
              variant: 'danger',
              onAction: async (ids, { refetch }) => {
                const countStr = ids === 'all' ? 'all results' : `${ids.length} item(s)`;
                if (!window.confirm(`Delete ${countStr}? This cannot be undone.`)) return;
                try {
                  await api.delete(`${endpoint}/bulk`, { ids });
                  refetch();
                } catch (err) {
                  alert('Failed to delete some items: ' + err.message);
                }
              },
            },
          ],
        }}
        filters={contentType.has_status ? [
          {
            type: 'select',
            key: 'status',
            options: [
              { value: '', label: 'All Status' },
              { value: 'draft', label: 'Draft' },
              { value: 'published', label: 'Published' },
              { value: 'archived', label: 'Archived' },
            ],
          },
        ] : []}
        actions={[
          {
            icon: Edit,
            title: 'Edit',
            onClick: (row) => window.location.href = `/${contentTypeName}/${row.id}`,
          },
          {
            icon: Trash2,
            title: 'Delete',
            variant: 'danger',
            onClick: async (row, { refetch }) => {
              if (!confirm(`Delete this ${contentType.label}?`)) return;
              try {
                await api.delete(`${endpoint}/${row.id}`);
                refetch();
              } catch {
                alert('Failed to delete');
              }
            },
          },
        ]}
        emptyState={{
          message: `No ${contentType.plural_label?.toLowerCase()} found.`,
        }}
      />
    </div>
  );
}
