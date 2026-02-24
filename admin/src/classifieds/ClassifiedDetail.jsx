import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { toast } from 'sonner';
import { ArrowLeft, Check, X, AlertTriangle, User, MapPin, Tag, DollarSign } from 'lucide-react';

const STATUS_COLORS = {
  pending_review: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  expired: 'bg-gray-100 text-gray-500',
  sold: 'bg-blue-100 text-blue-700',
};

const CONDITION_LABELS = {
  new_item: 'New',
  used: 'Used',
  refurbished: 'Refurbished',
  na: 'N/A',
};

export default function ClassifiedDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [ad, setAd] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);

  useEffect(() => { loadAd(); }, [id]);

  const loadAd = async () => {
    try {
      const data = await api.get(`/classifieds/admin/${id}`);
      setAd(data);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    try {
      await api.post(`/classifieds/admin/${id}/approve`);
      toast.success('Ad approved');
      loadAd();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleReject = async () => {
    try {
      await api.post(`/classifieds/admin/${id}/reject`, { reason: rejectReason });
      toast.success('Ad rejected');
      setShowRejectForm(false);
      loadAd();
    } catch (err) {
      toast.error(err.message);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!ad) return <div className="text-center py-12 text-gray-500">Ad not found</div>;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <button onClick={() => navigate('/classifieds')} className="flex items-center gap-2 text-gray-500 hover:text-gray-700">
          <ArrowLeft className="w-4 h-4" /> Back to Classifieds
        </button>
        <span className={`text-sm px-3 py-1 rounded-full ${STATUS_COLORS[ad.status]}`}>
          {ad.status.replace('_', ' ')}
        </span>
      </div>

      <div className="card p-6 space-y-4">
        <h1 className="text-2xl font-bold text-gray-900">{ad.title}</h1>

        {/* Meta info */}
        <div className="flex flex-wrap gap-4 text-sm text-gray-500">
          <div className="flex items-center gap-1">
            <User className="w-4 h-4" />
            {ad.customer?.first_name} {ad.customer?.last_name} ({ad.customer?.email})
          </div>
          {ad.category && (
            <div className="flex items-center gap-1">
              <Tag className="w-4 h-4" /> {ad.category.name}
            </div>
          )}
          {ad.location && (
            <div className="flex items-center gap-1">
              <MapPin className="w-4 h-4" /> {ad.location}
            </div>
          )}
          {ad.price != null && (
            <div className="flex items-center gap-1">
              <DollarSign className="w-4 h-4" /> {Number(ad.price).toFixed(2)} {ad.currency}
            </div>
          )}
          {ad.condition && ad.condition !== 'na' && (
            <span>Condition: {CONDITION_LABELS[ad.condition]}</span>
          )}
        </div>

        {/* Images */}
        {ad.images?.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {ad.images.map((img, i) => (
              <img key={i} src={img} alt="" className="w-full h-32 object-cover rounded-lg border border-gray-200" />
            ))}
          </div>
        )}

        {/* Description */}
        {ad.description && (
          <div>
            <h3 className="font-medium text-gray-700 mb-1">Description</h3>
            <div className="prose prose-sm text-gray-600 whitespace-pre-wrap">{ad.description}</div>
          </div>
        )}

        {/* Contact info */}
        {ad.contact_info && (
          <div>
            <h3 className="font-medium text-gray-700 mb-1">Contact Info</h3>
            <p className="text-gray-600">{ad.contact_info}</p>
          </div>
        )}
      </div>

      {/* Moderation */}
      {(ad.moderation_flags?.length > 0 || ad.rejection_reason) && (
        <div className="card p-6 space-y-3 border-orange-200 bg-orange-50/50">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-500" /> Moderation
          </h2>
          {ad.moderation_flags?.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {ad.moderation_flags.map((flag, i) => (
                <span key={i} className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded">{flag}</span>
              ))}
            </div>
          )}
          {ad.rejection_reason && (
            <p className="text-sm text-gray-600"><strong>Reason:</strong> {ad.rejection_reason}</p>
          )}
        </div>
      )}

      {/* Actions */}
      {(ad.status === 'pending_review' || ad.status === 'rejected') && (
        <div className="card p-6 space-y-4">
          <h2 className="font-semibold text-gray-900">Actions</h2>
          <div className="flex gap-3">
            <button onClick={handleApprove} className="btn btn-primary">
              <Check className="w-4 h-4 mr-2" /> Approve
            </button>
            <button onClick={() => setShowRejectForm(!showRejectForm)} className="btn btn-secondary text-red-600">
              <X className="w-4 h-4 mr-2" /> Reject
            </button>
          </div>
          {showRejectForm && (
            <div className="space-y-3 pt-2">
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="input"
                rows={3}
                placeholder="Reason for rejection..."
              />
              <button onClick={handleReject} className="btn btn-secondary text-red-600">Confirm Rejection</button>
            </div>
          )}
        </div>
      )}

      {/* Timestamps */}
      <div className="text-xs text-gray-400 flex gap-4">
        <span>Created: {new Date(ad.created_at).toLocaleString()}</span>
        <span>Updated: {new Date(ad.updated_at).toLocaleString()}</span>
        {ad.expires_at && <span>Expires: {new Date(ad.expires_at).toLocaleDateString()}</span>}
      </div>
    </div>
  );
}
