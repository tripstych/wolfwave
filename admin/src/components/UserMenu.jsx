import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronDown, LogOut, Settings, User, ShoppingBag } from 'lucide-react';
import { useTranslation } from '../context/TranslationContext';
import { useCustomerAuth } from '../context/CustomerAuthContext';

export default function UserMenu({ user, onLogout }) {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const { _ } = useTranslation();
  const { customer, customerLogout } = useCustomerAuth();

  const handleLogoutClick = async () => {
    await onLogout();
    setIsOpen(false);
  };

  const handleCustomerLogoutClick = async () => {
    await customerLogout();
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-100 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="relative">
          <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center border border-primary-200">
            <span className="text-primary-700 font-medium text-sm">
              {user?.name?.charAt(0) || user?.email?.charAt(0) || 'U'}
            </span>
          </div>
          {customer && (
            <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-white flex items-center justify-center">
              <ShoppingBag className="w-2 h-2 text-white" />
            </div>
          )}
        </div>
        <span className="hidden sm:block text-sm font-medium text-gray-700">
          {user?.name || user?.email}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
            {/* Admin User Section */}
            <div className="px-4 py-2 border-b border-gray-100">
              <div className="flex items-center gap-2 mb-1">
                <User className="w-4 h-4 text-blue-600" />
                <p className="text-xs font-semibold text-blue-600 uppercase">Admin</p>
              </div>
              <p className="text-sm font-bold text-gray-900 truncate">{user?.name || _('user.default_name', 'User')}</p>
              <p className="text-xs text-gray-500 truncate">{user?.email}</p>
            </div>

            {/* Customer Section */}
            <div className="px-4 py-2 border-b border-gray-100">
              <div className="flex items-center gap-2 mb-1">
                <ShoppingBag className="w-4 h-4 text-green-600" />
                <p className="text-xs font-semibold text-green-600 uppercase">Customer</p>
              </div>
              {customer ? (
                <>
                  <p className="text-sm font-bold text-gray-900 truncate">{customer?.name || customer?.first_name || 'Customer'}</p>
                  <p className="text-xs text-gray-500 truncate">{customer?.email}</p>
                </>
              ) : (
                <p className="text-sm text-gray-500 italic">Not logged in</p>
              )}
            </div>

            {/* Actions */}
            <Link
              to="/settings"
              className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              onClick={() => setIsOpen(false)}
            >
              <Settings className="w-4 h-4" />
              {_('user.settings', 'Settings')}
            </Link>
            
            {customer && (
              <button
                onClick={handleCustomerLogoutClick}
                className="w-full text-left px-4 py-2 text-sm text-orange-600 hover:bg-orange-50 flex items-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                Sign out Customer
              </button>
            )}
            
            <button
              onClick={handleLogoutClick}
              className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              {_('user.sign_out', 'Sign out Admin')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
