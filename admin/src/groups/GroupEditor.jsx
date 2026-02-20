import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Save, ArrowLeft, X, Plus } from 'lucide-react';

export default function GroupEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isNew = !id || id === 'new';

  const [group, setGroup] = useState({
    name: '',
    parent_id: ''
  });

  const [groupContent, setGroupContent] = useState([]);
  const [allContent, setAllContent] = useState([]);
  const [allGroups, setAllGroups] = useState([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [searchContent, setSearchContent] = useState('');

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    try {
      setLoading(true);

      // Load all groups for parent selection
      const groupsRes = await fetch('/api/groups', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (groupsRes.ok) {
        const groupsData = await groupsRes.json();
        setAllGroups(groupsData.data || groupsData || []);
      }

      // Load all content from database
      const contentRes = await fetch('/api/debug/all-content', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (contentRes.ok) {
        const contentData = await contentRes.json();
        setAllContent(contentData.data || contentData || []);
      }

      // Load group if editing
      if (!isNew) {
        const groupRes = await fetch(`/api/groups/${id}`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });

        if (!groupRes.ok) throw new Error('Failed to load group');

        const groupData = await groupRes.json();
        setGroup({
          name: groupData.name,
          parent_id: groupData.parent_id || ''
        });
        setGroupContent(groupData.content || []);
      }

      setError(null);
    } catch (err) {
      setError(err.message);
      console.error('Load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);

      if (!group.name || !group.name.trim()) {
        setError('Group name is required');
        setSaving(false);
        return;
      }

      const method = isNew ? 'POST' : 'PUT';
      const url = isNew ? '/api/groups' : `/api/groups/${id}`;

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          name: group.name,
          parent_id: group.parent_id || null
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save group');
      }

      const saved = await response.json();
      navigate(`/groups/${saved.id}`);
    } catch (err) {
      setError(err.message);
      console.error('Save error:', err);
    } finally {
      setSaving(false);
    }
  };

  const addContentToGroup = async (contentId) => {
    try {
      const response = await fetch(`/api/groups/${id}/content`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ content_id: contentId })
      });

      if (!response.ok) throw new Error('Failed to add content');

      // Reload group to get updated content
      loadData();
      setSearchContent('');
    } catch (err) {
      setError(err.message);
      console.error('Add content error:', err);
    }
  };

  const removeContentFromGroup = async (contentId) => {
    try {
      const response = await fetch(`/api/groups/${id}/content/${contentId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (!response.ok) throw new Error('Failed to remove content');

      setGroupContent(groupContent.filter(c => c.id !== contentId));
    } catch (err) {
      setError(err.message);
      console.error('Remove content error:', err);
    }
  };

  // Filter available content (not already in group, exclude blocks)
  const contentInGroup = new Set(groupContent.map(c => c.id));
  const availableContent = allContent.filter(
    c => c.module !== 'blocks' &&
      !contentInGroup.has(c.id) &&
      (c.title || '').toLowerCase().includes(searchContent.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex justify-between items-center pb-4 border-b border-gray-200 sticky top-16 bg-white z-20 -mx-6 px-6 pt-4">
        <h1 className="text-2xl font-bold text-gray-900">
          {isNew ? 'New Group' : group.name}
        </h1>
        <div className="flex gap-2">
          <button
            className="btn btn-secondary"
            onClick={() => navigate('/groups')}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Saving...' : 'Save Group'}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded text-red-800">
          {error}
        </div>
      )}

      {/* Group Details */}
      <div className="card p-6 space-y-4">
        <h2 className="text-lg font-medium mt-0">Group Details</h2>

        <div>
          <label className="label">Group Name *</label>
          <input
            type="text"
            value={group.name}
            onChange={(e) => setGroup({ ...group, name: e.target.value })}
            className="input"
            placeholder="e.g., Blog Posts, Products, Featured Content"
          />
        </div>

        <div>
          <label className="label">Parent Group (optional)</label>
          <select
            value={group.parent_id}
            onChange={(e) => setGroup({ ...group, parent_id: e.target.value })}
            className="input"
          >
            <option value="">None (top-level group)</option>
            {allGroups
              .filter(g => g.id !== id) // Don't allow self-reference
              .map(g => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
          </select>
          <p className="text-sm text-gray-500 mt-1">
            Make this group a child of another group to create a hierarchy
          </p>
        </div>
      </div>

      {/* Content Management */}
      {!isNew && (
        <div className="space-y-4">
          {/* Add Content */}
          <div className="card p-6">
            <h2 className="text-lg font-medium mt-0 mb-4">
              Add Content
            </h2>

            <div className="mb-4">
              <input
                type="text"
                placeholder="Search content to add..."
                value={searchContent}
                onChange={(e) => setSearchContent(e.target.value)}
                className="input"
              />
            </div>

            {availableContent.length === 0 ? (
              <p className="text-gray-500 italic">
                {searchContent ? 'No matching content found' : 'All content is already in this group'}
              </p>
            ) : (
              <div className="max-h-[300px] overflow-y-auto">
                {availableContent.map(content => (
                  <div
                    key={content.id}
                    className="flex justify-between items-center p-3 border-b border-gray-200"
                  >
                    <div>
                      <div className="font-medium">{content.title || 'Untitled'}</div>
                      <div className="text-sm text-gray-500">
                        {content.slug}
                      </div>
                    </div>
                    <button
                      onClick={() => addContentToGroup(content.id)}
                      className="btn btn-sm btn-primary"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Current Content */}
          <div className="card p-6">
            <h2 className="text-lg font-medium mt-0 mb-4">
              Group Content ({groupContent.length})
            </h2>

            {groupContent.length === 0 ? (
              <p className="text-gray-500 italic">
                No content in this group yet. Add some above.
              </p>
            ) : (
              <div>
                {groupContent.map(content => (
                  <div
                    key={content.id}
                    className="flex justify-between items-center p-3 bg-gray-50 rounded border border-gray-200 mb-2"
                  >
                    <div>
                      <div className="font-medium">{content.title || 'Untitled'}</div>
                      <div className="text-sm text-gray-500">
                        {content.slug}
                      </div>
                    </div>
                    <button
                      onClick={() => removeContentFromGroup(content.id)}
                      className="btn btn-sm btn-ghost text-red-500"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
