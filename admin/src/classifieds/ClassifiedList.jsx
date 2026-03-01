import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { toast } from 'sonner';
import { Search, Check, X, Eye, Filter, Settings } from 'lucide-react';
import { useTranslation } from '../context/TranslationContext';

export default function ClassifiedList() {
  const { _ } = useTranslation();

  const STATUS_COLORS = {
    pending_review: 'bg-yellow-100 text-yellow-700',
    approved: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
    expired: 'bg-gray-100 text-gray-500',
    sold: 'bg-blue-100 text-blue-700',
  };

  const STATUS_LABELS = {
    pending_review: _('status.pending_review', 'Pending'),
    approved: _('status.approved', 'Active'),
    rejected: _('status.rejected', 'Rejected'),
    expired: _('status.expired', 'Expired'),
    sold: _('status.sold', 'Sold'),
  };

  const [ads, setAds] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => { loadAds(); }, [statusFilter]);

  const loadAds = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (search) params.set('search', search);
      const data = await api.get(`/classifieds/admin/all?${params}`);
      setAds(data.ads || []);
      setTotal(data.total || 0);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id) => {
    try {
      await api.post(`/classifieds/admin/${id}/approve`);
      toast.success(_('classifieds.success.approved', 'Ad approved'));
      loadAds();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleReject = async (id) => {
    const reason = prompt(_('classifieds.prompt.rejection_reason', 'Rejection reason:'));
    if (reason === null) return;
    try {
      await api.post(`/classifieds/admin/${id}/reject`, { reason });
      toast.success(_('classifieds.success.rejected', 'Ad rejected'));
      loadAds();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    loadAds();
  };

  const pendingCount = ads.filter(a => a.status === 'pending_review').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{_('classifieds.list_title', 'Classified Ads')}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {total} {_('classifieds.total_ads', 'total ads')}
            {pendingCount > 0 && ` — ${pendingCount} ${_('classifieds.pending_review', 'pending review')}`}
          </p>
        </div>
        <Link to="/classifieds/settings" className="btn btn-secondary">
          <Settings className="w-4 h-4 mr-2" />
          {_('classifieds.settings', 'Settings')}
        </Link>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <form onSubmit={handleSearch} className="flex gap-2 flex-1 min-w-[200px]">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input flex-1"
            placeholder={_('classifieds.search_placeholder', 'Search ads...')}
          />
          <button type="submit" className="btn btn-secondary">
            <Search className="w-4 h-4" />
          </button>
        </form>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="input w-auto"
        >
          <option value="">{_('classifieds.filter.all_statuses', 'All Statuses')}</option>
          <option value="pending_review">{_('status.pending_review', 'Pending Review')}</option>
          <option value="approved">{_('status.approved', 'Active')}</option>
          <option value="rejected">{_('status.rejected', 'Rejected')}</option>
          <option value="expired">{_('status.expired', 'Expired')}</option>
          <option value="sold">{_('status.sold', 'Sold')}</option>
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : ads.length === 0 ? (
        <div className="text-center py-12 text-gray-500">{_('classifieds.empty_message', 'No classified ads found')}</div>
      ) : (
        <div className="card overflow-hidden">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left p-3 font-medium text-gray-600">{_('classifieds.col.ad', 'Ad')}</th>
                <th className="text-left p-3 font-medium text-gray-600">{_('classifieds.col.customer', 'Customer')}</th>
                <th className="text-left p-3 font-medium text-gray-600">{_('classifieds.col.category', 'Category')}</th>
                <th className="text-right p-3 font-medium text-gray-600">{_('classifieds.col.price', 'Price')}</th>
                <th className="text-left p-3 font-medium text-gray-600">{_('common.status', 'Status')}</th>
                <th className="text-left p-3 font-medium text-gray-600">{_('common.date', 'Date')}</th>
                <th className="text-right p-3 font-medium text-gray-600">{_('common.actions', 'Actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {ads.map(ad => (
                <tr key={ad.id} className="hover:bg-gray-50">
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      {ad.images?.[0] && (
                        <img src={ad.images[0]} alt="" className="w-10 h-10 object-cover rounded" />
                      )}
                      <div>
                        <Link to={`/classifieds/${ad.id}`} className="font-medium text-gray-900 hover:text-primary-600">
                          {ad.title}
                        </Link>
                        {ad.moderation_flags?.length > 0 && (
                          <p className="text-xs text-orange-500 mt-0.5">{_('classifieds.flags', 'Flags')}: {ad.moderation_flags.join(', ')}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="p-3 text-gray-500">
                    {ad.customer?.first_name} {ad.customer?.last_name}
                    <br /><span className="text-xs">{ad.customer?.email}</span>
                  </td>
                  <td className="p-3 text-gray-500">{ad.category?.name || '—'}</td>
                  <td className="p-3 text-right text-gray-900 font-medium">
                    {ad.price != null ? `$${Number(ad.price).toFixed(2)}` : '—'}
                  </td>
                  <td className="p-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[ad.status]}`}>
                      {STATUS_LABELS[ad.status]}
                    </span>
                  </td>
                  <td className="p-3 text-gray-500 text-xs">
                    {new Date(ad.created_at).toLocaleDateString()}
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Link to={`/classifieds/${ad.id}`} className="p-1.5 text-gray-400 hover:text-gray-600 rounded">
                        <Eye className="w-4 h-4" />
                      </Link>
                      {ad.status === 'pending_review' && (
                        <>
                          <button onClick={() => handleApprove(ad.id)} className="p-1.5 text-green-500 hover:text-green-700 rounded" title={_('common.approve', "Approve")}>
                            <Check className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleReject(ad.id)} className="p-1.5 text-red-500 hover:text-red-700 rounded" title={_('common.reject', "Reject")}>
                            <X className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
