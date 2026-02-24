import { useState, useEffect } from 'react';
import api from '../lib/api';
import {
  Plus,
  Trash2,
  Edit,
  GripVertical,
  ChevronRight,
  ChevronDown,
  ExternalLink,
  FileText,
  Link as LinkIcon,
  X,
  Check,
  Menu as MenuIcon,
  ArrowUp,
  ArrowDown,
  AlertCircle,
  Shield,
  LayoutGrid,
  Image,
  PlusCircle
} from 'lucide-react';

export default function Menus() {
  const [menus, setMenus] = useState([]);
  const [selectedMenu, setSelectedMenu] = useState(null);
  const [pages, setPages] = useState([]);
  const [subscriptionPlans, setSubscriptionPlans] = useState([]);
  const [systemRoutes, setSystemRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [showNewItem, setShowNewItem] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [newMenuName, setNewMenuName] = useState('');
  const [expandedItems, setExpandedItems] = useState({});
  const [addingChildTo, setAddingChildTo] = useState(null);
  const [newItem, setNewItem] = useState({
    title: '',
    url: '',
    page_id: null,
    parent_id: null,
    target: '_self',
    linkType: 'page',
    description: '',
    image: '',
    is_mega: false,
    mega_columns: 4,
    css_class: '',
    display_rules: {
      auth: 'all',
      subscription: 'any',
      plans: [],
      urlPattern: ''
    }
  });

  useEffect(() => {
    loadMenus();
    loadPages();
    loadSubscriptionPlans();
    loadSystemRoutes();
  }, []);

  const loadSystemRoutes = async () => {
    try {
      const routes = await api.get('/settings/system-routes');
      setSystemRoutes(routes || []);
    } catch (err) {
      console.error('Failed to load system routes:', err);
    }
  };

  const loadSubscriptionPlans = async () => {
    try {
      const response = await api.get('/subscription-plans');
      setSubscriptionPlans(response.data || []);
    } catch (err) {
      console.error('Failed to load subscription plans:', err);
    }
  };

  const loadMenus = async () => {
    try {
      const response = await api.get('/menus');
      const menusData = response.data || response || [];
      setMenus(menusData);
      if (menusData.length > 0 && !selectedMenu) {
        loadMenu(menusData[0].id);
      }
    } catch (err) {
      console.error('Failed to load menus:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadMenu = async (id) => {
    try {
      const menu = await api.get(`/menus/${id}`);
      setSelectedMenu(menu);
    } catch (err) {
      console.error('Failed to load menu:', err);
    }
  };

  const loadPages = async () => {
    try {
      const response = await api.get('/pages?status=published');
      const pagesData = response.data || response || [];
      setPages(pagesData);
    } catch (err) {
      console.error('Failed to load pages:', err);
    }
  };

  const handleCreateMenu = async () => {
    if (!newMenuName.trim()) return;
    try {
      const menu = await api.post('/menus', { name: newMenuName });
      setMenus([...menus, menu]);
      setSelectedMenu({ ...menu, items: [] });
      setNewMenuName('');
      setShowNewMenu(false);
    } catch (err) {
      alert('Failed to create menu: ' + err.message);
    }
  };

  const handleDeleteMenu = async (id) => {
    if (!confirm('Delete this menu and all its items?')) return;
    try {
      await api.delete(`/menus/${id}`);
      setMenus(menus.filter(m => m.id !== id));
      if (selectedMenu?.id === id) {
        setSelectedMenu(null);
      }
    } catch (err) {
      alert('Failed to delete menu: ' + err.message);
    }
  };

  const getDefaultNewItem = (parentId = null) => ({
    title: '',
    url: '',
    page_id: null,
    parent_id: parentId,
    target: '_self',
    linkType: 'page',
    description: '',
    image: '',
    is_mega: false,
    mega_columns: 4,
    css_class: '',
    display_rules: {
      auth: 'all',
      subscription: 'any',
      plans: [],
      urlPattern: ''
    }
  });

  const handleAddItem = async () => {
    if (!newItem.title.trim()) return;
    try {
      const itemData = {
        title: newItem.title,
        target: newItem.target,
        display_rules: newItem.display_rules,
        parent_id: newItem.parent_id || null,
        description: newItem.description || null,
        image: newItem.image || null,
        is_mega: newItem.is_mega || false,
        mega_columns: newItem.mega_columns || 4,
        css_class: newItem.css_class || null,
        ...(newItem.linkType === 'page'
          ? { page_id: newItem.page_id }
          : { url: newItem.url })
      };
      await api.post(`/menus/${selectedMenu.id}/items`, itemData);
      loadMenu(selectedMenu.id);
      setNewItem(getDefaultNewItem());
      setShowNewItem(false);
      setAddingChildTo(null);
    } catch (err) {
      alert('Failed to add item: ' + err.message);
    }
  };

  const handleUpdateItem = async (item) => {
    try {
      await api.put(`/menus/${selectedMenu.id}/items/${item.id}`, item);
      loadMenu(selectedMenu.id);
      setEditingItem(null);
    } catch (err) {
      alert('Failed to update item: ' + err.message);
    }
  };

  const handleDeleteItem = async (itemId) => {
    if (!confirm('Delete this menu item?')) return;
    try {
      await api.delete(`/menus/${selectedMenu.id}/items/${itemId}`);
      loadMenu(selectedMenu.id);
    } catch (err) {
      alert('Failed to delete item: ' + err.message);
    }
  };

  const handleReorderItem = async (itemId, direction) => {
    try {
      await api.put(`/menus/${selectedMenu.id}/items/${itemId}/reorder`, { direction });
      loadMenu(selectedMenu.id);
    } catch (err) {
      alert('Failed to reorder item: ' + err.message);
    }
  };

  const toggleExpand = (id) => {
    setExpandedItems(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const renderMenuItem = (item, depth = 0) => {
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedItems[item.id];
    const isEditing = editingItem?.id === item.id;

    return (
      <div key={item.id}>
        <div
          className={`flex items-center gap-2 p-3 bg-white border border-gray-200 rounded-lg mb-2 ${
            depth > 0 ? 'ml-8' : ''
          }`}
        >
          <GripVertical className="w-4 h-4 text-gray-400 cursor-move" />
          
          {hasChildren && (
            <button onClick={() => toggleExpand(item.id)} className="p-1">
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-gray-500" />
              ) : (
                <ChevronRight className="w-4 h-4 text-gray-500" />
              )}
            </button>
          )}

          {isEditing ? (
            <div className="flex-1 space-y-3">
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    checked={!editingItem.page_id && !systemRoutes.find(r => r.url === editingItem.url)}
                    onChange={() => setEditingItem({ ...editingItem, page_id: null })}
                  />
                  Custom URL
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    checked={!!editingItem.page_id}
                    onChange={() => setEditingItem({ ...editingItem, url: null, page_id: editingItem.page_id || pages[0]?.id || null })}
                  />
                  Page
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    checked={!editingItem.page_id && !!systemRoutes.find(r => r.url === editingItem.url)}
                    onChange={() => setEditingItem({ ...editingItem, page_id: null, url: systemRoutes[0]?.url })}
                  />
                  System
                </label>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={editingItem.title}
                  onChange={(e) => setEditingItem({ ...editingItem, title: e.target.value })}
                  className="input flex-1"
                  placeholder="Title"
                />
                
                {editingItem.page_id ? (
                  <select
                    value={editingItem.page_id || ''}
                    onChange={(e) => {
                      const pageId = e.target.value || null;
                      setEditingItem({ ...editingItem, page_id: pageId });
                    }}
                    className="input flex-1"
                  >
                    <option value="">Select a page</option>
                    {pages.map(page => (
                      <option key={page.id} value={page.id}>{page.title}</option>
                    ))}
                  </select>
                ) : systemRoutes.find(r => r.url === editingItem.url) ? (
                  <select
                    value={editingItem.url || ''}
                    onChange={(e) => setEditingItem({ ...editingItem, url: e.target.value })}
                    className="input flex-1"
                  >
                    {systemRoutes.map(route => (
                      <option key={route.url} value={route.url}>{route.title}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={editingItem.url || ''}
                    onChange={(e) => setEditingItem({ ...editingItem, url: e.target.value })}
                    className="input flex-1"
                    placeholder="https://..."
                  />
                )}
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-gray-500">Parent Item</label>
                <select
                  value={editingItem.parent_id || ''}
                  onChange={(e) => setEditingItem({ ...editingItem, parent_id: e.target.value ? parseInt(e.target.value) : null })}
                  className="input text-sm py-1"
                >
                  <option value="">None (Top Level)</option>
                  {selectedMenu.items
                    .filter(i => i.id !== item.id) // Can't be own parent
                    .map(i => (
                      <option key={i.id} value={i.id}>{i.title}</option>
                    ))
                  }
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-gray-500">Authentication</label>
                  <select
                    value={editingItem.display_rules?.auth || 'all'}
                    onChange={(e) => setEditingItem({ 
                      ...editingItem, 
                      display_rules: { ...editingItem.display_rules, auth: e.target.value } 
                    })}
                    className="input text-sm py-1"
                  >
                    <option value="all">Everyone</option>
                    <option value="logged_in">Logged In Only</option>
                    <option value="logged_out">Logged Out Only</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-gray-500">Subscription</label>
                  <select
                    value={editingItem.display_rules?.subscription || 'any'}
                    onChange={(e) => setEditingItem({ 
                      ...editingItem, 
                      display_rules: { 
                        ...editingItem.display_rules, 
                        subscription: e.target.value,
                        plans: e.target.value === 'any' ? [] : (editingItem.display_rules.plans || [])
                      } 
                    })}
                    className="input text-sm py-1"
                  >
                    <option value="any">Any Status</option>
                    <option value="required">Subscribed Only</option>
                    <option value="none">Non-Subscribers Only</option>
                  </select>
                </div>
              </div>

              {editingItem.display_rules?.subscription === 'required' && (
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-gray-500">Required Tiers (Optional)</label>
                  <div className="flex flex-wrap gap-2 p-2 border border-gray-200 rounded-md bg-white">
                    {subscriptionPlans.map(plan => (
                      <label key={plan.id} className="flex items-center gap-1 text-[10px] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={(editingItem.display_rules?.plans || []).includes(plan.slug)}
                          onChange={(e) => {
                            const currentPlans = editingItem.display_rules?.plans || [];
                            const newPlans = e.target.checked
                              ? [...currentPlans, plan.slug]
                              : currentPlans.filter(s => s !== plan.slug);
                            setEditingItem({
                              ...editingItem,
                              display_rules: { ...editingItem.display_rules, plans: newPlans }
                            });
                          }}
                        />
                        {plan.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-gray-500">URL Pattern (Regex)</label>
                <input
                  type="text"
                  value={editingItem.display_rules?.urlPattern || ''}
                  onChange={(e) => setEditingItem({ 
                    ...editingItem, 
                    display_rules: { ...editingItem.display_rules, urlPattern: e.target.value } 
                  })}
                  className="input text-sm py-1"
                  placeholder="/shop/*"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-gray-500">Description</label>
                <input
                  type="text"
                  value={editingItem.description || ''}
                  onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })}
                  className="input text-sm py-1"
                  placeholder="Optional description for megamenu display"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-gray-500">Image URL</label>
                  <input
                    type="text"
                    value={editingItem.image || ''}
                    onChange={(e) => setEditingItem({ ...editingItem, image: e.target.value })}
                    className="input text-sm py-1"
                    placeholder="/uploads/image.jpg"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-gray-500">CSS Class</label>
                  <input
                    type="text"
                    value={editingItem.css_class || ''}
                    onChange={(e) => setEditingItem({ ...editingItem, css_class: e.target.value })}
                    className="input text-sm py-1"
                    placeholder="custom-class"
                  />
                </div>
              </div>

              {!editingItem.parent_id && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-gray-500">Megamenu</label>
                    <label className="flex items-center gap-2 text-sm p-2 border border-gray-200 rounded-md bg-white cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!editingItem.is_mega}
                        onChange={(e) => setEditingItem({ ...editingItem, is_mega: e.target.checked })}
                      />
                      <LayoutGrid className="w-3.5 h-3.5 text-indigo-500" />
                      Enable Megamenu
                    </label>
                  </div>
                  {editingItem.is_mega && (
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-gray-500">Columns</label>
                      <select
                        value={editingItem.mega_columns || 4}
                        onChange={(e) => setEditingItem({ ...editingItem, mega_columns: parseInt(e.target.value) })}
                        className="input text-sm py-1"
                      >
                        <option value={2}>2 Columns</option>
                        <option value={3}>3 Columns</option>
                        <option value={4}>4 Columns</option>
                        <option value={5}>5 Columns</option>
                        <option value={6}>6 Columns</option>
                      </select>
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-2 items-center">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={editingItem.target === '_blank'}
                    onChange={(e) => setEditingItem({ ...editingItem, target: e.target.checked ? '_blank' : '_self' })}
                  />
                  Open in new tab
                </label>
                <button onClick={() => handleUpdateItem(editingItem)} className="p-1 text-green-600 ml-auto">
                  <Check className="w-4 h-4" />
                </button>
                <button onClick={() => setEditingItem(null)} className="p-1 text-gray-500">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-gray-900">{item.title}</p>
                  {item.is_mega && (
                    <span className="flex items-center gap-1 text-[9px] bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-200 uppercase font-bold" title={`Megamenu - ${item.mega_columns || 4} columns`}>
                      <LayoutGrid className="w-2.5 h-2.5" />
                      Mega ({item.mega_columns || 4} col)
                    </span>
                  )}
                  {item.page_access_rules && (item.page_access_rules.auth !== 'all' || item.page_access_rules.subscription !== 'any') && (
                    <span className="flex items-center gap-1 text-[9px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded border border-amber-200 uppercase font-bold" title="Target page has access restrictions">
                      <Shield className="w-2.5 h-2.5" />
                      Restricted Page
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 mt-1">
                  <p className="text-xs text-gray-500 flex items-center gap-1">
                    {item.page_id ? (
                      <>
                        <FileText className="w-3 h-3" />
                        {item.page_title || 'Page'}
                      </>
                    ) : (
                      <>
                        <LinkIcon className="w-3 h-3" />
                        {item.url || '#'}
                      </>
                    )}
                    {item.target === '_blank' && (
                      <ExternalLink className="w-3 h-3 ml-1" />
                    )}
                  </p>
                  {item.description && (
                    <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                      {item.description.length > 40 ? item.description.slice(0, 40) + '...' : item.description}
                    </span>
                  )}
                  {item.display_rules?.auth && item.display_rules.auth !== 'all' && (
                    <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded uppercase font-bold">
                      {item.display_rules.auth.replace('_', ' ')}
                    </span>
                  )}
                  {item.display_rules?.urlPattern && (
                    <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded uppercase font-bold">
                      URL: {item.display_rules.urlPattern}
                    </span>
                  )}
                </div>
              </div>
              {depth === 0 && (
                <button
                  onClick={() => {
                    setAddingChildTo(item.id);
                    setNewItem(getDefaultNewItem(item.id));
                    setShowNewItem(true);
                  }}
                  className="p-1 text-indigo-500 hover:text-indigo-700"
                  title="Add child item"
                >
                  <PlusCircle className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() => setEditingItem({
                  ...item,
                  display_rules: item.display_rules || { auth: 'all', urlPattern: '' }
                })}
                className="p-1 text-gray-500 hover:text-gray-700"
                title="Edit"
              >
                <Edit className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleReorderItem(item.id, 'up')}
                className="p-1 text-gray-500 hover:text-gray-700"
                title="Move up"
              >
                <ArrowUp className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleReorderItem(item.id, 'down')}
                className="p-1 text-gray-500 hover:text-gray-700"
                title="Move down"
              >
                <ArrowDown className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleDeleteItem(item.id)}
                className="p-1 text-red-500 hover:text-red-700"
                title="Delete"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
        </div>

        {hasChildren && isExpanded && (
          <div>
            {item.children.map(child => renderMenuItem(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Menus</h1>
        <button onClick={() => setShowNewMenu(true)} className="btn btn-primary">
          <Plus className="w-4 h-4 mr-2" />
          New Menu
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Menu List */}
        <div className="lg:col-span-1">
          <div className="card divide-y divide-gray-200">
            {menus.length === 0 ? (
              <div className="p-6 text-center text-gray-500">
                <MenuIcon className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No menus yet</p>
              </div>
            ) : (
              menus.map((menu) => (
                <div
                  key={menu.id}
                  className={`p-4 cursor-pointer hover:bg-gray-50 flex items-center justify-between ${
                    selectedMenu?.id === menu.id ? 'bg-primary-50' : ''
                  }`}
                  onClick={() => loadMenu(menu.id)}
                >
                  <div>
                    <p className="font-medium text-gray-900">{menu.name}</p>
                    <p className="text-xs text-gray-500">{menu.item_count || 0} items</p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteMenu(menu.id);
                    }}
                    className="p-1 text-red-500 hover:text-red-700 opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Menu Items */}
        <div className="lg:col-span-3">
          {selectedMenu ? (
            <div className="card p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">{selectedMenu.name}</h2>
                  <p className="text-sm text-gray-500">Slug: {selectedMenu.slug}</p>
                </div>
                <button
                  onClick={() => {
                    setAddingChildTo(null);
                    setNewItem(getDefaultNewItem());
                    setShowNewItem(true);
                  }}
                  className={`btn ${showNewItem ? 'btn-secondary opacity-50 cursor-not-allowed' : 'btn-primary'}`}
                  disabled={showNewItem}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Item
                </button>
              </div>

              {/* Add Item Form */}
              {showNewItem && (
                <div className="mb-6 p-4 bg-gray-50 rounded-lg space-y-4">
                  {addingChildTo && (
                    <div className="flex items-center gap-2 text-sm text-indigo-700 bg-indigo-50 px-3 py-2 rounded-md border border-indigo-200">
                      <PlusCircle className="w-4 h-4" />
                      Adding child item to: <strong>{selectedMenu.items?.find(i => i.id === addingChildTo)?.title}</strong>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-4">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        checked={newItem.linkType === 'custom'}
                        onChange={() => setNewItem({ ...newItem, linkType: 'custom', page_id: null })}
                      />
                      Custom URL
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        checked={newItem.linkType === 'page'}
                        onChange={() => setNewItem({ ...newItem, linkType: 'page', url: '' })}
                      />
                      Page
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        checked={newItem.linkType === 'system'}
                        onChange={() => setNewItem({ ...newItem, linkType: 'system', page_id: null, url: systemRoutes[0]?.url })}
                      />
                      System
                    </label>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="label">Title</label>
                      <input
                        type="text"
                        value={newItem.title}
                        onChange={(e) => setNewItem({ ...newItem, title: e.target.value })}
                        className="input"
                        placeholder="Menu item title"
                      />
                    </div>

                    <div>
                      <label className="label">Parent Item</label>
                      <select
                        value={newItem.parent_id || ''}
                        onChange={(e) => {
                          const pid = e.target.value ? parseInt(e.target.value) : null;
                          setNewItem({ ...newItem, parent_id: pid });
                          setAddingChildTo(pid);
                        }}
                        className="input"
                      >
                        <option value="">None (Top Level)</option>
                        {selectedMenu.items.map(i => (
                          <option key={i.id} value={i.id}>{i.title}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {newItem.linkType === 'custom' ? (
                      <div>
                        <label className="label">URL</label>
                        <input
                          type="text"
                          value={newItem.url}
                          onChange={(e) => setNewItem({ ...newItem, url: e.target.value })}
                          className="input"
                          placeholder="https://..."
                        />
                      </div>
                    ) : newItem.linkType === 'system' ? (
                      <div>
                        <label className="label">System Route</label>
                        <select
                          value={newItem.url || ''}
                          onChange={(e) => {
                            const route = systemRoutes.find(r => r.url === e.target.value);
                            setNewItem(curr => ({
                              ...curr,
                              url: e.target.value,
                              title: curr.title?.trim() ? curr.title : (route?.title || '')
                            }));
                          }}
                          className="input"
                        >
                          {systemRoutes.map(route => (
                            <option key={route.url} value={route.url}>{route.title}</option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div>
                        <label className="label">Page</label>
                        <select
                          value={newItem.page_id || ''}
                          onChange={(e) => {
                            const pageId = e.target.value || null;
                            const selectedPage = pages.find(p => String(p.id) === String(pageId));
                            setNewItem(curr => ({
                              ...curr,
                              page_id: pageId,
                              title: curr.title?.trim() ? curr.title : (selectedPage?.title || '')
                            }));
                          }}
                          className="input"
                        >
                          <option value="">Select a page</option>
                          {pages.map(page => (
                            <option key={page.id} value={page.id}>{page.title}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="label">Authentication</label>
                      <select
                        value={newItem.display_rules?.auth || 'all'}
                        onChange={(e) => setNewItem({ 
                          ...newItem, 
                          display_rules: { ...newItem.display_rules, auth: e.target.value } 
                        })}
                        className="input"
                      >
                        <option value="all">Everyone</option>
                        <option value="logged_in">Logged In Only</option>
                        <option value="logged_out">Logged Out Only</option>
                      </select>
                    </div>
                    <div>
                      <label className="label">Subscription</label>
                      <select
                        value={newItem.display_rules?.subscription || 'any'}
                        onChange={(e) => setNewItem({ 
                          ...newItem, 
                          display_rules: { 
                            ...newItem.display_rules, 
                            subscription: e.target.value,
                            plans: e.target.value === 'any' ? [] : (newItem.display_rules.plans || [])
                          } 
                        })}
                        className="input"
                      >
                        <option value="any">Any Status</option>
                        <option value="required">Subscribed Only</option>
                        <option value="none">Non-Subscribers Only</option>
                      </select>
                    </div>
                  </div>

                  {newItem.display_rules?.subscription === 'required' && (
                    <div className="space-y-1">
                      <label className="label">Required Tiers (Optional)</label>
                      <div className="flex flex-wrap gap-2 p-2 border border-gray-200 rounded-md bg-white">
                        {subscriptionPlans.map(plan => (
                          <label key={plan.id} className="flex items-center gap-2 text-xs cursor-pointer">
                            <input
                              type="checkbox"
                              checked={(newItem.display_rules?.plans || []).includes(plan.slug)}
                              onChange={(e) => {
                                const currentPlans = newItem.display_rules?.plans || [];
                                const newPlans = e.target.checked
                                  ? [...currentPlans, plan.slug]
                                  : currentPlans.filter(s => s !== plan.slug);
                                setNewItem({
                                  ...newItem,
                                  display_rules: { ...newItem.display_rules, plans: newPlans }
                                });
                              }}
                            />
                            {plan.name}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="label">URL Pattern (Regex)</label>
                    <input
                      type="text"
                      value={newItem.display_rules?.urlPattern || ''}
                      onChange={(e) => setNewItem({ 
                        ...newItem, 
                        display_rules: { ...newItem.display_rules, urlPattern: e.target.value } 
                      })}
                      className="input"
                      placeholder="e.g. /shop/*"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="label">Description</label>
                      <input
                        type="text"
                        value={newItem.description}
                        onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                        className="input"
                        placeholder="Optional description"
                      />
                    </div>
                    <div>
                      <label className="label">Image URL</label>
                      <input
                        type="text"
                        value={newItem.image}
                        onChange={(e) => setNewItem({ ...newItem, image: e.target.value })}
                        className="input"
                        placeholder="/uploads/image.jpg"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="label">CSS Class</label>
                      <input
                        type="text"
                        value={newItem.css_class}
                        onChange={(e) => setNewItem({ ...newItem, css_class: e.target.value })}
                        className="input"
                        placeholder="custom-class"
                      />
                    </div>
                    {!addingChildTo && (
                      <>
                        <div>
                          <label className="label">Megamenu</label>
                          <label className="flex items-center gap-2 h-10 px-3 border border-gray-200 rounded-md bg-white cursor-pointer">
                            <input
                              type="checkbox"
                              checked={newItem.is_mega}
                              onChange={(e) => setNewItem({ ...newItem, is_mega: e.target.checked })}
                            />
                            <LayoutGrid className="w-4 h-4 text-indigo-500" />
                            Enable Megamenu
                          </label>
                        </div>
                        {newItem.is_mega && (
                          <div>
                            <label className="label">Columns</label>
                            <select
                              value={newItem.mega_columns}
                              onChange={(e) => setNewItem({ ...newItem, mega_columns: parseInt(e.target.value) })}
                              className="input"
                            >
                              <option value={2}>2 Columns</option>
                              <option value={3}>3 Columns</option>
                              <option value={4}>4 Columns</option>
                              <option value={5}>5 Columns</option>
                              <option value={6}>6 Columns</option>
                            </select>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={newItem.target === '_blank'}
                        onChange={(e) => setNewItem({ ...newItem, target: e.target.checked ? '_blank' : '_self' })}
                      />
                      Open in new tab
                    </label>
                  </div>

                  <div className="flex gap-2">
                    <button onClick={handleAddItem} className="btn btn-primary">
                      {addingChildTo ? 'Add Child Item' : 'Add Item'}
                    </button>
                    <button onClick={() => { setShowNewItem(false); setAddingChildTo(null); }} className="btn btn-ghost">
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Menu Items List */}
              {selectedMenu.items?.length > 0 ? (
                <div>
                  {selectedMenu.items.map(item => renderMenuItem(item))}
                </div>
              ) : (
                <div className="text-center py-12 text-gray-500">
                  <p>No items in this menu</p>
                  <p className="text-sm mt-1">Click "Add Item" to get started</p>
                </div>
              )}

              {/* Usage Info */}
              <div className="mt-6 pt-6 border-t border-gray-200">
                <h3 className="font-medium text-gray-900 mb-2">Usage in Templates</h3>
                <pre className="p-3 bg-gray-900 text-gray-100 rounded-lg text-sm overflow-x-auto">
{`{% set menu = menus['${selectedMenu.slug}'] %}
{% for item in menu.items %}
  {% if item.is_mega and item.children.length %}
    {# Megamenu parent #}
    <div class="mega-parent {{ item.css_class }}">
      <a href="{{ item.url }}">{{ item.title }}</a>
      <div class="megamenu" style="grid-template-columns: repeat({{ item.mega_columns }}, 1fr)">
        {% for child in item.children %}
          <a href="{{ child.url }}" class="{{ child.css_class }}">
            {% if child.image %}<img src="{{ child.image }}" alt="{{ child.title }}">{% endif %}
            <strong>{{ child.title }}</strong>
            {% if child.description %}<span>{{ child.description }}</span>{% endif %}
          </a>
        {% endfor %}
      </div>
    </div>
  {% else %}
    <a href="{{ item.url }}" target="{{ item.target }}">{{ item.title }}</a>
  {% endif %}
{% endfor %}`}
                </pre>
              </div>
            </div>
          ) : (
            <div className="card p-12 text-center text-gray-500">
              <MenuIcon className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Select a menu to edit its items</p>
            </div>
          )}
        </div>
      </div>

      {/* New Menu Modal */}
      {showNewMenu && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Create New Menu</h3>
            <div className="mb-4">
              <label className="label">Menu Name</label>
              <input
                type="text"
                value={newMenuName}
                onChange={(e) => setNewMenuName(e.target.value)}
                className="input"
                placeholder="e.g., Main Navigation"
                autoFocus
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowNewMenu(false)} className="btn btn-ghost">
                Cancel
              </button>
              <button onClick={handleCreateMenu} className="btn btn-primary">
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
