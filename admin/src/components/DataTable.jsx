import React, { useMemo } from 'react';
import { X, Check } from 'lucide-react';
import useDataTable from '../hooks/useDataTable';

export default function DataTable({
  endpoint,
  queryParams,
  columns = [],
  pagination = { mode: 'none' },
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
    pageSize: pagination.pageSize,
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
              id="admin-data-table-search-input"
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
                  id={`admin-data-table-filter-${filter.key}`}
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
                id="admin-data-table-sort-select"
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
              className="text-sm text-red-600 hover:underline ml-auto self-center font-medium"
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
    if (!hasSelection) return null;
    
    const selectedCount = table.selectAllResults ? table.total : table.selectedIds.size;
    if (selectedCount === 0) return null;

    return (
      <div className="bg-primary-50 border border-primary-200 rounded-lg px-4 py-3 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-primary-900">
              {selectedCount} item{selectedCount !== 1 ? 's' : ''} selected
              {table.selectAllResults && <span className="ml-1 text-primary-600 font-normal">(all results across all pages)</span>}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {selectionConfig.bulkActions?.map(action => {
              const Icon = action.icon;
              return (
                <button
                  key={action.label}
                  onClick={async () => {
                    const ids = table.selectAllResults ? 'all' : [...table.selectedIds];
                    await action.onAction(ids, { refetch: table.refetch });
                    table.clearSelection();
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
              className="p-1 hover:bg-primary-100 rounded-full text-primary-600"
              title="Clear selection"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        
        {allVisibleSelected && !table.selectAllResults && table.total > table.data.length && (
          <div className="text-xs text-primary-700 border-t border-primary-100 pt-2 flex items-center gap-2">
            All {table.data.length} items on this page are selected. 
            <button 
              onClick={() => table.toggleAllResults(true)}
              className="font-bold underline hover:text-primary-900"
            >
              Select all {table.total} results
            </button>
          </div>
        )}

        {table.selectAllResults && (
            <div className="text-xs text-primary-700 border-t border-primary-100 pt-2 flex items-center gap-2">
                <Check className="w-3 h-3" />
                All {table.total} results are selected.
                <button 
                  onClick={() => table.clearSelection()}
                  className="font-bold underline hover:text-primary-900"
                >
                  Clear selection
                </button>
            </div>
        )}
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
                    checked={allVisibleSelected || table.selectAllResults}
                    ref={el => { if (el) el.indeterminate = someVisibleSelected && !allVisibleSelected && !table.selectAllResults; }}
                    onChange={() => table.toggleAll(visibleIds)}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                </th>
              )}
              {columns.map(col => (
                <th
                  key={col.key}
                  className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider"
                >
                  {col.label}
                </th>
              ))}
              {hasActions && (
                <th className="px-6 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {table.data.map(row => {
              const visibleActions = actions.filter(a => !a.show || a.show(row));
              const selected = table.isSelected(row.id);
              return (
                <tr
                  key={row.id}
                  className={`border-b border-gray-200 hover:bg-gray-50 transition-colors ${onRowClick ? 'cursor-pointer' : ''} ${selected ? 'bg-primary-50/30' : ''}`}
                  onClick={(e) => {
                    if (e.target.closest('button, a, input[type="checkbox"]')) return;
                    onRowClick?.(row);
                  }}
                >
                  {hasSelection && (
                    <td className="px-4 py-4 w-10">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => table.toggleSelection(row.id)}
                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
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
                          
                          const href = typeof action.href === 'function' ? action.href(row) : action.href;

                          if (href) {
                            return (
                              <a
                                key={i}
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => {
                                  if (action.onClick) {
                                    e.preventDefault();
                                    action.onClick(row, { refetch: table.refetch });
                                  }
                                }}
                                className={`p-2 rounded-lg transition-colors ${variantClass}`}
                                title={typeof action.title === 'function' ? action.title(row) : action.title}
                              >
                                {Icon ? <Icon className="w-4 h-4" /> : <span className="text-sm font-medium">{typeof action.title === 'function' ? action.title(row) : action.title}</span>}
                              </a>
                            );
                          }

                          return (
                            <button
                              key={i}
                              onClick={() => action.onClick(row, { refetch: table.refetch })}
                              className={`p-2 rounded-lg transition-colors ${variantClass}`}
                              title={typeof action.title === 'function' ? action.title(row) : action.title}
                            >
                              {Icon ? <Icon className="w-4 h-4" /> : <span className="text-sm font-medium">{typeof action.title === 'function' ? action.title(row) : action.title}</span>}
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

  // --- Pagination Controls ---
  const renderPaginationControls = (isTop = false) => {
    if (pagination.mode === 'none') return null;
    
    // Always show summary if we have results, even if totalPages <= 1
    const showSummary = table.total > 0;
    const showControls = table.totalPages > 1;

    if (!showSummary) return null;

    return (
      <div className={`flex flex-col sm:flex-row items-center justify-between gap-4 py-4 px-2 ${isTop ? 'border-b border-gray-200 mb-2' : 'mt-2'}`}>
        <div className="text-sm text-gray-500 order-2 sm:order-1">
          Showing <span className="font-bold text-gray-900">{(table.page - 1) * table.pageSize + 1}</span> to <span className="font-bold text-gray-900">{Math.min(table.total, table.page * table.pageSize)}</span> of <span className="font-bold text-gray-900">{table.total}</span> results
        </div>
        
        {showControls && (
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
                        ? 'bg-primary-600 text-white border-primary-600 shadow-sm'
                        : 'border border-gray-300 hover:bg-gray-50 text-gray-700'
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
        )}
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
          <p className="mt-4 text-gray-600 font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  if (table.error) {
    return (
      <div className="space-y-4">
        {renderFilters()}
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 font-medium">
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
          <p className="text-gray-600 font-medium">
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
      {renderPaginationControls(true)}
      {renderToolbar()}
      {renderTable()}
      {renderPaginationControls(false)}
    </div>
  );
}
