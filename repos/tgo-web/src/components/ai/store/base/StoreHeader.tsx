import React from 'react';
import { Search, X } from 'lucide-react';
import { StoreHeaderProps } from '../types';

const StoreHeader: React.FC<StoreHeaderProps> = ({ 
  searchQuery, 
  onSearchChange, 
  searchPlaceholder, 
  onClose,
  themeColor = 'blue',
  userStatus
}) => {
  const focusClasses = {
    blue: 'focus:ring-blue-500/10 focus:border-blue-500',
    indigo: 'focus:ring-indigo-500/10 focus:border-indigo-500',
    purple: 'focus:ring-purple-500/10 focus:border-purple-500'
  };

  const iconFocusClasses = {
    blue: 'group-focus-within:text-blue-500',
    indigo: 'group-focus-within:text-indigo-500',
    purple: 'group-focus-within:text-purple-500'
  };

  return (
    <header className="px-8 py-6 flex items-center justify-between gap-6 border-b border-gray-100 dark:border-gray-800 bg-white/50 dark:bg-gray-900/50 backdrop-blur-xl sticky top-0 z-20">
      <div className="relative flex-1 max-w-2xl group">
        <Search className={`absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 transition-colors ${iconFocusClasses[themeColor]}`} />
        <input 
          type="text"
          placeholder={searchPlaceholder}
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className={`w-full pl-12 pr-4 py-3 bg-gray-100 dark:bg-gray-800 border-transparent focus:bg-white dark:focus:bg-gray-800 focus:ring-4 rounded-2xl text-sm font-medium transition-all outline-none ${focusClasses[themeColor]}`}
        />
      </div>

      <div className="flex items-center gap-4">
        {/* User Status */}
        {userStatus}

        <button 
          onClick={onClose}
          className="p-3 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-2xl text-gray-400 hover:text-gray-600 transition-all shadow-sm active:scale-90"
        >
          <X className="w-6 h-6" />
        </button>
      </div>
    </header>
  );
};

export default StoreHeader;
