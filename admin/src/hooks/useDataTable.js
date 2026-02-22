import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import api from '../lib/api';
import { useSettings } from '../context/SettingsContext';

export default function useDataTable({
  endpoint,
  queryParams = {},
  paginationMode = 'none',
  pageSize: initialPageSize = null,
  defaultSortBy = null,
  defaultOrder = 'desc',
  searchFields = [],
}) {
  const { settings } = useSettings();
  const pageSize = initialPageSize || parseInt(settings.admin_page_size) || 25;

  const [allData, setAllData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filters, setFilters] = useState({});
  const [sortBy, setSortBy] = useState(defaultSortBy);
  const [order, setOrder] = useState(defaultOrder);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [selectAllResults, setSelectAllResults] = useState(false);

  const debounceRef = useRef(null);
  const prevEndpoint = useRef(endpoint);

  // Reset when endpoint changes
  useEffect(() => {
    if (prevEndpoint.current !== endpoint) {
      prevEndpoint.current = endpoint;
      setAllData([]);
      setPage(1);
      setTotal(0);
      setFilters({});
      setSearch('');
      setDebouncedSearch('');
      setSelectedIds(new Set());
      setSelectAllResults(false);
    }
  }, [endpoint]);

  // Debounce search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [search]);

  // Build query string and fetch
  const fetchData = useCallback(async () => {
    if (!endpoint) return;
    try {
      setLoading(true);
      const params = new URLSearchParams();

      // Static query params
      Object.entries(queryParams).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') params.append(k, v);
      });

      // Filters
      Object.entries(filters).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') params.append(k, v);
      });

      if (paginationMode === 'server') {
        // Server-side: send search, sort, pagination as params
        if (debouncedSearch) params.append('search', debouncedSearch);
        if (sortBy) params.append('sort_by', sortBy);
        if (order) params.append('order', order);
        params.append('limit', pageSize);
        params.append('offset', (page - 1) * pageSize);
      }

      const qs = params.toString();
      const url = qs ? `${endpoint}?${qs}` : endpoint;
      const response = await api.get(url);

      if (paginationMode === 'server') {
        setAllData(response.data || []);
        setTotal(response.pagination?.total || 0);
      } else {
        const items = response.data || response;
        setAllData(Array.isArray(items) ? items : []);
        setTotal(Array.isArray(items) ? items.length : 0);
      }

      setError(null);
    } catch (err) {
      setError(err.message || 'Failed to fetch data');
      console.error('useDataTable fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [endpoint, JSON.stringify(queryParams), JSON.stringify(filters), debouncedSearch, sortBy, order, page, pageSize, paginationMode]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Client-side processing (search, sort, paginate)
  const processedData = useMemo(() => {
    if (paginationMode === 'server') return allData;

    let result = [...allData];

    // Client-side search
    if (debouncedSearch && searchFields.length > 0) {
      const term = debouncedSearch.toLowerCase();
      result = result.filter(item =>
        searchFields.some(field => {
          const val = item[field];
          return val && String(val).toLowerCase().includes(term);
        })
      );
    }

    // Client-side sort
    if (sortBy) {
      result.sort((a, b) => {
        const aVal = a[sortBy] ?? '';
        const bVal = b[sortBy] ?? '';
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return order === 'asc' ? aVal - bVal : bVal - aVal;
        }
        const cmp = String(aVal).localeCompare(String(bVal));
        return order === 'asc' ? cmp : -cmp;
      });
    }

    return result;
  }, [allData, debouncedSearch, searchFields, sortBy, order, paginationMode]);

  // Final visible data (with client pagination if needed)
  const data = useMemo(() => {
    if (paginationMode === 'client') {
      const start = (page - 1) * pageSize;
      return processedData.slice(start, start + pageSize);
    }
    return processedData;
  }, [processedData, page, pageSize, paginationMode]);

  const clientTotal = paginationMode !== 'server' ? processedData.length : total;
  const totalPages = paginationMode === 'none' ? 1 : Math.ceil(clientTotal / pageSize);

  // Selection helpers
  const isSelected = useCallback((id) => selectAllResults || selectedIds.has(id), [selectedIds, selectAllResults]);

  const toggleSelection = useCallback((id) => {
    setSelectAllResults(false);
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback((visibleIds) => {
    setSelectAllResults(false);
    setSelectedIds(prev => {
      const allSelected = visibleIds.every(id => prev.has(id));
      const next = new Set(prev);
      if (allSelected) {
        visibleIds.forEach(id => next.delete(id));
      } else {
        visibleIds.forEach(id => next.add(id));
      }
      return next;
    });
  }, []);

  const toggleAllResults = useCallback((value) => {
    setSelectAllResults(value);
    setSelectedIds(new Set());
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setSelectAllResults(false);
  }, []);

  const setFilter = useCallback((key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPage(1);
  }, []);

  const resetFilters = useCallback(() => {
    setFilters({});
    setSearch('');
    setSortBy(defaultSortBy);
    setOrder(defaultOrder);
    setPage(1);
  }, [defaultSortBy, defaultOrder]);

  const hasActiveFilters = search || Object.values(filters).some(v => v !== '' && v != null) ||
    sortBy !== defaultSortBy || order !== defaultOrder;

  return {
    data,
    loading,
    error,
    page,
    setPage,
    pageSize,
    totalPages,
    total: clientTotal,
    search,
    setSearch,
    filters,
    setFilter,
    resetFilters,
    hasActiveFilters,
    sortBy,
    order,
    setSortBy,
    setOrder,
    selectedIds,
    selectAllResults,
    toggleAllResults,
    isSelected,
    toggleSelection,
    toggleAll,
    clearSelection,
    refetch: fetchData,
  };
}
