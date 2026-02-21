import React, { useMemo } from 'react';
import { X } from 'lucide-react';
import useDataTable from '../hooks/useDataTable';

export default function DataTable({
  endpoint,
  queryParams,
  columns = [],
  pagination = { mode: 'none', pageSize: 20 },
  search: searchConfig,
  filters: filterConfigs = [],
  sorting: sortingConfig,
  selection: selectionConfig,
  actions = [],
  emptyState = {},
  onRowClick,
}) {
  const table = useDataTable({
    endpoint,
    queryParams,
    paginationMode: pagination.mode,
    pageSize: pagination.pageSize || 20,
    defaultSortBy: sortingConfig?.defaultSortBy || null,
    defaultOrder: sortingConfig?.defaultOrder || 'desc',
    searchFields: searchConfig?.fields || [],
  });

  const visibleIds = useMemo(() => table.data.map(row => row.id), [table.data]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => table.isSelected(id));
  const someVisibleSelected = visibleIds.some(id => table.isSelected(id));
  const hasFilters = searchConfig?.enabled || filterConfigs.length > 0 || sortingConfig?.enabled;
  const hasActions = actions.length > 0;
  const hasSelection = selectionConfig?.enabled;

  // --- Filter Bar ---
  const renderFilters = () => {
    if (!hasFilters) return null;
    return (
      <div className="card p-4 space-y-4">
        <div className="flex flex-wrap gap-3">
          {searchConfig?.enabled && (
            <input
              type="text"
              placeholder={searchConfig.placeholder || 'Search...'}
              value={table.search}
              onChange={(e) => table.setSearch(e.target.value)}
              className="input flex-1 min-w-[200px]"
            />
          )}

          {filterConfigs.map(filter => {
            if (filter.type === 'select') {
              return (
                <select
                  key={filter.key}
                  value={table.filters[filter.key] || ''}
                  onChange={(e) => table.setFilter(filter.key, e.target.value)}
                  className="input"
                >
                  {filter.options.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              );
            }

            if (filter.type === 'price-range') {
              return (
                <div key={`${filter.minKey}-${filter.maxKey}`} className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-500">{filter.label || 'Price'}:</span>
                  <input
                    type="number"
                    placeholder="Min"
                    value={table.filters[filter.minKey] || ''}
                    onChange={(e) => table.setFilter(filter.minKey, e.target.value)}
                    className="w-24 px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <span className="text-gray-400">–</span>
                  <input
                    type="number"
                    placeholder="Max"
                    value={table.filters[filter.maxKey] || ''}
                    onChange={(e) => table.setFilter(filter.maxKey, e.target.value)}
                    className="w-24 px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              );
            }

            return null;
          })}

          {sortingConfig?.enabled && (
            <div className="flex items-center gap-2">
              <select
                value={table.sortBy || ''}
                onChange={(e) => table.setSortBy(e.target.value)}
                className="input"
              >
                {sortingConfig.options.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <select
                value={table.order}
                onChange={(e) => table.setOrder(e.target.value)}
                className="input w-24"
              >
                <option value="desc">Desc</option>
                <option value="asc">Asc</option>
              </select>
            </div>
          )}

          {table.hasActiveFilters && (
            <button
              onClick={table.resetFilters}
              className="text-sm text-red-600 hover:underline ml-auto self-center"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>
    );
  };

  // --- Bulk Action Toolbar ---
  const renderToolbar = () => {
    if (!hasSelection || table.selectedIds.size === 0) return null;
    return (
      <div className="bg-primary-50 border border-primary-200 rounded-lg px-4 py-3 flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">
          {table.selectedIds.size} item{table.selectedIds.size !== 1 ? 's' : ''} selected
        </span>
        <div className="flex items-center gap-2">
          {selectionConfig.bulkActions?.map(action => {
            const Icon = action.icon;
            return (
              <button
                key={action.label}
                onClick={async () => {
                  await action.onAction([...table.selectedIds], { refetch: table.refetch });
                  table.clearSelection();
                  table.refetch();
                }}
                className={`btn btn-sm ${action.variant === 'danger' ? 'btn-danger' : 'btn-primary'}`}
              >
                {Icon && <Icon className="w-4 h-4 mr-1" />}
                {action.label}
              </button>
            );
          })}
          <button
            onClick={table.clearSelection}
            className="btn btn-sm btn-ghost"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  };

  // --- Table ---
  const renderTable = () => (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              {hasSelection && (
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    ref={el => { if (el) el.indeterminate = someVisibleSelected && !allVisibleSelected; }}
                    onChange={() => table.toggleAll(visibleIds)}
                    className="rounded border-gray-300"
                  />
                </th>
              )}
              {columns.map(col => (
                <th
                  key={col.key}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider"
                >
                  {col.label}
                </th>
              ))}
              {hasActions && (
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-600 uppercase tracking-wider">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {table.data.map(row => {
              const visibleActions = actions.filter(a => !a.show || a.show(row));
              return (
                <tr
                  key={row.id}
                  className={`border-b border-gray-200 hover:bg-gray-50 transition-colors ${onRowClick ? 'cursor-pointer' : ''}`}
                  onClick={(e) => {
                    if (e.target.closest('button, a, input[type="checkbox"]')) return;
                    onRowClick?.(row);
                  }}
                >
                  {hasSelection && (
                    <td className="px-4 py-4 w-10">
                      <input
                        type="checkbox"
                        checked={table.isSelected(row.id)}
                        onChange={() => table.toggleSelection(row.id)}
                        className="rounded border-gray-300"
                      />
                    </td>
                  )}
                  {columns.map(col => (
                    <td key={col.key} className="px-6 py-4 text-sm text-gray-700">
                      {col.render ? col.render(row[col.key], row) : row[col.key]}
                    </td>
                  ))}
                  {hasActions && (
                    <td className="px-6 py-4 text-sm text-center">
                      <div className="flex items-center justify-center gap-1">
                        {visibleActions.map((action, i) => {
                          const Icon = action.icon;
                          const variantClass =
                            action.variant === 'danger' ? 'hover:bg-red-50 text-red-600' :
                            action.variant === 'blue' ? 'hover:bg-blue-50 text-blue-600' :
                            'hover:bg-gray-100 text-gray-600';
                          return (
                            <button
                              key={i}
                              onClick={() => action.onClick(row, { refetch: table.refetch })}
                              className={`p-2 rounded-lg transition-colors ${variantClass}`}
                              title={action.title}
                            >
                              {Icon ? <Icon className="w-4 h-4" /> : <span className="text-sm font-medium">{action.title}</span>}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  // --- Pagination ---
  const renderPagination = () => {
    if (pagination.mode === 'none' || (table.totalPages <= 1 && table.total <= table.pageSize)) return null;
    
    const start = table.total === 0 ? 0 : (table.page - 1) * table.pageSize + 1;
    const end = Math.min(table.total, table.page * table.pageSize);

    return (
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 py-4 px-2">
        <div className="text-sm text-gray-500 order-2 sm:order-1">
          Showing <span className="font-medium text-gray-900">{start}</span> to <span className="font-medium text-gray-900">{end}</span> of <span className="font-medium text-gray-900">{table.total}</span> results
        </div>
        
        <div className="flex items-center justify-center gap-1 order-1 sm:order-2">
          <button
            disabled={table.page === 1}
            onClick={() => table.setPage(table.page - 1)}
            className="px-3 py-2 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Previous
          </button>

          <div className="hidden sm:flex gap-1">
            {Array.from({ length: Math.min(5, table.totalPages) }, (_, i) => {
              let pageNum;
              if (table.totalPages <= 5) {
                pageNum = i + 1;
              } else if (table.page <= 3) {
                pageNum = i + 1;
              } else if (table.page >= table.totalPages - 2) {
                pageNum = table.totalPages - 4 + i;
              } else {
                pageNum = table.page - 2 + i;
              }
              return (
                <button
                  key={pageNum}
                  onClick={() => table.setPage(pageNum)}
                  className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                    table.page === pageNum
                      ? 'bg-primary-600 text-white border-primary-600'
                      : 'border border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>

          <button
            disabled={table.page === table.totalPages}
            onClick={() => table.setPage(table.page + 1)}
            className="px-3 py-2 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Next
          </button>
        </div>
      </div>
    );
  };

  // --- Main Render ---
  if (table.loading && table.data.length === 0) {
    return (
      <div className="space-y-4">
        {renderFilters()}
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (table.error) {
    return (
      <div className="space-y-4">
        {renderFilters()}
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {table.error}
        </div>
      </div>
    );
  }

  if (table.data.length === 0) {
    const EmptyIcon = emptyState.icon;
    return (
      <div className="space-y-4">
        {renderFilters()}
        <div className="card p-12 text-center">
          {EmptyIcon && <EmptyIcon className="w-12 h-12 mx-auto mb-3 text-gray-300" />}
          <p className="text-gray-600">
            {emptyState.message || 'No items found.'}
          </p>
          {emptyState.hint && (
            <p className="text-sm text-gray-500 mt-2">{emptyState.hint}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {renderFilters()}
      {renderToolbar()}
      {renderTable()}
      {renderPagination()}
    </div>
  );
}
