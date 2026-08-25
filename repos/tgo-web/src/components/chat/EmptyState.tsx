import React from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '../ui/Icon';

/**
 * Props for the EmptyState component
 */
export interface EmptyStateProps {
  /** Type of empty state to display */
  type: 'no-chat' | 'no-messages';
}

/**
 * Component for displaying empty states in the chat
 * Memoized to prevent unnecessary re-renders
 */
const EmptyState: React.FC<EmptyStateProps> = React.memo(({ type }) => {
  const { t } = useTranslation();

  if (type === 'no-chat') {
    return (
      <main className="flex-grow flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
        <div className="text-center text-gray-500 dark:text-gray-400">
          <Icon name="MessageCircle" size={48} className="mx-auto mb-4 text-gray-300 dark:text-gray-600" />
          <p>{t('chat.empty.selectConversation', '选择一个聊天开始对话')}</p>
        </div>
      </main>
    );
  }

  if (type === 'no-messages') {
    return (
      <div className="flex items-center justify-center h-32">
        <p className="text-gray-500 dark:text-gray-400">
          {t('chat.history.noMessages', '暂无历史消息')}
        </p>
      </div>
    );
  }

  return null;
});

EmptyState.displayName = 'EmptyState';

export default EmptyState;
