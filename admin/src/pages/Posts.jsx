import { Link, useNavigate } from 'react-router-dom';
import { Plus, Edit, Copy, Trash2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import DataTable from '../components/DataTable';
import { getSiteUrl } from '../lib/urls';
import api from '../lib/api';

export default function Posts() {
  const navigate = useNavigate();

  const columns = [
    {
      key: 'title',
      label: 'Title',
      render: (value, row) => (
        <div className="flex flex-col">
          <button 
            onClick={() => navigate(`/posts/${row.id}`)}
            className="text-left font-medium text-primary-600 hover:text-primary-900 hover:underline transition-colors"
          >
            {value || '(Untitled)'}
          </button>
          {row.slug && (
            <a 
              href={getSiteUrl(row.slug)} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-xs text-gray-500 flex items-center gap-1 hover:text-primary-600 mt-0.5 transition-colors group"
            >
              {row.slug}
              <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
            </a>
          )}
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
        <h1 className="text-2xl font-bold text-gray-900">Blog Posts</h1>
        <Link to="/posts/new" id="admin-posts-new-post-button" className="btn btn-primary">
          <Plus className="w-4 h-4 mr-2" />
          New Post
        </Link>
      </div>

      <DataTable
        endpoint="/posts"
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
                const countStr = ids === 'all' ? 'all results' : `${ids.length} post(s)`;
                if (!confirm(`Delete ${countStr}? This cannot be undone.`)) return;
                try {
                  await api.delete('/posts/bulk', { ids });
                  toast.success(`Deleted ${countStr}`);
                  refetch();
                } catch (err) {
                  toast.error('Failed to delete some posts');
                }
              },
            },
          ],
        }}
        search={{
          enabled: true,
          placeholder: 'Search posts...',
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
            onClick: (row) => navigate(`/posts/${row.id}`),
          },
          {
            icon: Copy,
            title: 'Duplicate',
            onClick: async (row, { refetch }) => {
              try {
                const result = await api.post(`/posts/${row.id}/duplicate`);
                toast.success('Post duplicated');
                navigate(`/posts/${result.id}`);
              } catch (err) {
                toast.error('Failed to duplicate post');
              }
            },
          },
          {
            icon: ExternalLink,
            title: 'View Post',
            show: (row) => row.status === 'published',
            onClick: (row) => window.open(getSiteUrl(row.slug), '_blank'),
          },
          {
            icon: Trash2,
            title: 'Delete',
            variant: 'danger',
            onClick: async (row, { refetch }) => {
              if (!confirm('Are you sure you want to delete this post?')) return;
              try {
                await api.delete(`/posts/${row.id}`);
                toast.success('Post deleted');
                refetch();
              } catch (err) {
                toast.error('Failed to delete post');
              }
            },
          },
        ]}
        emptyState={{
          message: 'No posts yet. Create your first post!',
          hint: 'Get started by creating your first blog post.',
        }}
      />
    </div>
  );
}
