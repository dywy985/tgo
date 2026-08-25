import React from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, RefreshCw, Upload, Search } from 'lucide-react';
import { getTagClasses } from '@/utils/tagColors';

interface KnowledgeBaseHeaderProps {
  knowledgeBase: {
    id: string;
    name: string;
    description?: string;
    category?: string;
    tags?: string[] | any[];
  };
  onBack: () => void;
  onRefresh: () => void;
  onToggleUpload: () => void;
  isUploadVisible: boolean;
  // Search and filter props
  searchTerm: string;
  onSearchChange: (term: string) => void;
  fileTypeFilter: string;
  onFilterChange: (filter: string) => void;
  // Stats props
  totalDocuments: number;
  totalSize: string;
  lastUpdated: string;
}

/**
 * Knowledge Base Header Component
 * Based on the HTML reference design
 */
export const KnowledgeBaseHeader: React.FC<KnowledgeBaseHeaderProps> = ({
  knowledgeBase,
  onBack,
  onRefresh,
  onToggleUpload,
  isUploadVisible,
  searchTerm,
  onSearchChange,
  fileTypeFilter,
  onFilterChange,
  totalDocuments,
  totalSize,
  lastUpdated
}) => {
  const { t } = useTranslation();



  return (
    <header className="px-6 py-4 border-b border-gray-200/80 dark:border-gray-700/80 sticky top-0 bg-white/60 dark:bg-gray-800/60 backdrop-blur-lg z-10">
      {/* Main Header Row - matches HTML reference structure */}
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-4">
          {/* Back Button */}
          <button
            onClick={onBack}
            className="p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-200/70 dark:hover:bg-gray-700/70 rounded-md transition-colors duration-200"
            title={t('knowledge.detail.backToList')}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          {/* Title and Description */}
          <div>
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
              {knowledgeBase.name}
            </h2>
            {knowledgeBase.description && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                {knowledgeBase.description}
              </p>
            )}

            {/* Tags Display */}
            {knowledgeBase.tags && knowledgeBase.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {knowledgeBase.tags.map((tag: any, tagIndex: number) => {
                  const tagName = typeof tag === 'string' ? tag : tag.name || String(tag);
                  return (
                    <span
                      key={tagIndex}
                      className={getTagClasses(tagName, {
                        size: 'sm',
                        includeHover: true,
                        includeBorder: true,
                        rounded: true
                      })}
                    >
                      {tagName}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-3">
          <button
            onClick={onRefresh}
            className="p-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-200/70 dark:hover:bg-gray-700/70 rounded-md transition-colors duration-200"
            title={t('knowledge.detail.refresh')}
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <button
            onClick={onToggleUpload}
            className={`flex items-center px-3 py-1.5 text-sm rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 transition-colors duration-200 ${
              isUploadVisible
                ? 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600'
                : 'bg-blue-500 dark:bg-blue-600 text-white hover:bg-blue-600 dark:hover:bg-blue-700'
            }`}
          >
            <Upload className="w-4 h-4 mr-1" />
            <span>{t('knowledge.detail.uploadDocument')}</span>
          </button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="mt-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="relative flex-grow max-w-xs">
          <input
            type="text"
            placeholder={t('knowledge.detail.searchPlaceholder')}
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-300/70 dark:border-gray-600 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white/80 dark:bg-gray-700/80 dark:text-gray-100 dark:placeholder-gray-400"
          />
          <Search className="w-4 h-4 absolute left-2.5 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500" />
        </div>

        <div className="flex items-center space-x-2 flex-shrink-0">
          <span className="text-sm text-gray-500 dark:text-gray-400">{t('knowledge.detail.filter')}:</span>
          <select
            value={fileTypeFilter}
            onChange={(e) => onFilterChange(e.target.value)}
            className="text-sm border border-gray-300/70 dark:border-gray-600 rounded-md py-1.5 pl-2 pr-7 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white/80 dark:bg-gray-700/80 dark:text-gray-100 appearance-none"
          >
            <option value="">{t('knowledge.detail.allTypes')}</option>
            <option value="pdf">PDF</option>
            <option value="doc">Word</option>
            <option value="txt">文本</option>
            <option value="xlsx">Excel</option>
            <option value="ppt">PowerPoint</option>
          </select>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="mt-3 flex items-center space-x-6 text-sm text-gray-600 dark:text-gray-300">
        <span>{t('knowledge.detail.totalDocuments', { count: totalDocuments })}</span>
        <span>{t('knowledge.detail.totalSize', { size: totalSize })}</span>
        <span>{t('knowledge.detail.lastUpdated', { date: lastUpdated })}</span>
      </div>
    </header>
  );
};
