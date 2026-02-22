import { useNavigate } from 'react-router-dom';
import { Plus, Edit2, Trash2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import DataTable from '../components/DataTable';
import { getSiteUrl } from '../lib/urls';
import api from '../lib/api';

export default function ProductList() {
  const navigate = useNavigate();

  const columns = [
    {
      key: 'title',
      label: 'Title',
      render: (value, row) => (
        <div className="flex flex-col">
          <button 
            onClick={() => navigate(`/products/${row.id}`)}
            className="text-left font-medium text-primary-600 hover:text-primary-900 hover:underline transition-colors"
          >
            {value || 'Untitled'}
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
      label: 'SKU',
      render: (value) => (
        <code className="bg-gray-100 px-2 py-1 rounded text-xs">{value}</code>
      ),
    },
    {
      key: 'price',
      label: 'Price',
      render: (value) => (
        <span className="font-medium text-gray-900">
          ${parseFloat(value).toFixed(2)}
        </span>
      ),
    },
    {
      key: 'inventory_quantity',
      label: 'Inventory',
      render: (value, row) =>
        row.inventory_tracking ? (
          <span className={value > 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
            {value} in stock
          </span>
        ) : (
          <span className="text-gray-500">Not tracked</span>
        ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (value) => (
        <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
          value === 'active' ? 'bg-green-100 text-green-800' :
          value === 'draft' ? 'bg-yellow-100 text-yellow-800' :
          'bg-gray-100 text-gray-800'
        }`}>
          {value}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Products</h1>
        <button
          onClick={() => navigate('/products/new')}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium transition-colors"
        >
          <Plus className="w-5 h-5" />
          Add Product
        </button>
      </div>

      <DataTable
        endpoint="/products"
        pagination={{ mode: 'server' }}
        columns={columns}
        search={{
          enabled: true,
          placeholder: 'Search by Title or SKU...',
        }}
        filters={[
          {
            type: 'select',
            key: 'status',
            options: [
              { value: '', label: 'All Status' },
              { value: 'draft', label: 'Draft' },
              { value: 'active', label: 'Active' },
              { value: 'archived', label: 'Archived' },
            ],
          },
          {
            type: 'price-range',
            minKey: 'min_price',
            maxKey: 'max_price',
            label: 'Price Range',
          },
        ]}
        sorting={{
          enabled: true,
          defaultSortBy: 'created_at',
          defaultOrder: 'desc',
          options: [
            { value: 'created_at', label: 'Date Created' },
            { value: 'title', label: 'Title' },
            { value: 'price', label: 'Price' },
            { value: 'sku', label: 'SKU' },
            { value: 'inventory_quantity', label: 'Stock Level' },
          ],
        }}
        selection={{
          enabled: true,
          bulkActions: [
            {
              label: 'Delete Selected',
              icon: Trash2,
              variant: 'danger',
              onAction: async (ids, { refetch }) => {
                const countStr = ids === 'all' ? 'all results' : `${ids.length} product(s)`;
                if (!window.confirm(`Delete ${countStr}? This cannot be undone.`)) return;
                try {
                  await api.delete('/products/bulk', { ids });
                  toast.success(`Deleted ${countStr}`);
                  refetch();
                } catch (err) {
                  toast.error('Failed to delete some products');
                }
              },
            },
          ],
        }}
        actions={[
          {
            icon: ExternalLink,
            title: 'View on site',
            variant: 'blue',
            onClick: (row) => window.open(getSiteUrl(row.slug), '_blank'),
            show: (row) => !!row.slug,
          },
          {
            icon: Edit2,
            title: 'Edit',
            onClick: (row) => navigate(`/products/${row.id}`),
          },
          {
            icon: Trash2,
            title: 'Delete',
            variant: 'danger',
            onClick: async (row, { refetch }) => {
              if (!window.confirm('Are you sure you want to delete this product?')) return;
              try {
                await api.delete(`/products/${row.id}`);
                toast.success('Product deleted');
                refetch();
              } catch (err) {
                toast.error('Failed to delete product');
              }
            },
          },
        ]}
        emptyState={{
          message: 'No products found.',
          hint: 'Create your first product!',
        }}
      />
    </div>
  );
}
