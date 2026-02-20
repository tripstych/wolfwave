import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import {
  Plus,
  Search,
  MoreVertical,
  Edit,
  Trash2,
  Puzzle,
  Copy
} from 'lucide-react';
import { toast } from 'sonner';

export default function Widgets() {
  const [widgets, setWidgets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(null);

  useEffect(() => {
    loadWidgets();
  }, []);

  const loadWidgets = async () => {
    try {
      const response = await api.get('/blocks?content_type=widgets');
      setWidgets(response.data || []);
    } catch (err) {
      console.error('Failed to load widgets:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this widget?')) return;
    try {
      await api.delete(`/blocks/${id}`);
      loadWidgets();
      toast.success('Widget deleted');
    } catch (err) {
      toast.error('Failed to delete widget');
    }
    setMenuOpen(null);
  };

  const copyShortcode = (slug) => {
    const shortcode = `[[widget:${slug}]]`;
    navigator.clipboard.writeText(shortcode);
    toast.success('Shortcode copied: ' + shortcode);
    setMenuOpen(null);
  };

  const filteredWidgets = widgets.filter(widget =>
    widget.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
        <div className="flex items-center gap-3">
          <Puzzle className="w-8 h-8 text-primary-600" />
          <h1 className="text-2xl font-bold text-gray-900">Widgets</h1>
        </div>
        <Link to="/widgets/new" className="btn btn-primary">
          <Plus className="w-4 h-4 mr-2" />
          New Widget
        </Link>
      </div>

      <div className="card p-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search widgets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input pl-10 w-full"
          />
        </div>
      </div>

      <div className="card overflow-visible">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Shortcode
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">
                Type
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredWidgets.length === 0 ? (
              <tr>
                <td colSpan="4" className="px-6 py-8 text-center text-gray-500">
                  {searchQuery
                    ? 'No widgets match your search'
                    : 'No widgets yet. Create your first dynamic widget!'}
                </td>
              </tr>
            ) : (
              filteredWidgets.map((widget) => (
                <tr key={widget.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <Link to={`/widgets/${widget.id}`} className="block">
                      <p className="font-medium text-gray-900 hover:text-primary-600">
                        {widget.name}
                      </p>
                    </Link>
                  </td>
                  <td className="px-6 py-4">
                    <code 
                      className="bg-gray-100 px-2 py-1 rounded text-xs cursor-pointer hover:bg-gray-200"
                      onClick={() => copyShortcode(widget.slug)}
                      title="Click to copy"
                    >
                      [[widget:{widget.slug}]]
                    </code>
                  </td>
                  <td className="px-6 py-4 hidden md:table-cell">
                    <span className="text-sm text-gray-600">
                      {widget.template_name || '-'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="relative">
                      <button
                        onClick={() => setMenuOpen(menuOpen === widget.id ? null : widget.id)}
                        className="p-1 rounded hover:bg-gray-100"
                      >
                        <MoreVertical className="w-4 h-4 text-gray-500" />
                      </button>
                      {menuOpen === widget.id && (
                        <>
                          <div
                            className="fixed inset-0 z-40"
                            onClick={() => setMenuOpen(null)}
                          />
                          <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                            <button
                              onClick={() => copyShortcode(widget.slug)}
                              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                            >
                              <Copy className="w-4 h-4" />
                              Copy Shortcode
                            </button>
                            <Link
                              to={`/widgets/${widget.id}`}
                              className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                            >
                              <Edit className="w-4 h-4" />
                              Edit
                            </Link>
                            <button
                              onClick={() => handleDelete(widget.id)}
                              className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                            >
                              <Trash2 className="w-4 h-4" />
                              Delete
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
