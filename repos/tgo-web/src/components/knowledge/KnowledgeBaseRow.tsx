import React from 'react';
import { getIconComponent, getIconColor } from '@/components/knowledge/IconPicker';
import Icon from '../ui/Icon';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import { getTagClasses } from '@/utils/tagColors';
import { KNOWLEDGE_BASE_STATUS } from '@/constants/knowledgeBase';
import type { KnowledgeBaseItem } from '@/types';

interface KnowledgeBaseRowProps {
  knowledgeBase: KnowledgeBaseItem;
  onAction?: (actionType: string, knowledgeBase: KnowledgeBaseItem) => void;
}

/**
 * Knowledge base table row component
 */
const KnowledgeBaseRow: React.FC<KnowledgeBaseRowProps> = ({ knowledgeBase, onAction }) => {
  const statusConfig = KNOWLEDGE_BASE_STATUS[knowledgeBase.status];

  const handleAction = (actionType: string): void => {
    onAction?.(actionType, knowledgeBase);
  };



  return (
    <div className="grid grid-cols-[minmax(0,_3fr)_1fr_1fr_1fr_auto] gap-4 px-4 py-3 items-center border-b border-gray-200/60 hover:bg-gray-50/30 transition-colors">
      {/* Name and Description */}
      <div className="flex items-start space-x-3">
        {(() => {
          const IconCmp = getIconComponent(knowledgeBase.icon as any);
          const color = getIconColor(knowledgeBase.icon as any);
          return (
            <IconCmp className={`w-5 h-5 ${color} flex-shrink-0 mt-0.5`} />
          );
        })()}
        <div>
          <p className="text-sm font-medium text-gray-800">
            {knowledgeBase.name || knowledgeBase.title}
          </p>
          <p className="text-xs text-gray-500 mt-1 leading-snug">
            {knowledgeBase.description || knowledgeBase.content}
          </p>
          {knowledgeBase.tags && knowledgeBase.tags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {knowledgeBase.tags.map((tag, index) => {
                const tagName = typeof tag === 'string' ? tag : tag.name;
                return (
                  <span
                    key={index}
                    className={getTagClasses(tagName, {
                      size: 'sm',
                      includeHover: false,
                      includeBorder: false,
                      rounded: true
                    })}
                    style={{ fontSize: '10px' }} // Override for extra small size
                  >
                    {tagName}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Document Count */}
      <div className="text-sm text-gray-600">
        {(knowledgeBase.fileCount ?? knowledgeBase.views ?? 0)} 文件
      </div>

      {/* Last Updated */}
      <div className="text-sm text-gray-600 flex items-center">
        <Icon name="Clock" size={14} className="mr-1 text-gray-400" />
        {knowledgeBase.lastUpdated || knowledgeBase.updatedAt}
      </div>

      {/* Status */}
      <div>
        <Badge 
          variant="auto"
          size="sm"
          className={`${statusConfig.bgColor} ${statusConfig.textColor} px-2 py-0.5 rounded-full`}
        >
          {statusConfig.label}
        </Badge>
      </div>

      {/* Actions */}
      <div className="flex justify-end space-x-2">
        <Button
          variant="icon"
          icon="Pencil"
          size="sm"
          title="编辑"
          className="text-gray-400 hover:text-blue-600"
          onClick={() => handleAction('edit')}
        />
        <Button
          variant="icon"
          icon="Share2"
          size="sm"
          title="分享"
          className="text-gray-400 hover:text-blue-600"
          onClick={() => handleAction('share')}
        />
        <Button
          variant="icon"
          icon="Trash2"
          size="sm"
          title="删除"
          className="text-gray-400 hover:text-red-600"
          onClick={() => handleAction('delete')}
        />
      </div>
    </div>
  );
};

export default KnowledgeBaseRow;
