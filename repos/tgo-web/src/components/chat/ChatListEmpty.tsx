import React from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '@/components/ui/Icon';

export interface ChatListEmptyProps { isSyncing: boolean; }

/**
 * Empty state when there are no conversations to show.
 */
export const ChatListEmpty: React.FC<ChatListEmptyProps> = React.memo(({ isSyncing }) => {
  const { t } = useTranslation();
  if (isSyncing) return null;
  return (
    <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
      <Icon name="MessageCircle" size={48} className="w-12 h-12 mb-4 opacity-50" />
      <p className="text-sm">{t('chat.sync.noConversations')}</p>
    </div>
  );
});

ChatListEmpty.displayName = 'ChatListEmpty';

