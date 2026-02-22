import React from 'react';
import { Link, useLocation } from 'react-router-dom';

export default function SidebarItem({ name, href, icon: Icon, onClick }) {
  const location = useLocation();
  const isActive = location.pathname === href ||
    (href !== '/' && location.pathname.startsWith(href));

  return (
    <Link
      to={href}
      onClick={onClick}
      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
        isActive
          ? 'bg-primary-50 text-primary-700 shadow-sm'
          : 'text-gray-700 hover:bg-gray-100'
      }`}
    >
      <Icon className={`w-5 h-5 ${isActive ? 'text-primary-600' : 'text-gray-500'}`} />
      {name}
    </Link>
  );
}
