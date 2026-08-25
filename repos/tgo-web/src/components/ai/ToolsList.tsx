import React from 'react';
import { LuWrench } from 'react-icons/lu';
import ToolCard from './ToolCard';

import { useTranslation } from 'react-i18next';
import type { AiTool, ToolCategory } from '@/types';

interface ToolsListProps {
  tools: AiTool[];
  selectedCategory: ToolCategory;
  onToolAction: (actionType: string, tool: AiTool) => void;
  onShowToast?: (type: 'success' | 'error' | 'warning' | 'info', title: string, message?: string) => void;
  className?: string;
}

/**
 * 工具列表组件
 */
const ToolsList: React.FC<ToolsListProps> = ({
  tools,
  selectedCategory,
  onToolAction,
  onShowToast,
  className = ''
}) => {
  const { t } = useTranslation();
  if (tools.length === 0) {
    return (
      <div className={`text-center py-12 ${className}`}>
        <div className="text-gray-400 dark:text-gray-500 mb-4">
          <LuWrench className="mx-auto h-12 w-12" />
        </div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">{t('tools.list.emptyTitle', '暂无工具')}</h3>
        <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto">
          {selectedCategory === 'all'
            ? t('tools.list.emptyDescriptionAll', '点击"添加工具"按钮开始添加您的第一个工具')
            : t('tools.list.emptyDescriptionCategory', { category: t(`tools.categories.${selectedCategory}`, '未知分类') })
          }
        </p>
        <div className="mt-6">
          <button className="inline-flex items-center px-4 py-2 bg-blue-500 dark:bg-blue-600 text-white text-sm rounded-md hover:bg-blue-600 dark:hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors">
            {t('tools.list.emptyAction', '开始添加工具')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500 ${className}`}>
      {tools.map((tool) => (
        <ToolCard
          key={tool.id}
          tool={tool}
          onAction={onToolAction}
          onShowToast={onShowToast}
        />
      ))}
    </div>
  );
};

export default ToolsList;
