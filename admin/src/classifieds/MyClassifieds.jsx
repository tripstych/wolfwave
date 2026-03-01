import { useState, useEffect } from 'react';
import api from '../lib/api';
import { toast } from 'sonner';
import { Plus, Edit2, Trash2, Tag, CheckCircle, Clock, XCircle, Heart, X, Image as ImageIcon, User, MapPin } from 'lucide-react';
import { useTranslation } from '../context/TranslationContext';

export default function MyClassifieds() {
  const { _ } = useTranslation();

  const STATUS_BADGES = {
    pending_review: { icon: Clock, label: _('status.pending_review', 'Pending Review'), className: 'bg-yellow-100 text-yellow-700' },
    approved: { icon: CheckCircle, label: _('status.approved', 'Active'), className: 'bg-green-100 text-green-700' },
    rejected: { icon: XCircle, label: _('status.rejected', 'Rejected'), className: 'bg-red-100 text-red-700' },
    expired: { icon: Clock, label: _('status.expired', 'Expired'), className: 'bg-gray-100 text-gray-500' },
    paused: { icon: Clock, label: _('status.paused', 'Paused'), className: 'bg-orange-100 text-orange-700' },
  };

  const RELATIONSHIP_STATUS_OPTIONS = [
    { value: 'single', label: _('relationship.single', 'Single') },
    { value: 'dating', label: _('relationship.dating', 'Dating') },
    { value: 'open_relationship', label: _('relationship.open_relationship', 'Open Relationship') },
    { value: 'complicated', label: _('relationship.complicated', 'It\'s Complicated') },
    { value: 'prefer_not_to_say', label: _('relationship.prefer_not_to_say', 'Prefer Not to Say') },
  ];

  const emptyForm = {
    title: '', description: '', category_id: '', location: '', contact_info: '', images: [],
  };

  const [ads, setAds] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [submitting, setSubmitting] = useState(false);
  const [imageUrl, setImageUrl] = useState('');

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [adsData, catsData] = await Promise.all([
        api.get('/classifieds/my-ads'),
        api.get('/classifieds/categories'),
      ]);
      setAds(adsData || []);
      setCategories(catsData || []);
    } catch (err) {
      if (err.response?.status === 403) {
        toast.error(_('classifieds.error.subscription_required', 'Active subscription required to access classifieds'));
      } else {
        toast.error(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const openNewForm = () => {
    setForm({ ...emptyForm });
    setEditingId(null);
    setShowForm(true);
  };

  const openEditForm = (ad) => {
    setForm({
      title: ad.title || '',
      description: ad.description || '',
      category_id: ad.category_id ? String(ad.category_id) : '',
      location: ad.location || '',
      contact_info: ad.contact_info || '',
      images: ad.images || [],
    });
    setEditingId(ad.id);
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return toast.error(_('classifieds.error.title_required', 'Title is required'));
    setSubmitting(true);

    const payload = {
      ...form,
      category_id: form.category_id ? parseInt(form.category_id) : null,
    };

    try {
      let result;
      if (editingId) {
        result = await api.put(`/classifieds/${editingId}`, payload);
      } else {
        result = await api.post('/classifieds', payload);
      }

      if (result.moderation && !result.moderation.approved) {
        toast(_('classifieds.success.submitted', 'Ad submitted for review'), { description: result.moderation.reason });
      } else {
        toast.success(editingId ? _('classifieds.success.updated', 'Ad updated') : _('classifieds.success.posted', 'Ad posted!'));
      }

      setShowForm(false);
      setEditingId(null);
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm(_('classifieds.confirm_delete', 'Delete this ad?'))) return;
    try {
      await api.delete(`/classifieds/${id}`);
      toast.success(_('classifieds.success.deleted', 'Ad deleted'));
      setAds(ads.filter(a => a.id !== id));
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleMarkSold = async (id) => {
    try {
      await api.post(`/classifieds/${id}/mark-sold`);
      toast.success(_('classifieds.success.sold', 'Marked as sold'));
      loadData();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const addImage = () => {
    if (!imageUrl.trim()) return;
    setForm({ ...form, images: [...form.images, imageUrl.trim()] });
    setImageUrl('');
  };

  const removeImage = (index) => {
    setForm({ ...form, images: form.images.filter((_, i) => i !== index) });
  };

  // Flatten categories for select
  const flatCategories = [];
  categories.forEach(cat => {
    flatCategories.push(cat);
    (cat.children || []).forEach(child => flatCategories.push({ ...child, name: `  ${child.name}` }));
  });

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{_('classifieds.my_ads_title', 'My Classified Ads')}</h1>
          <p className="text-sm text-gray-500 mt-1">{ads.length} {_('classifieds.ads_count', 'ad(s)')}</p>
        </div>
        <button onClick={openNewForm} className="btn btn-primary">
          <Plus className="w-4 h-4 mr-2" /> {_('classifieds.post_new', 'Post New Ad')}
        </button>
      </div>

      {/* Post / Edit Form */}
      {showForm && (
        <div className="card p-6 space-y-4 ring-2 ring-primary-200">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">{editingId ? _('classifieds.edit_ad', 'Edit Ad') : _('classifieds.post_new_title', 'Post New Ad')}</h2>
            <button onClick={() => { setShowForm(false); setEditingId(null); }} className="text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">{_('common.title', 'Title')} *</label>
              <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="input" placeholder={_('classifieds.form.title_placeholder', "What's your ad about?")} />
            </div>

            <div>
              <label className="label">{_('common.description', 'Description')}</label>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input" rows={4} placeholder={_('classifieds.form.desc_placeholder', "Details about what you're offering or looking for...")} />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div>
                <label className="label">{_('common.category', 'Category')}</label>
                <select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })} className="input">
                  <option value="">{_('classifieds.no_category', 'No Category')}</option>
                  {flatCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">{_('classifieds.location', 'Location')}</label>
                <input type="text" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="input" placeholder={_('classifieds.location_placeholder', "City, Area")} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">{_('classifieds.contact_info', 'Contact Info')}</label>
                <input type="text" value={form.contact_info} onChange={(e) => setForm({ ...form, contact_info: e.target.value })} className="input" placeholder="Email or phone" />
              </div>
            </div>

            {/* Images */}
            <div>
              <label className="label">{_('common.images', 'Images')}</label>
              <div className="flex gap-2 mb-2">
                <input type="url" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addImage())} className="input flex-1" placeholder={_('classifieds.form.image_placeholder', "Paste image URL...")} />
                <button type="button" onClick={addImage} className="btn btn-secondary">
                  <ImageIcon className="w-4 h-4" />
                </button>
              </div>
              {form.images.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {form.images.map((img, i) => (
                    <div key={i} className="relative group">
                      <img src={img} alt="" className="w-20 h-20 object-cover rounded border" />
                      <button type="button" onClick={() => removeImage(i)} className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <button type="submit" disabled={submitting} className="btn btn-primary">
                {submitting ? _('common.submitting', 'Submitting...') : editingId ? _('classifieds.update_ad', 'Update Ad') : _('classifieds.post_ad', 'Post Ad')}
              </button>
              <button type="button" onClick={() => { setShowForm(false); setEditingId(null); }} className="btn btn-secondary">{_('common.cancel', 'Cancel')}</button>
            </div>
          </form>
        </div>
      )}

      {/* Ads List */}
      {ads.length === 0 && !showForm ? (
        <div className="text-center py-16">
          <Tag className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 mb-4">{_('classifieds.empty_my_ads', "You haven't posted any classified ads yet.")}</p>
          <button onClick={openNewForm} className="btn btn-primary">
            <Plus className="w-4 h-4 mr-2" /> {_('classifieds.post_first', 'Post Your First Ad')}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {ads.map(ad => {
            const badge = STATUS_BADGES[ad.status] || STATUS_BADGES.pending_review;
            const BadgeIcon = badge.icon;
            return (
              <div key={ad.id} className="card p-4">
                <div className="flex gap-4">
                  {ad.images?.[0] && (
                    <img src={ad.images[0]} alt="" className="w-24 h-24 object-cover rounded-lg flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-medium text-gray-900">{ad.title}</h3>
                        <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                          {ad.category && <span>{ad.category.name}</span>}
                          {ad.location && <span>{ad.location}</span>}
                        </div>
                      </div>
                      <span className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full whitespace-nowrap ${badge.className}`}>
                        <BadgeIcon className="w-3 h-3" /> {badge.label}
                      </span>
                    </div>

                    {ad.status === 'rejected' && ad.rejection_reason && (
                      <p className="text-xs text-red-500 mt-1">{_('common.reason', 'Reason')}: {ad.rejection_reason}</p>
                    )}

                    <div className="flex items-center gap-2 mt-3">
                      {ad.status === 'approved' && (
                        <button onClick={() => handleMarkSold(ad.id)} className="text-xs btn btn-secondary py-1 px-2">
                          <ShoppingBag className="w-3 h-3 mr-1" /> {_('classifieds.mark_sold', 'Mark Sold')}
                        </button>
                      )}
                      {(ad.status === 'approved' || ad.status === 'pending_review' || ad.status === 'rejected') && (
                        <button onClick={() => openEditForm(ad)} className="text-xs btn btn-secondary py-1 px-2">
                          <Edit2 className="w-3 h-3 mr-1" /> {_('common.edit', 'Edit')}
                        </button>
                      )}
                      <button onClick={() => handleDelete(ad.id)} className="text-xs btn btn-secondary py-1 px-2 text-red-500">
                        <Trash2 className="w-3 h-3 mr-1" /> {_('common.delete', 'Delete')}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
