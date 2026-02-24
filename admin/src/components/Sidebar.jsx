import React from 'react';
import { Link } from 'react-router-dom';
import { X, LayoutDashboard, FileText, Boxes, Puzzle, Layers, Image, List, Tag, Package, Briefcase, Users, CreditCard, Palette, Building, Mail, Search, Settings, Download, Globe, Key, Megaphone } from 'lucide-react';
import SidebarItem from './SidebarItem';

const ICON_MAP = {
  'LayoutDashboard': LayoutDashboard,
  'FileText': FileText,
  'Boxes': Boxes,
  'BookOpen': FileText, // Default fallbacks
  'Newspaper': FileText,
  'Package': Package,
  'Users': Users,
  'Briefcase': Briefcase,
  'Layers': Layers,
  'Image': Image,
  'List': List,
  'Search': Search,
  'Settings': Settings,
  'Puzzle': Puzzle
};

export default function Sidebar({ isOpen, onClose, contentTypes = [] }) {
  const navigationSections = [
    {
      section: null,
      items: [{ name: 'Dashboard', href: '/', icon: LayoutDashboard }]
    },
    {
      section: 'Store',
      items: [
        { name: 'My Sites', href: '/my-sites', icon: Globe },
        { name: 'Products', href: '/products', icon: Package },
        { name: 'Orders', href: '/orders', icon: Briefcase },
        { name: 'Customers', href: '/customers', icon: Users },
        { name: 'Subscriptions', href: '/subscriptions', icon: CreditCard },
        { name: 'Classifieds', href: '/classifieds', icon: Megaphone }
      ]
    },
    {
      section: 'Marketing',
      items: [{ name: 'Coupons', href: '/marketing/coupons', icon: Tag }]
    },
    {
      section: 'Content',
      items: [
        { name: 'Pages', href: '/pages', icon: FileText },
        { name: 'Posts', href: '/posts', icon: FileText },
        { name: 'Blocks', href: '/blocks', icon: Boxes },
        { name: 'Widgets', href: '/widgets', icon: Puzzle },
        { name: 'Templates', href: '/templates', icon: Layers },
        { name: 'Media', href: '/media', icon: Image },
        { name: 'Menus', href: '/menus', icon: List },
        { name: 'Groups', href: '/groups', icon: Tag },
        ...contentTypes
          .filter(type => !['products', 'pages', 'blocks', 'widgets', 'shop', 'shops', 'blog', 'components', 'partials', 'customer'].includes(type.name))
          .map(type => ({
            name: type.plural_label,
            href: `/${type.name}`,
            icon: ICON_MAP[type.icon] || FileText
          })),
        { name: 'Site Importer', href: '/import', icon: Download },
      ]
    },
    {
      section: 'Settings',
      items: [
        { name: 'Themes', href: '/themes', icon: Palette },
        { name: 'Styles', href: '/styles', icon: Palette },
        { name: 'Users', href: '/users', icon: Users },
        { name: 'Sites', href: '/tenants', icon: Globe },
        { name: 'Email Templates', href: '/email-templates', icon: Mail },
        { name: 'SEO', href: '/seo', icon: Search },
        { name: 'API Keys', href: '/api-keys', icon: Key },
        { name: 'Configuration', href: '/settings', icon: Settings }
      ]
    }
  ];

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-gray-900/50 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed top-0 left-0 z-50 h-full w-64 bg-white border-r border-gray-200 transform transition-transform duration-200 lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between h-16 px-4 border-b border-gray-200">
          <Link to="/" className="flex items-center gap-2" onClick={onClose}>
            <img src="/images/logo.png" alt="WolfWave CMS" className="w-8 h-8 object-contain" />
            <span className="font-semibold text-gray-900 text-lg">WolfWave</span>
          </Link>
          <button
            className="lg:hidden p-1 text-gray-500 hover:text-gray-700"
            onClick={onClose}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="p-4 space-y-6 overflow-y-auto max-h-[calc(100vh-80px)]">
          {navigationSections.map((section, sectionIdx) => (
            <div key={sectionIdx}>
              {section.section && (
                <h3 className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {section.section}
                </h3>
              )}
              <div className="space-y-1">
                {section.items.map((item) => (
                  <SidebarItem
                    key={item.name}
                    {...item}
                    onClick={onClose}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
