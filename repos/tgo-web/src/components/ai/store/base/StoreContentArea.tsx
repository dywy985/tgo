import React from 'react';
import { Loader2, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { StoreContentAreaProps } from '../types';

const StoreContentArea: React.FC<StoreContentAreaProps> = ({ 
  loading, 
  isEmpty, 
  emptyIcon, 
  emptyTitle, 
  emptyDescription, 
  loadingText,
  themeColor = 'blue',
  children 
}) => {
  const { t } = useTranslation();

  const colorClasses = {
    blue: 'text-blue-600',
    indigo: 'text-indigo-600',
    purple: 'text-purple-600'
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center h-full gap-4">
        <Loader2 className={`w-10 h-10 animate-spin ${colorClasses[themeColor]}`} />
        <p className="text-sm font-bold text-gray-400 animate-pulse">
          {loadingText || t('common.loading', '加载中...')}
        </p>
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center h-full text-center p-8">
        <div className="w-20 h-20 rounded-3xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-300 dark:text-gray-700 mb-6">
          {emptyIcon || <Search className="w-10 h-10" />}
        </div>
        <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          {emptyTitle || t('tools.store.noResults', '未找到匹配的结果')}
        </h3>
        <p className="text-gray-500 dark:text-gray-400">
          {emptyDescription || t('tools.store.noResultsDesc', '试试搜索其他关键词或切换分类')}
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
      <div className="max-w-[1200px] mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {children}
        </div>
      </div>
    </div>
  );
};

export default StoreContentArea;
