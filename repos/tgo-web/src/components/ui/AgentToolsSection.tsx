import React from 'react';
import { Plus, Wrench } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AiTool } from '@/types';
import ToolRow from './ToolRow';

interface AgentToolsSectionProps {
  tools: AiTool[];
  toolConfigs?: Record<string, Record<string, any>>;
  disabled?: boolean;
  onAdd?: () => void;
  onRemove: (toolId: string) => void;
}

const AgentToolsSection: React.FC<AgentToolsSectionProps> = ({
  tools,
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
            {t('agents.toolsSection.selectedTitle', '已选择工具')}
          </span>
          <span className="px-2 py-1 text-xs font-medium bg-orange-100 text-orange-800 rounded-full whitespace-nowrap">
            {t('agents.toolsSection.selectedCount', '{{count}} 已选择', { count: tools.length })}
          </span>
        </div>
        {onAdd && (
          <button
            type="button"
            onClick={onAdd}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-orange-700 bg-orange-100 hover:bg-orange-200 rounded-lg transition-colors shrink-0"
            disabled={disabled}
          >
            <Plus className="w-4 h-4" />
            <span>{t('agents.toolsSection.addButton', '添加工具')}</span>
          </button>
        )}
      </div>

      <div className="space-y-3">
        {tools.map((tool) => (
          <ToolRow
            key={tool.id}
            tool={tool}
            onRemove={() => onRemove(tool.id)}
            disabled={disabled}
          />
        ))}

        {tools.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <Wrench className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">
              {t('agents.toolsSection.emptyTitle', '暂未添加工具')}
            </p>
            <p className="text-xs mt-1">
              {t('agents.toolsSection.emptyDescription', '点击「添加工具」按钮选择工具')}
            </p>
          </div>
        )}
      </div>
    </>
  );
};

export default AgentToolsSection;
