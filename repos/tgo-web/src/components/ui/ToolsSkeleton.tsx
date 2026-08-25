/**
 * Tool Tools Loading Skeleton Component
 * Provides loading states for Tool tools list
 */

import React from 'react';

/**
 * Single tool card skeleton
 */
export const AiToolCardSkeleton: React.FC = () => {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 animate-pulse">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center space-x-3">
          {/* Icon placeholder */}
          <div className="w-12 h-12 bg-gray-200 rounded-lg"></div>
          <div>
            {/* Title placeholder */}
            <div className="h-5 bg-gray-200 rounded w-32 mb-2"></div>
            {/* Author placeholder */}
            <div className="h-3 bg-gray-200 rounded w-20"></div>
          </div>
        </div>
        {/* Status badge placeholder */}
        <div className="h-6 bg-gray-200 rounded-full w-16"></div>
      </div>

      {/* Description placeholder */}
      <div className="space-y-2 mb-4">
        <div className="h-4 bg-gray-200 rounded w-full"></div>
        <div className="h-4 bg-gray-200 rounded w-3/4"></div>
      </div>

      {/* Tags placeholder */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="h-6 bg-gray-200 rounded-full w-16"></div>
        <div className="h-6 bg-gray-200 rounded-full w-20"></div>
        <div className="h-6 bg-gray-200 rounded-full w-14"></div>
      </div>

      {/* Stats placeholder */}
      <div className="flex items-center justify-between text-sm mb-4">
        <div className="flex items-center space-x-4">
          <div className="h-4 bg-gray-200 rounded w-16"></div>
          <div className="h-4 bg-gray-200 rounded w-20"></div>
        </div>
        <div className="h-4 bg-gray-200 rounded w-12"></div>
      </div>

      {/* Action buttons placeholder */}
      <div className="flex items-center justify-between">
        <div className="h-8 bg-gray-200 rounded w-20"></div>
        <div className="h-8 bg-gray-200 rounded w-16"></div>
      </div>
    </div>
  );
};

/**
 * Tools grid skeleton
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
        <AiToolCardSkeleton key={index} />
      ))}
    </div>
  );
};

/**
 * Search bar skeleton
 */
export const AiToolsSearchSkeleton: React.FC = () => {
  return (
    <div className="flex flex-col lg:flex-row gap-4 animate-pulse">
      {/* Search input placeholder */}
      <div className="flex-1 relative">
        <div className="h-10 bg-gray-200 rounded-lg w-full"></div>
      </div>

      {/* Sort dropdown placeholder */}
      <div className="flex items-center space-x-2">
        <div className="w-4 h-4 bg-gray-200 rounded"></div>
        <div className="h-10 bg-gray-200 rounded-lg w-32"></div>
      </div>
    </div>
  );
};

/**
 * Category filter skeleton
 */
export const AiToolsCategoryFilterSkeleton: React.FC = () => {
  return (
    <div className="flex flex-wrap gap-2 animate-pulse">
      {Array.from({ length: 6 }, (_, index) => (
        <div 
          key={index} 
          className="h-8 bg-gray-200 rounded-full w-20"
        ></div>
      ))}
    </div>
  );
};

/**
 * Header skeleton
 */
export const AiToolsHeaderSkeleton: React.FC = () => {
  return (
    <div className="flex items-center justify-between animate-pulse">
      <div className="flex items-center space-x-4">
        {/* Back button placeholder */}
        <div className="w-8 h-8 bg-gray-200 rounded-lg"></div>
        <div>
          {/* Title placeholder */}
          <div className="h-6 bg-gray-200 rounded w-24 mb-2"></div>
          {/* Subtitle placeholder */}
          <div className="h-4 bg-gray-200 rounded w-32"></div>
        </div>
      </div>
      {/* Results count placeholder */}
      <div className="h-4 bg-gray-200 rounded w-20"></div>
    </div>
  );
};

/**
 * Complete page skeleton
 */
export const AiToolsPageSkeleton: React.FC = () => {
  return (
    <main className="flex-grow flex flex-col bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header skeleton */}
      <header className="px-6 py-4 border-b border-gray-200/80 bg-white/60 backdrop-blur-lg sticky top-0 z-10">
        <AiToolsHeaderSkeleton />
      </header>

      {/* Search and filters skeleton */}
      <div className="px-6 py-4 bg-white/40 border-b border-gray-200/60">
        <AiToolsSearchSkeleton />
      </div>

      {/* Category filter skeleton */}
      <div className="px-6 py-3 bg-white/20">
        <AiToolsCategoryFilterSkeleton />
      </div>

      {/* Content area skeleton */}
      <div className="flex-grow overflow-y-auto p-6" style={{ height: 0 }}>
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
  return (
    <div className="text-center py-12">
      <div className="text-red-400 mb-4">
        <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
      </div>
      <h3 className="text-lg font-medium text-gray-900 mb-2">加载失败</h3>
      <p className="text-gray-500 max-w-md mx-auto mb-4">
        {error}
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
        >
          重试
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
  showSearchIcon?: boolean;
}

export const AiToolsEmptyState: React.FC<AiToolsEmptyStateProps> = ({ 
  title = "未找到相关工具",
  description = "尝试调整搜索关键词或选择不同的分类",
  showSearchIcon = true
}) => {
  return (
    <div className="text-center py-12">
      <div className="text-gray-400 mb-4">
        {showSearchIcon ? (
          <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        ) : (
          <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2 2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
        )}
      </div>
      <h3 className="text-lg font-medium text-gray-900 mb-2">{title}</h3>
      <p className="text-gray-500 max-w-md mx-auto">
        {description}
      </p>
    </div>
  );
};

export default AiToolsGridSkeleton;
