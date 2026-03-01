import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { X, LayoutDashboard, Boxes, Puzzle, Layers, Image, List, Tag, Package, Briefcase, Users, CreditCard, Palette, Mail, Search, Settings, Download, Globe, Key, Megaphone, Zap, Heart, ShoppingCart, FolderOpen, Truck, FileText } from 'lucide-react';
import SidebarItem from './SidebarItem';
import { useTranslation } from '../context/TranslationContext';
import { useAuth } from '../context/AuthContext';
import api from '../lib/api';


export default function Sidebar({ isOpen, onClose }) {
  const { _ } = useTranslation();
  const { user } = useAuth();
  const [hasLicenses, setHasLicenses] = useState(false);

  useEffect(() => {
    const checkLicenses = async () => {
      // Only check if user is admin (this is for admin panel)
      if (!user) return;
      
      try {
        const limits = await api.get('/customer-tenants/limits');
        // A user has licenses if they have a non-zero limit or already have sites
        const valid = limits && !limits.no_customer && (
          (typeof limits.limit === 'number' && limits.limit > 0) || 
          (typeof limits.used === 'number' && limits.used > 0)
        );
        setHasLicenses(!!valid);
      } catch (err) {
        setHasLicenses(false);
      }
    };
    checkLicenses();
  }, [user]);

  const navigationSections = [
    {
      section: null,
      items: [{ name: _('nav.dashboard', 'Dashboard'), href: '/', icon: LayoutDashboard }]
    },
    {
      section: _('nav.section.site', 'Site'),
      items: [
        { name: _('nav.pages', 'Pages'), href: '/pages', icon: FileText },
        { name: _('nav.posts', 'Posts'), href: '/posts', icon: FileText },
        { name: _('nav.blocks', 'Blocks'), href: '/blocks', icon: Boxes },
        { name: _('nav.widgets', 'Widgets'), href: '/widgets', icon: Puzzle },
        { name: _('nav.media', 'Media'), href: '/media', icon: Image },
        { name: _('nav.menus', 'Menus'), href: '/menus', icon: List },
        { name: _('nav.groups', 'Groups'), href: '/groups', icon: Tag },
      ]
    },
    {
      section: _('nav.section.design', 'Design'),
      items: [
        { name: _('nav.themes', 'Themes'), href: '/themes', icon: Palette },
        { name: _('nav.templates', 'Templates'), href: '/templates', icon: Layers },
        { name: _('nav.styles', 'Styles'), href: '/styles', icon: Palette },
        { name: _('nav.email_templates', 'Email Templates'), href: '/email-templates', icon: Mail },
      ]
    },
    {
      section: _('nav.section.store', 'Store'),
      items: [
        { name: _('nav.orders', 'Orders'), href: '/orders', icon: Briefcase },
        { name: _('nav.products', 'Products'), href: '/products', icon: Package },
        { name: _('nav.customers', 'Customers'), href: '/customers', icon: Users },
        { name: _('nav.subscriptions', 'Subscriptions'), href: '/subscriptions', icon: CreditCard },
      ]
    },
    {
      section: _('nav.section.marketing', 'Marketing'),
      items: [
        { name: _('nav.coupons', 'Coupons'), href: '/marketing/coupons', icon: Tag },
        { name: _('nav.classifieds', 'Classifieds'), href: '/classifieds', icon: Megaphone },
        { name: _('nav.seo', 'SEO'), href: '/seo', icon: Search },
      ]
    },
    {
      section: _('nav.section.integrations', 'Integrations'),
      items: [
        { name: _('nav.shipstation', 'ShipStation'), href: '/shipstation', icon: Truck },
        { name: _('nav.woocommerce_keys', 'WooCommerce Keys'), href: '/woocommerce-keys', icon: ShoppingCart },
        { name: _('nav.api_keys', 'API Keys'), href: '/api-keys', icon: Key },
      ]
    },
    {
        section: _('nav.section.system', 'System'),
        items: [
          ...(hasLicenses ? [{ name: _('nav.my_sites', 'My Sites'), href: '/my-sites', icon: Globe }] : []),
          ...(user?.is_global ? [{ name: _('nav.sites', 'Sites'), href: '/tenants', icon: Globe }] : []),
          { name: _('nav.users', 'Users'), href: '/users', icon: Users },
          { name: _('nav.configuration', 'Configuration'), href: '/settings', icon: Settings },
          { name: _('nav.import', 'Import'), href: '/import', icon: Download },
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
