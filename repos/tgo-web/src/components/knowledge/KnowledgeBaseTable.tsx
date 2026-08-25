import React from 'react';
import Icon from '../ui/Icon';
import Button from '../ui/Button';
import { getTagClasses } from '@/utils/tagColors';
import type { KnowledgeBaseItem } from '@/types';

type SortColumn = 'title' | 'updatedAt' | 'views' | 'status';
type SortDirection = 'asc' | 'desc';

interface KnowledgeBaseTableProps {
  knowledgeBases?: KnowledgeBaseItem[];
  onAction?: (actionType: string, knowledgeBase: KnowledgeBaseItem) => void;
  onSort?: (column: SortColumn, direction: SortDirection) => void;
  sortColumn?: SortColumn;
  sortDirection?: SortDirection;
}

/**
 * Knowledge base table component
 */
const KnowledgeBaseTable: React.FC<KnowledgeBaseTableProps> = ({ 
  knowledgeBases = [], 
  onAction, 
  onSort,
  sortColumn,
  sortDirection 
}) => {
  const handleSort = (columnKey: SortColumn): void => {
    if (onSort) {
      const newDirection: SortDirection = sortColumn === columnKey && sortDirection === 'asc' ? 'desc' : 'asc';
      onSort(columnKey, newDirection);
    }
  };

  const renderSortIcon = (columnKey: SortColumn): React.ReactNode => {
    if (sortColumn !== columnKey) {
      return <Icon name="ArrowUpDown" size={12} className="ml-1" />;
    }
    return (
      <Icon 
        name={sortDirection === 'asc' ? 'ArrowUp' : 'ArrowDown'} 
        size={12} 
        className="ml-1" 
      />
    );
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'published':
        return 'bg-green-100 text-green-700';
      case 'draft':
        return 'bg-yellow-100 text-yellow-700';
      case 'archived':
        return 'bg-gray-100 text-gray-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const getStatusText = (status: string): string => {
    switch (status) {
      case 'published':
        return '已发布';
      case 'draft':
        return '草稿';
      case 'archived':
        return '已归档';
      default:
        return '未知';
    }
  };

  const handleAction = (actionType: string, knowledgeBase: KnowledgeBaseItem): void => {
    onAction?.(actionType, knowledgeBase);
  };

  if (knowledgeBases.length === 0) {
    return (
      <div className="bg-white/80 backdrop-blur-md rounded-lg shadow-sm border border-gray-200/60 p-12">
        <div className="text-center text-gray-500">
          <Icon name="FolderOpen" size={48} className="mx-auto mb-4 text-gray-300" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">暂无知识库</h3>
          <p>点击"新建知识库"按钮开始创建您的第一个知识库</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white/80 backdrop-blur-md rounded-lg shadow-sm border border-gray-200/60 overflow-hidden">
      {/* Table Header */}
      <div className="bg-gray-50/80 border-b border-gray-200/60">
        <div className="grid grid-cols-12 gap-4 px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
          <div 
            className="col-span-4 flex items-center cursor-pointer hover:text-gray-700"
            onClick={() => handleSort('title')}
          >
            标题
            {renderSortIcon('title')}
          </div>
          <div className="col-span-2">分类</div>
          <div 
            className="col-span-2 flex items-center cursor-pointer hover:text-gray-700"
            onClick={() => handleSort('views')}
          >
            浏览量
            {renderSortIcon('views')}
          </div>
          <div 
            className="col-span-2 flex items-center cursor-pointer hover:text-gray-700"
            onClick={() => handleSort('updatedAt')}
          >
            更新时间
            {renderSortIcon('updatedAt')}
          </div>
          <div className="col-span-1">状态</div>
          <div className="col-span-1">操作</div>
        </div>
      </div>

      {/* Table Body */}
      <div className="divide-y divide-gray-200/60">
        {knowledgeBases.map((kb) => (
          <div key={kb.id} className="grid grid-cols-12 gap-4 px-6 py-4 hover:bg-gray-50/50 transition-colors">
            {/* Title and Content */}
            <div className="col-span-4">
              <h4 className="text-sm font-medium text-gray-900 mb-1">{kb.title}</h4>
              <p className="text-xs text-gray-500 line-clamp-2">{kb.content}</p>
              <div className="flex flex-wrap gap-1 mt-2">
                {kb.tags.slice(0, 2).map((tag, index) => {
                  const tagName = typeof tag === 'string' ? tag : tag.name;
                  return (
                    <span
                      key={index}
                      className={getTagClasses(tagName, {
                        size: 'sm',
                        includeHover: false,
                        includeBorder: true,
                        rounded: true
                      })}
                    >
                      {tagName}
                    </span>
                  );
                })}
                {kb.tags.length > 2 && (
                  <span className="text-xs text-gray-400">+{kb.tags.length - 2}</span>
                )}
              </div>
            </div>

            {/* Category */}
            <div className="col-span-2 flex items-center">
              <span className="text-sm text-gray-600">{kb.category}</span>
            </div>

            {/* Views */}
            <div className="col-span-2 flex items-center">
              <span className="text-sm text-gray-900">{kb.views}</span>
            </div>

            {/* Updated At */}
            <div className="col-span-2 flex items-center">
              <div>
                <p className="text-sm text-gray-900">{kb.updatedAt}</p>
                <p className="text-xs text-gray-500">by {kb.author}</p>
              </div>
            </div>

            {/* Status */}
            <div className="col-span-1 flex items-center">
              <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(kb.status)}`}>
                {getStatusText(kb.status)}
              </span>
            </div>

            {/* Actions */}
            <div className="col-span-1 flex items-center space-x-1">
              <Button
                variant="icon"
                icon="Eye"
                size="sm"
                title="查看"
                className="text-gray-400 hover:text-gray-600"
                onClick={() => handleAction('view', kb)}
              />
              <Button
                variant="icon"
                icon="Edit"
                size="sm"
                title="编辑"
                className="text-gray-400 hover:text-gray-600"
                onClick={() => handleAction('edit', kb)}
              />
              <Button
                variant="icon"
                icon="Share"
                size="sm"
                title="分享"
                className="text-gray-400 hover:text-gray-600"
                onClick={() => handleAction('share', kb)}
              />
              <Button
                variant="icon"
                icon="MoreHorizontal"
                size="sm"
                title="更多"
                className="text-gray-400 hover:text-gray-600"
                onClick={() => handleAction('menu', kb)}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default KnowledgeBaseTable;
