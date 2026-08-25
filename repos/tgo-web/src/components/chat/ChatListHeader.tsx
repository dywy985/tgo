import React, { useCallback, useState } from 'react';

import { useTranslation } from 'react-i18next';

import Icon from '@/components/ui/Icon';
import SearchPanel from '@/components/chat/SearchPanel';

export interface ChatListHeaderProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
}

/**
 * Chat list header with search input and action buttons.
 */
export const ChatListHeader: React.FC<ChatListHeaderProps> = React.memo(({ searchQuery, onSearchChange }) => {
  const [searchOpen, setSearchOpen] = useState(false);
  const { t } = useTranslation();

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onSearchChange(e.target.value);
  }, [onSearchChange]);

  const openSearch = useCallback(() => {
    setSearchOpen(true);
  }, []);

  const closeSearch = useCallback(() => setSearchOpen(false), []);

  return (
    <div className="px-4 py-3 border-b border-gray-200/60 dark:border-gray-700/60 flex items-center justify-between sticky top-0 bg-white/90 dark:bg-gray-800/90 backdrop-blur-lg z-10">
      <div className="relative flex-grow mr-2">
        <input
          type="text"
          placeholder={t('chat.list.searchPlaceholder', '搜索')}
          aria-label={t('chat.list.searchAria', '搜索')}
          value={searchQuery}
          readOnly
          onClick={openSearch}
          onFocus={openSearch}
          onChange={handleSearchChange}
          className="w-full pl-8 pr-2 py-1.5 text-sm border border-gray-300/70 dark:border-gray-600/70 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-blue-500 dark:focus:border-blue-400 bg-gray-100/70 dark:bg-gray-700/70 dark:text-gray-200 cursor-text"
        />
        <Icon name="Search" size={16} className="w-4 h-4 absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500" />
      </div>

      {searchOpen && <SearchPanel open={searchOpen} onClose={closeSearch} />}
    </div>
  );
});

ChatListHeader.displayName = 'ChatListHeader';

