import React, { useState, useEffect } from 'react';
import { Plus, X } from 'lucide-react';

export default function ContentGroupsWidget({ contentId, onGroupsChange }) {
  const [groups, setGroups] = useState([]);
  const [availableGroups, setAvailableGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    if (contentId) {
      loadContentGroups();
      loadAvailableGroups();
    }
  }, [contentId]);

  const loadContentGroups = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/groups/content/${contentId}/groups`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });

      if (response.ok) {
        const data = await response.json();
        setGroups(data.data || data || []);
      }
    } catch (err) {
      console.error('Error loading content groups:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadAvailableGroups = async () => {
    try {
      const response = await fetch('/api/groups', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });

      if (response.ok) {
        const data = await response.json();
        setAvailableGroups(data.data || data || []);
      }
    } catch (err) {
      console.error('Error loading available groups:', err);
    }
  };

  const addGroupToContent = async (groupId) => {
    try {
      const response = await fetch(`/api/groups/${groupId}/content`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ content_id: contentId })
      });

      if (response.ok) {
        await loadContentGroups();
        setSearchTerm('');
        setShowDropdown(false);
        if (onGroupsChange) onGroupsChange();
      }
    } catch (err) {
      console.error('Error adding group:', err);
    }
  };

  const removeGroupFromContent = async (groupId) => {
    try {
      const response = await fetch(`/api/groups/${groupId}/content/${contentId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });

      if (response.ok) {
        setGroups(groups.filter(g => g.id !== groupId));
        if (onGroupsChange) onGroupsChange();
      }
    } catch (err) {
      console.error('Error removing group:', err);
    }
  };

  // Get groups not already assigned
  const assignedGroupIds = new Set(groups.map(g => g.id));
  const flattenGroups = (groupList) => {
    let result = [];
    for (const group of groupList) {
      result.push(group);
      if (group.children && group.children.length > 0) {
        result = result.concat(flattenGroups(group.children));
      }
    }
    return result;
  };

  const allGroupsFlat = flattenGroups(availableGroups);
  const unassignedGroups = allGroupsFlat.filter(g => !assignedGroupIds.has(g.id));
  const filteredGroups = unassignedGroups.filter(g =>
    g.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!contentId) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center text-gray-500">
        Save content first to add it to groups
      </div>
    );
  }

  return (
    <div className="card p-6">
      <h3 className="mt-0 mb-4 text-lg font-medium">
        Groups
      </h3>

      {/* Current Groups */}
      <div className="mb-6">
        {groups.length === 0 ? (
          <p className="text-gray-400 italic m-0">
            Not in any groups yet
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {groups.map(group => (
              <div
                key={group.id}
                className="inline-flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-full pl-3 pr-2 py-1"
              >
                <span className="text-sm text-blue-800">
                  {group.name}
                </span>
                <button
                  onClick={() => removeGroupFromContent(group.id)}
                  className="text-blue-800 hover:text-blue-900 p-0 flex items-center"
                  title="Remove from group"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Group Dropdown */}
      <div className="relative">
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          className="w-full px-3 py-2 border border-gray-300 rounded bg-white cursor-pointer flex items-center gap-2 text-sm hover:bg-gray-50"
        >
          <Plus className="w-4 h-4" />
          {unassignedGroups.length > 0 ? 'Add to group' : 'All groups assigned'}
        </button>

        {showDropdown && unassignedGroups.length > 0 && (
          <div className="absolute top-full left-0 right-0 bg-white border border-gray-300 rounded mt-1 z-10 shadow-md">
            <input
              type="text"
              placeholder="Search groups..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-2 py-2 border-0 border-b border-gray-200 rounded-t text-sm focus:outline-none"
            />

            <div className="max-h-[250px] overflow-y-auto">
              {filteredGroups.length === 0 ? (
                <div className="p-3 text-gray-400 text-center">
                  No groups found
                </div>
              ) : (
                filteredGroups.map(group => (
                  <button
                    key={group.id}
                    onClick={() => addGroupToContent(group.id)}
                    className="w-full px-3 py-2 border-0 bg-transparent text-left cursor-pointer border-b border-gray-100 text-sm hover:bg-gray-50"
                  >
                    {group.name}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {showDropdown && (
        <div
          onClick={() => setShowDropdown(false)}
          className="fixed inset-0 z-[9]"
        />
      )}
    </div>
  );
}
