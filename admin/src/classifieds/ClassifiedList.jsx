import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { toast } from 'sonner';
import { Search, Check, X, Eye, Filter } from 'lucide-react';

const STATUS_COLORS = {
  pending_review: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  expired: 'bg-gray-100 text-gray-500',
  sold: 'bg-blue-100 text-blue-700',
};

const STATUS_LABELS = {
  pending_review: 'Pending',
  approved: 'Active',
  rejected: 'Rejected',
  expired: 'Expired',
  sold: 'Sold',
};

export default function ClassifiedList() {
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
      toast.success('Ad approved');
      loadAds();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleReject = async (id) => {
    const reason = prompt('Rejection reason:');
    if (reason === null) return;
    try {
      await api.post(`/classifieds/admin/${id}/reject`, { reason });
      toast.success('Ad rejected');
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
          <h1 className="text-2xl font-bold text-gray-900">Classified Ads</h1>
          <p className="text-sm text-gray-500 mt-1">{total} total ads{pendingCount > 0 && ` — ${pendingCount} pending review`}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <form onSubmit={handleSearch} className="flex gap-2 flex-1 min-w-[200px]">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input flex-1"
            placeholder="Search ads..."
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
          <option value="">All Statuses</option>
          <option value="pending_review">Pending Review</option>
          <option value="approved">Active</option>
          <option value="rejected">Rejected</option>
          <option value="expired">Expired</option>
          <option value="sold">Sold</option>
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : ads.length === 0 ? (
        <div className="text-center py-12 text-gray-500">No classified ads found</div>
      ) : (
        <div className="card overflow-hidden">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left p-3 font-medium text-gray-600">Ad</th>
                <th className="text-left p-3 font-medium text-gray-600">Customer</th>
                <th className="text-left p-3 font-medium text-gray-600">Category</th>
                <th className="text-right p-3 font-medium text-gray-600">Price</th>
                <th className="text-left p-3 font-medium text-gray-600">Status</th>
                <th className="text-left p-3 font-medium text-gray-600">Date</th>
                <th className="text-right p-3 font-medium text-gray-600">Actions</th>
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
                          <p className="text-xs text-orange-500 mt-0.5">Flags: {ad.moderation_flags.join(', ')}</p>
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
                          <button onClick={() => handleApprove(ad.id)} className="p-1.5 text-green-500 hover:text-green-700 rounded" title="Approve">
                            <Check className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleReject(ad.id)} className="p-1.5 text-red-500 hover:text-red-700 rounded" title="Reject">
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
