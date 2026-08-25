import React from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, AlertCircle, ChevronUp } from 'lucide-react';

/**
 * Props for the LoadingStates component
 */
export interface LoadingStatesProps {
  /** Whether initial history is loading */
  isLoadingHistory: boolean;
  /** Whether more messages are being loaded */
  isLoadingMore: boolean;
  /** Error message if loading failed */
  historyError: string | null;
  /** Whether there are more messages to load */
  hasMoreHistory: boolean;
  /** Whether there are any messages */
  hasMessages: boolean;
  /** Callback to load more messages */
  onLoadMore: () => void;
  /** Callback to retry loading */
  onRetry: () => void;
}

/**
 * Component for displaying various loading states in the chat
 * Memoized to prevent unnecessary re-renders
 */
const LoadingStates: React.FC<LoadingStatesProps> = React.memo(({
  isLoadingHistory,
  isLoadingMore,
  historyError,
  hasMoreHistory,
  hasMessages,
  onLoadMore,
  onRetry
}) => {
  const { t } = useTranslation();

  // Load More Button
  if (hasMoreHistory && hasMessages) {
    return (
      <div className="flex justify-center pb-4">
        <button
          onClick={onLoadMore}
          disabled={isLoadingMore}
          className="flex items-center px-4 py-2 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoadingMore ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <ChevronUp className="w-4 h-4 mr-2" />
          )}
          {isLoadingMore 
            ? t('chat.history.loading', '加载中...') 
            : t('chat.history.loadMore', '加载更多历史消息')
          }
        </button>
      </div>
    );
  }

  // Initial Loading State
  if (isLoadingHistory && !hasMessages) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500 dark:text-blue-400 mr-2" />
        <span className="text-gray-600 dark:text-gray-400">
          {t('chat.history.loading', '加载历史消息中...')}
        </span>
      </div>
    );
  }

  // Error State
  if (historyError) {
    return (
      <div className="flex flex-col items-center justify-center h-32">
        <AlertCircle className="w-12 h-12 text-red-500 dark:text-red-400 mb-4" />
        <p className="text-gray-600 dark:text-gray-400 text-center mb-4">{historyError}</p>
        <button
          onClick={onRetry}
          className="px-4 py-2 bg-blue-500 dark:bg-blue-600 text-white rounded-lg hover:bg-blue-600 dark:hover:bg-blue-700 transition-colors"
        >
          {t('chat.history.retry', '重试')}
        </button>
      </div>
    );
  }

  return null;
});

LoadingStates.displayName = 'LoadingStates';

export default LoadingStates;
