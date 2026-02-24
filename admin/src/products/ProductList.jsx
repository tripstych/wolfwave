import { useNavigate } from 'react-router-dom';
import { Plus, Edit2, Trash2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import DataTable from '../components/DataTable';
import { getSiteUrl } from '../lib/urls';
import api from '../lib/api';
import { useTranslation } from '../context/TranslationContext';

export default function ProductList() {
  const navigate = useNavigate();
  const { _ } = useTranslation();

  const columns = [
    {
      key: 'image',
      label: _('products.image', 'Image'),
      render: (value) => (
        <div className="w-12 h-12 rounded-lg border bg-gray-50 flex items-center justify-center overflow-hidden">
          {value ? (
            <img src={value} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="text-gray-400 text-[10px] uppercase font-bold">{_('common.no_image', 'No img')}</div>
          )}
        </div>
      ),
    },
    {
      key: 'title',
      label: _('products.title', 'Title'),
      render: (value, row) => (
        <div className="flex flex-col">
          <button 
            onClick={() => navigate(`/products/${row.id}`)}
            className="text-left font-medium text-primary-600 hover:text-primary-900 hover:underline transition-colors"
          >
            {value || _('common.untitled', 'Untitled')}
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
      key: 'sku',
      label: _('products.sku', 'SKU'),
      render: (value) => (
        <code className="bg-gray-100 px-2 py-1 rounded text-xs">{value}</code>
      ),
    },
    {
      key: 'price',
      label: _('products.price', 'Price'),
      render: (value) => (
        <span className="font-medium text-gray-900">
          ${parseFloat(value).toFixed(2)}
        </span>
      ),
    },
    {
      key: 'inventory_quantity',
      label: _('products.inventory', 'Inventory'),
      render: (value, row) =>
        row.inventory_tracking ? (
          <span className={value > 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
            {value} {_('products.in_stock', 'in stock')}
          </span>
        ) : (
          <span className="text-gray-500">{_('products.not_tracked', 'Not tracked')}</span>
        ),
    },
    {
      key: 'status',
      label: _('products.status', 'Status'),
      render: (value) => (
        <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
          value === 'active' ? 'bg-green-100 text-green-800' :
          value === 'draft' ? 'bg-yellow-100 text-yellow-800' :
          'bg-gray-100 text-gray-800'
        }`}>
          {_( `status.${value}`, value)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">{_('products.list_title', 'Products')}</h1>
        <button
          onClick={() => navigate('/products/new')}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium transition-colors"
        >
          <Plus className="w-5 h-5" />
          {_('products.add_product', 'Add Product')}
        </button>
      </div>

      <DataTable
        endpoint="/products"
        pagination={{ mode: 'server' }}
        columns={columns}
        search={{
          enabled: true,
          placeholder: _('products.search_placeholder', 'Search by Title or SKU...'),
        }}
        filters={[
          {
            type: 'select',
            key: 'status',
            options: [
              { value: '', label: _('products.filter.all_status', 'All Status') },
              { value: 'draft', label: _('status.draft', 'Draft') },
              { value: 'active', label: _('status.active', 'Active') },
              { value: 'archived', label: _('status.archived', 'Archived') },
            ],
          },
          {
            type: 'price-range',
            minKey: 'min_price',
            maxKey: 'max_price',
            label: _('products.filter.price_range', 'Price Range'),
          },
        ]}
        sorting={{
          enabled: true,
          defaultSortBy: 'created_at',
          defaultOrder: 'desc',
          options: [
            { value: 'created_at', label: _('sorting.date_created', 'Date Created') },
            { value: 'title', label: _('sorting.title', 'Title') },
            { value: 'price', label: _('sorting.price', 'Price') },
            { value: 'sku', label: _('sorting.sku', 'SKU') },
            { value: 'inventory_quantity', label: _('sorting.stock_level', 'Stock Level') },
          ],
        }}
        selection={{
          enabled: true,
          bulkActions: [
            {
              label: _('common.delete_selected', 'Delete Selected'),
              icon: Trash2,
              variant: 'danger',
              onAction: async (ids, { refetch }) => {
                const countStr = ids === 'all' ? _('common.all_results', 'all results') : `${ids.length} ${_('products.count', 'product(s)')}`;
                if (!window.confirm(`${_('common.confirm_delete', 'Delete')} ${countStr}? ${_('common.cannot_be_undone', 'This cannot be undone.')}`)) return;
                try {
                  await api.delete('/products/bulk', { ids });
                  toast.success(`${_('common.deleted', 'Deleted')} ${countStr}`);
                  refetch();
                } catch (err) {
                  toast.error(_('products.error.bulk_delete', 'Failed to delete some products'));
                }
              },
            },
          ],
        }}
        actions={[
          {
            icon: ExternalLink,
            title: _('common.view_on_site', 'View on site'),
            variant: 'blue',
            onClick: (row) => window.open(getSiteUrl(row.slug), '_blank'),
            show: (row) => !!row.slug,
          },
          {
            icon: Edit2,
            title: _('common.edit', 'Edit'),
            onClick: (row) => navigate(`/products/${row.id}`),
          },
          {
            icon: Trash2,
            title: _('common.delete', 'Delete'),
            variant: 'danger',
            onClick: async (row, { refetch }) => {
              if (!window.confirm(_('products.confirm_delete_single', 'Are you sure you want to delete this product?'))) return;
              try {
                await api.delete(`/products/${row.id}`);
                toast.success(_('products.success.deleted', 'Product deleted'));
                refetch();
              } catch (err) {
                toast.error(_('products.error.delete', 'Failed to delete product'));
              }
            },
          },
        ]}
        emptyState={{
          message: _('products.empty_message', 'No products found.'),
          hint: _('products.empty_hint', 'Create your first product!'),
        }}
      />
    </div>
  );
}
