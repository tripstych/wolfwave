import { Link, useNavigate } from 'react-router-dom';
import { Plus, Edit, Copy, Trash2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import DataTable from '../components/DataTable';
import { getSiteUrl } from '../lib/urls';
import api from '../lib/api';
import { useTranslation } from '../context/TranslationContext';

export default function Pages() {
  const navigate = useNavigate();
  const { _ } = useTranslation();

  const columns = [
    {
      key: 'title',
      label: _('pages.title', 'Title'),
      render: (value, row) => (
        <div className="flex flex-col">
          <button 
            onClick={() => navigate(`/pages/${row.id}`)}
            className="text-left font-medium text-primary-600 hover:text-primary-900 hover:underline transition-colors"
          >
            {value || _('common.untitled_parens', '(Untitled)')}
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
      label: _('pages.template', 'Template'),
      render: (value) => value || '-',
    },
    {
      key: 'status',
      label: _('pages.status', 'Status'),
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
          {_( `status.${value}`, value)}
        </span>
      ),
    },
    {
      key: 'updated_at',
      label: _('pages.updated', 'Updated'),
      render: (value) => new Date(value).toLocaleDateString(),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{_('pages.list_title', 'Pages')}</h1>
        <Link to="/pages/new" id="admin-pages-new-page-button" className="btn btn-primary">
          <Plus className="w-4 h-4 mr-2" />
          {_('pages.new_page', 'New Page')}
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
              label: _('common.delete_selected', 'Delete Selected'),
              icon: Trash2,
              variant: 'danger',
              onAction: async (ids, { refetch }) => {
                const countStr = ids === 'all' ? _('common.all_results', 'all results') : `${ids.length} ${_('pages.count', 'page(s)')}`;
                if (!confirm(`${_('common.confirm_delete', 'Delete')} ${countStr}? ${_('common.cannot_be_undone', 'This cannot be undone.')}`)) return;
                try {
                  await api.delete('/pages/bulk', { ids });
                  toast.success(`${_('common.deleted', 'Deleted')} ${countStr}`);
                  refetch();
                } catch (err) {
                  toast.error(_('pages.error.bulk_delete', 'Failed to delete some pages'));
                }
              },
            },
          ],
        }}
        search={{
          enabled: true,
          placeholder: _('pages.search_placeholder', 'Search pages...'),
          fields: ['title', 'slug'],
        }}
        filters={[
          {
            type: 'select',
            key: 'status',
            options: [
              { value: '', label: _('pages.filter.all_status', 'All Status') },
              { value: 'published', label: _('status.published', 'Published') },
              { value: 'draft', label: _('status.draft', 'Draft') },
              { value: 'archived', label: _('status.archived', 'Archived') },
            ],
          },
        ]}
        actions={[
          {
            icon: Edit,
            title: _('common.edit', 'Edit'),
            onClick: (row) => navigate(`/pages/${row.id}`),
          },
          {
            icon: Copy,
            title: _('common.duplicate', 'Duplicate'),
            onClick: async (row, { refetch }) => {
              try {
                const result = await api.post(`/pages/${row.id}/duplicate`);
                toast.success(_('pages.success.duplicated', 'Page duplicated'));
                navigate(`/pages/${result.id}`);
              } catch (err) {
                toast.error(_('pages.error.duplicate', 'Failed to duplicate page'));
              }
            },
          },
          {
            icon: ExternalLink,
            title: _('pages.view_page', 'View Page'),
            show: (row) => row.status === 'published',
            onClick: (row) => window.open(getSiteUrl(row.slug), '_blank'),
          },
          {
            icon: Trash2,
            title: _('common.delete', 'Delete'),
            variant: 'danger',
            onClick: async (row, { refetch }) => {
              if (!confirm(_('pages.confirm_delete_single', 'Are you sure you want to delete this page?'))) return;
              try {
                await api.delete(`/pages/${row.id}`);
                toast.success(_('pages.success.deleted', 'Page deleted'));
                refetch();
              } catch (err) {
                toast.error(_('pages.error.delete', 'Failed to delete page'));
              }
            },
          },
        ]}
        emptyState={{
          message: _('pages.empty_message', 'No pages yet. Create your first page!'),
          hint: _('pages.empty_hint', 'Get started by creating your first page.'),
        }}
      />
    </div>
  );
}
