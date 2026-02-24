import React, { useState, useEffect } from 'react';
import api from '../lib/api';
import { List, Plus, Trash2, Loader2, Check, X, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

export default function MenuWidget({ contentId, pageId, title, url, contentType }) {
  const [menus, setMenus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addingTo, setAddingTo] = useState(null); // ID of menu being added to

  useEffect(() => {
    loadMenus();
  }, [pageId, url]);

  const loadMenus = async () => {
    try {
      setLoading(true);
      // Get all menus with their items
      const menusData = await api.get('/menus');
      
      // For each menu, we need to know if our item is in it
      // We'll fetch the full details for each menu to check items
      const fullMenus = await Promise.all(
        menusData.map(m => api.get(`/menus/${m.id}`))
      );
      
      setMenus(fullMenus);
    } catch (err) {
      console.error('Failed to load menus:', err);
    } finally {
      setLoading(false);
    }
  };

  const isItemInMenu = (menu) => {
    const flattenItems = (items) => {
      let result = [];
      items.forEach(item => {
        result.push(item);
        if (item.children?.length > 0) {
          result = result.concat(flattenItems(item.children));
        }
      });
      return result;
    };

    const allItems = flattenItems(menu.items || []);
    return allItems.find(item => {
      if (pageId && item.page_id === parseInt(pageId)) return true;
      if (url && item.url === url) return true;
      return false;
    });
  };

  const handleAddToMenu = async (menuId) => {
    try {
      setAddingTo(menuId);
      const itemData = {
        title: title,
        target: '_self',
        display_rules: { auth: 'all' },
        ...(pageId ? { page_id: parseInt(pageId) } : { url: url })
      };
      
      await api.post(`/menus/${menuId}/items`, itemData);
      toast.success(`Added to ${menus.find(m => m.id === menuId)?.name}`);
      await loadMenus();
    } catch (err) {
      toast.error('Failed to add to menu: ' + err.message);
    } finally {
      setAddingTo(null);
    }
  };

  const handleRemoveFromMenu = async (menuId) => {
    if (!confirm('Remove this item from the menu?')) return;
    
    try {
      const menu = menus.find(m => m.id === menuId);
      const flattenItems = (items) => {
        let result = [];
        items.forEach(item => {
          result.push(item);
          if (item.children?.length > 0) {
            result = result.concat(flattenItems(item.children));
          }
        });
        return result;
      };

      const allItems = flattenItems(menu.items || []);
      const item = allItems.find(item => {
        if (pageId && item.page_id === parseInt(pageId)) return true;
        if (url && item.url === url) return true;
        return false;
      });

      if (item) {
        await api.delete(`/menus/${menuId}/items/${item.id}`);
        toast.success(`Removed from ${menu.name}`);
        await loadMenus();
      }
    } catch (err) {
      toast.error('Failed to remove from menu: ' + err.message);
    }
  };

  if (loading) {
    return (
      <div className="card p-6 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <List className="w-4 h-4 text-primary-600" />
          Menu Presence
        </h2>
      </div>

      <div className="space-y-2">
        {menus.map(menu => {
          const inMenu = isItemInMenu(menu);
          const isProcessing = addingTo === menu.id;

          return (
            <div key={menu.id} className="flex items-center justify-between p-2 rounded-lg border border-gray-100 bg-gray-50/50">
              <div className="flex flex-col">
                <span className="text-sm font-medium text-gray-700">{menu.name}</span>
                <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">
                  {inMenu ? 'Already Linked' : 'Not in menu'}
                </span>
              </div>
              
              {inMenu ? (
                <button 
                  onClick={() => handleRemoveFromMenu(menu.id)}
                  className="p-1.5 text-red-500 hover:bg-red-50 rounded-md transition-colors"
                  title="Remove from menu"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              ) : (
                <button 
                  onClick={() => handleAddToMenu(menu.id)}
                  disabled={isProcessing}
                  className="p-1.5 text-primary-600 hover:bg-primary-50 rounded-md transition-colors disabled:opacity-50"
                  title="Add to menu"
                >
                  {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                </button>
              )}
            </div>
          );
        })}

        {menus.length === 0 && (
          <p className="text-xs text-gray-500 italic text-center py-2">
            No menus found. Create one in Settings &gt; Menus.
          </p>
        )}
      </div>

      <div className="pt-2 border-t border-gray-100">
        <a 
          href="/admin/menus" 
          target="_blank" 
          className="text-[10px] text-primary-600 font-bold uppercase flex items-center justify-center gap-1 hover:underline"
        >
          Manage All Menus <ExternalLink className="w-2.5 h-2.5" />
        </a>
      </div>
    </div>
  );
}
