/**
 * Project Tools Loading Skeleton Component
 * Provides loading states for project tools list
 */

import React from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Single project tool card skeleton
 */
export const ProjectToolCardSkeleton: React.FC = () => {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 animate-pulse">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center space-x-3">
          {/* Icon placeholder */}
          <div className="w-12 h-12 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
          <div>
            {/* Title placeholder */}
            <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-32 mb-2"></div>
            {/* Author placeholder */}
            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-20"></div>
          </div>
        </div>
        {/* Status badge placeholder */}
        <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded-full w-16"></div>
      </div>

      {/* Description placeholder */}
      <div className="space-y-2 mb-4">
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full"></div>
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
      </div>

      {/* Tags placeholder */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded-full w-16"></div>
        <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded-full w-20"></div>
        <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded-full w-14"></div>
      </div>

      {/* Stats placeholder */}
      <div className="flex items-center justify-between text-sm mb-4">
        <div className="flex items-center space-x-4">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-16"></div>
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-20"></div>
        </div>
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-12"></div>
      </div>

      {/* Action buttons placeholder */}
      <div className="flex items-center justify-between">
        <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-20"></div>
        <div className="flex space-x-2">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-16"></div>
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-16"></div>
        </div>
      </div>
    </div>
  );
};

/**
 * Project tools grid skeleton
 */
interface AiToolsGridSkeletonProps {
  count?: number;
}

export const AiToolsGridSkeleton: React.FC<AiToolsGridSkeletonProps> = ({ 
  count = 6 
}) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: count }, (_, index) => (
        <ProjectToolCardSkeleton key={index} />
      ))}
    </div>
  );
};

/**
 * Project tools list skeleton (for list view)
 */
export const AiToolsListSkeleton: React.FC<AiToolsGridSkeletonProps> = ({ 
  count = 6 
}) => {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 animate-pulse">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              {/* Icon placeholder */}
              <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
              <div>
                {/* Title placeholder */}
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-32 mb-2"></div>
                {/* Description placeholder */}
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-48"></div>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              {/* Status placeholder */}
              <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded-full w-16"></div>
              {/* Action buttons placeholder */}
              <div className="flex space-x-2">
                <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-16"></div>
                <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-16"></div>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

/**
 * Search bar skeleton
 */
export const AiToolsSearchSkeleton: React.FC = () => {
  return (
    <div className="animate-pulse">
      <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded-lg w-full"></div>
    </div>
  );
};

/**
 * Header skeleton
 */
export const AiToolsHeaderSkeleton: React.FC = () => {
  return (
    <div className="flex items-center justify-between animate-pulse">
      <div>
        {/* Title placeholder */}
        <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-24"></div>
      </div>
      <div className="flex items-center space-x-3">
        {/* Button placeholders */}
        <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-24"></div>
        <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-20"></div>
      </div>
    </div>
  );
};

/**
 * Complete page skeleton
 */
export const AiToolsPageSkeleton: React.FC = () => {
  return (
    <main className="flex-grow flex flex-col bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      {/* Header skeleton */}
      <header className="px-6 py-4 border-b border-gray-200/80 dark:border-gray-700 bg-white/60 dark:bg-gray-800/60 backdrop-blur-lg sticky top-0 z-10">
        <AiToolsHeaderSkeleton />
      </header>

      {/* Content area skeleton */}
      <div className="flex-grow overflow-y-auto p-6" style={{ height: 0 }}>
        {/* Search skeleton */}
        <div className="mb-6">
          <AiToolsSearchSkeleton />
        </div>

        {/* Tools list skeleton */}
        <AiToolsGridSkeleton count={9} />
      </div>
    </main>
  );
};

/**
 * Error state component
 */
interface AiToolsErrorStateProps {
  error: string;
  onRetry?: () => void;
}

export const AiToolsErrorState: React.FC<AiToolsErrorStateProps> = ({ 
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
      <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">{t('common.loadFailed', '加载失败')}</h3>
      <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto mb-4">
        {error}
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 dark:bg-blue-700 hover:bg-blue-700 dark:hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
        >
          {t('common.retry', '重试')}
        </button>
      )}
    </div>
  );
};

/**
 * Empty state component
 */
interface AiToolsEmptyStateProps {
  title?: string;
  description?: string;
  showToolIcon?: boolean;
  actionButton?: React.ReactNode;
}

export const AiToolsEmptyState: React.FC<AiToolsEmptyStateProps> = ({ 
  title,
  description,
  showToolIcon = true,
  actionButton
}) => {
  const { t } = useTranslation();
  
  const displayTitle = title || t('tools.tools.installedEmpty.title', '暂无已安装的工具');
  const displayDescription = description || t('tools.tools.installedEmpty.description', '点击右上角按钮创建您的第一个工具');

  return (
    <div className="text-center py-12">
      <div className="text-gray-400 dark:text-gray-500 mb-4">
        {showToolIcon ? (
          <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
          </svg>
        ) : (
          <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2 2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
        )}
      </div>
      <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">{displayTitle}</h3>
      <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto mb-4">
        {displayDescription}
      </p>
      {actionButton && (
        <div className="mt-4">
          {actionButton}
        </div>
      )}
    </div>
  );
};

export default AiToolsGridSkeleton;
