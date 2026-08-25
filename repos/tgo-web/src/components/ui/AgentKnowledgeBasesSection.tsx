import React from 'react';
import { Plus, FolderOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { KnowledgeBaseItem } from '@/types';
import AgentKnowledgeBaseRow from './AgentKnowledgeBaseRow';

interface AgentKnowledgeBasesSectionProps {
  items: KnowledgeBaseItem[];
  disabled?: boolean;
  onAdd?: () => void;
  onRemove: (kbId: string) => void;
}

const AgentKnowledgeBasesSection: React.FC<AgentKnowledgeBasesSectionProps> = ({
  items,
  disabled = false,
  onAdd,
  onRemove,
}) => {
  const { t } = useTranslation();

  return (
    <>
      <div className="flex items-center justify-between mb-4 gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium text-gray-700 truncate">
            {t('agents.knowledge_basesSection.selectedTitle', '已选择知识库')}
          </span>
          <span className="px-2 py-1 text-xs font-medium bg-teal-100 text-teal-800 rounded-full whitespace-nowrap">
            {t('agents.knowledge_basesSection.selectedCount', '{{count}} 已选择', { count: items.length })}
          </span>
        </div>
        {onAdd && (
          <button
            type="button"
            onClick={onAdd}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-teal-700 bg-teal-100 hover:bg-teal-200 rounded-lg transition-colors shrink-0"
            disabled={disabled}
          >
            <Plus className="w-4 h-4" />
            <span>{t('agents.knowledge_basesSection.addButton', '添加知识库')}</span>
          </button>
        )}
      </div>

      <div className="space-y-2">
        {items.map((kb) => (
          <AgentKnowledgeBaseRow
            key={kb.id}
            kb={kb}
            enabled={true}
            onRemove={() => onRemove(kb.id)}
            disabled={disabled}
          />
        ))}

        {items.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <FolderOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">
              {t('agents.knowledge_basesSection.emptyTitle', '暂未添加知识库')}
            </p>
            <p className="text-xs mt-1">
              {t('agents.knowledge_basesSection.emptyDescription', '点击「添加知识库」按钮选择知识库')}
            </p>
          </div>
        )}
      </div>
    </>
  );
};

export default AgentKnowledgeBasesSection;
