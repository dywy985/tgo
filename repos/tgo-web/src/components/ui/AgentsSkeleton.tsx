import React from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Agent card skeleton component
 */
export const AgentCardSkeleton: React.FC = () => {
  return (
    <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-md rounded-lg p-5 shadow-sm border border-gray-200/60 dark:border-gray-700 animate-pulse">
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center space-x-3">
          {/* Avatar placeholder */}
          <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded-md"></div>
          <div>
            {/* Name placeholder */}
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-24 mb-1"></div>
            {/* Role placeholder */}
            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-16"></div>
          </div>
        </div>
        {/* Status indicator placeholder */}
        <div className="w-2.5 h-2.5 bg-gray-200 dark:bg-gray-700 rounded-full"></div>
      </div>

      {/* Description placeholder */}
      <div className="space-y-2 mb-4">
        <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-full"></div>
        <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
        <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
      </div>

      {/* Stats placeholder */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="text-center">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-8 mx-auto mb-1"></div>
          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-12 mx-auto"></div>
        </div>
        <div className="text-center">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-10 mx-auto mb-1"></div>
          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-8 mx-auto"></div>
        </div>
        <div className="text-center">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-6 mx-auto mb-1"></div>
          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-10 mx-auto"></div>
        </div>
      </div>

      {/* Tools and knowledge bases placeholder */}
      <div className="space-y-3 mb-4">
        <div>
          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-16 mb-2"></div>
          <div className="flex flex-wrap gap-1">
            <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-12"></div>
            <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-16"></div>
            <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-14"></div>
          </div>
        </div>
        <div>
          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-20 mb-2"></div>
          <div className="flex flex-wrap gap-1">
            <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-18"></div>
            <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-14"></div>
          </div>
        </div>
      </div>

      {/* Action buttons placeholder */}
      <div className="mt-4 pt-3 border-t border-gray-200/60 dark:border-gray-700 flex justify-end space-x-3">
        <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded"></div>
        <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded"></div>
        <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded"></div>
        <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded"></div>
      </div>
    </div>
  );
};

/**
 * Agents grid skeleton
 */
interface AgentsGridSkeletonProps {
  count?: number;
}

export const AgentsGridSkeleton: React.FC<AgentsGridSkeletonProps> = ({ 
  count = 6 
}) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {Array.from({ length: count }, (_, index) => (
        <AgentCardSkeleton key={index} />
      ))}
    </div>
  );
};

/**
 * Agents header skeleton
 */
export const AgentsHeaderSkeleton: React.FC = () => {
  return (
    <div className="flex justify-between items-center animate-pulse">
      <div className="flex items-center space-x-4">
        {/* Title placeholder */}
        <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-24"></div>
      </div>
      <div className="flex items-center space-x-3">
        {/* Refresh button placeholder */}
        <div className="w-9 h-9 bg-gray-200 dark:bg-gray-700 rounded"></div>
        {/* Create button placeholder */}
        <div className="h-9 bg-gray-200 dark:bg-gray-700 rounded w-24"></div>
      </div>
    </div>
  );
};

/**
 * Complete agents page skeleton
 */
export const AgentsPageSkeleton: React.FC = () => {
  return (
    <main className="flex-grow flex flex-col bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      {/* Header skeleton */}
      <header className="px-6 py-4 border-b border-gray-200/80 dark:border-gray-700 bg-white/60 dark:bg-gray-800/60 backdrop-blur-lg sticky top-0 z-10">
        <AgentsHeaderSkeleton />
      </header>

      {/* Content area skeleton */}
      <div className="flex-grow overflow-y-auto p-6" style={{ height: 0 }}>
        <AgentsGridSkeleton count={9} />
      </div>

      {/* Pagination skeleton */}
      <div className="px-6 py-4 border-t border-gray-200/80 dark:border-gray-700 bg-white/60 dark:bg-gray-800/60 backdrop-blur-lg">
        <div className="flex justify-between items-center animate-pulse">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-32"></div>
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded"></div>
            <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded"></div>
            <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded"></div>
            <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded"></div>
          </div>
        </div>
      </div>
    </main>
  );
};

/**
 * Error state component for agents
 */
interface AgentsErrorStateProps {
  error: string;
  onRetry?: () => void;
}

export const AgentsErrorState: React.FC<AgentsErrorStateProps> = ({
  error,
  onRetry
}) => {
  const { t } = useTranslation();

  return (
    <div className="text-center py-12">
      <div className="text-red-400 dark:text-red-500 mb-4">
        <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
      </div>
      <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
        {t('agents.error.title', '加载失败')}
      </h3>
      <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto mb-4">
        {error}
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 dark:bg-blue-700 hover:bg-blue-700 dark:hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
        >
          {t('agents.error.retry', '重试')}
        </button>
      )}
    </div>
  );
};

/**
 * Empty state component for agents
 */
interface AgentsEmptyStateProps {
  title?: string;
  description?: string;
  showAgentIcon?: boolean;
  actionButton?: React.ReactNode;
}

export const AgentsEmptyState: React.FC<AgentsEmptyStateProps> = ({
  title,
  description,
  showAgentIcon = true,
  actionButton
}) => {
  const { t } = useTranslation();

  // Use provided props or fallback to translations
  const displayTitle = title || t('agents.empty.title', '暂无AI员工');
  const displayDescription = description || t('agents.empty.description', '点击「创建AI员工」按钮开始创建您的第一个AI员工');

  return (
    <div className="text-center py-12">
      <div className="text-gray-400 dark:text-gray-500 mb-4">
        {showAgentIcon ? (
          <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        ) : (
          <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        )}
      </div>
      <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">{displayTitle}</h3>
      <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto mb-4">
        {displayDescription}
      </p>
      {actionButton && (
        <div className="mt-6">
          {actionButton}
        </div>
      )}
    </div>
  );
};
