import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api, { parseRegions } from '../lib/api';
import { slugify } from '../lib/slugify';
import { toast } from 'sonner';

export default function useContentEditor({ contentType, endpoint, initialData = {} }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id || id === 'new';

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [subscriptionPlans, setSubscriptionPlans] = useState([]);
  const [regions, setRegions] = useState([]);
  const [slugEdited, setSlugEdited] = useState(false);
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [data, setData] = useState({
    template_id: '',
    title: '',
    slug: '',
    status: 'draft',
    content: {},
    access_rules: {
      auth: 'any',
      subscription: 'any',
      plans: []
    },
    ...initialData
  });

  const loadTemplates = useCallback(async () => {
    try {
      const result = await api.get(`/templates/content_type/${contentType}`);
      const list = result.data || [];
      // Filter out templates with no regions
      const filtered = list.filter(t => parseRegions(t.regions).length > 0);
      setTemplates(filtered);
    } catch (err) {
      console.error('Failed to load templates:', err);
    }
  }, [contentType]);

  const loadSubscriptionPlans = useCallback(async () => {
    try {
      const result = await api.get('/subscription-plans');
      setSubscriptionPlans(result.data || []);
    } catch (err) {
      console.error('Failed to load subscription plans:', err);
    }
  }, []);

  const loadItem = useCallback(async () => {
    if (isNew) return;
    try {
      setLoading(true);
      const result = await api.get(`${endpoint}/${id}`);
      
      // Merge with initial data structure
      const merged = {
        ...data,
        ...result,
        content: result.content || {},
        access_rules: {
          auth: result.access_rules?.auth || 'any',
          subscription: result.access_rules?.subscription || 'any',
          plans: result.access_rules?.plans || []
        }
      };
      
      setData(merged);
      setRegions(parseRegions(result.regions || result.template_regions));
      setSlugEdited(true);

      if (result.content_id) {
        loadHistory(result.content_id);
      }
    } catch (err) {
      console.error('Failed to load item:', err);
      toast.error('Failed to load item');
    } finally {
      setLoading(false);
    }
  }, [id, endpoint, isNew, data]);

  const loadHistory = async (contentId) => {
    try {
      setLoadingHistory(true);
      const res = await api.get(`/content/${contentId}/history`);
      setHistory(res || []);
    } catch (err) {
      console.error('Failed to load history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const restoreVersion = async (historyId) => {
    if (!confirm('Restore this entire version? Current unsaved changes will be lost.')) return;
    try {
      setSaving(true);
      await api.post(`/content/history/${historyId}/restore`);
      toast.success('Version restored!');
      await loadItem(); // Reload everything
    } catch (err) {
      toast.error('Failed to restore version');
    } finally {
      setSaving(false);
    }
  };

  const partialRestore = ({ content, title, slug }) => {
    setData(prev => {
      const next = { ...prev };
      if (title) next.title = title;
      if (slug) next.slug = slug;
      if (content) {
        next.content = { ...prev.content, ...content };
      }
      return next;
    });
    toast.success('Selected fields brought into editor (unsaved)');
  };

  useEffect(() => {
    loadTemplates();
    loadSubscriptionPlans();
    if (!isNew) {
      loadItem();
    }
  }, [id, contentType, endpoint]); // Removed isNew from deps to avoid extra calls

  // Sync slug from title
  useEffect(() => {
    if (!slugEdited && data.title) {
      setData(prev => ({ ...prev, slug: slugify(prev.title, contentType) }));
    }
  }, [data.title, slugEdited, contentType]);

  const handleFieldChange = (field, value) => {
    setData(prev => ({ ...prev, [field]: value }));
  };

  const handleContentChange = (regionName, value) => {
    setData(prev => ({
      ...prev,
      content: { ...prev.content, [regionName]: value }
    }));
  };

  const handleTemplateChange = (templateId) => {
    const numId = parseInt(templateId);
    const template = templates.find(t => t.id === numId);
    setData(prev => ({ ...prev, template_id: numId }));
    setRegions(parseRegions(template?.regions));
  };

  const handleSave = async (overrideStatus = null) => {
    setSaving(true);
    try {
      const payload = {
        ...data,
        status: overrideStatus || data.status
      };

      if (isNew) {
        const result = await api.post(endpoint, payload);
        toast.success('Created successfully!');
        
        // Refresh history if we have content_id
        if (result.content_id) {
          loadHistory(result.content_id);
        }
        
        navigate(`${endpoint}/${result.id}`, { replace: true });
        return result;
      } else {
        const result = await api.put(`${endpoint}/${id}`, payload);
        toast.success('Saved successfully!');
        if (overrideStatus) {
            setData(prev => ({ ...prev, status: overrideStatus }));
        }
        
        // Refresh history
        if (data.content_id) {
          loadHistory(data.content_id);
        }
        
        return payload;
      }
    } catch (err) {
      toast.error(err.message || 'Failed to save');
      throw err;
    } finally {
      setSaving(false);
    }
  };

  const syncTemplates = async () => {
    try {
      await api.post('/templates/sync');
      await loadTemplates();
      toast.success('Templates synced from filesystem!');
    } catch (err) {
      toast.error('Failed to sync templates');
    }
  };

  return {
    id,
    isNew,
    data,
    setData,
    templates,
    subscriptionPlans,
    regions,
    loading,
    saving,
    slugEdited,
    setSlugEdited,
    history,
    loadingHistory,
    handleFieldChange,
    handleContentChange,
    handleTemplateChange,
    handleSave,
    syncTemplates,
    restoreVersion,
    partialRestore
  };
}
