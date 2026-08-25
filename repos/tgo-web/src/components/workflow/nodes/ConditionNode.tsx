/**
 * Condition Node Component
 * Branching logic in the workflow - Minimal Clean Redesign
 */

import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { GitBranch } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ConditionNodeData } from '@/types/workflow';
import NodeExecutionOverlay from '../overlays/NodeExecutionOverlay';

const ConditionNode: React.FC<NodeProps<ConditionNodeData>> = ({ id, data, selected }) => {
  const { t } = useTranslation();
  const hasCondition = Boolean(data.expression || data.variable || data.llm_prompt);
  const defaultLabel = t('workflow.node_types.condition.label', '条件判断');
  
  const getConditionSummary = () => {
    if (data.condition_type === 'expression' && data.expression) {
      return data.expression.length > 30 
        ? `${data.expression.slice(0, 30)}...` 
        : data.expression;
    }
    if (data.condition_type === 'variable' && data.variable) {
      return `${data.variable} ${data.operator || '=='} ${data.compare_value || ''}`;
    }
    if (data.condition_type === 'llm') {
      return t('workflow.node_display.llm_evaluation', 'LLM Evaluation');
    }
    return t('workflow.node_display.not_configured_condition', '未配置条件');
  };
  
  return (
    <div
      className={`
        px-5 py-4 rounded-2xl bg-white dark:bg-gray-800 shadow-sm border
        flex flex-col gap-3 min-w-[240px] transition-all duration-200 relative
        ${selected 
          ? 'border-purple-500 ring-4 ring-purple-500/10' 
          : 'border-gray-100 dark:border-gray-700 hover:shadow-md'
        }
      `}
    >
      <NodeExecutionOverlay nodeId={id} label={data.label || defaultLabel} />
      {/* Colored Side Bar */}
      <div className="absolute left-0 top-4 bottom-4 w-1 bg-purple-500 rounded-r-full" />

      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-purple-500 !border-2 !border-white dark:!border-gray-800 !shadow-sm"
      />
      
      <div className="flex items-center gap-4">
        <div className="p-2.5 rounded-xl bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400">
          <GitBranch className="w-6 h-6" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">
            {data.label || defaultLabel}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 font-mono bg-gray-50 dark:bg-gray-900/50 px-1.5 py-0.5 rounded truncate">
            {getConditionSummary()}
          </div>
        </div>
      </div>

      <div className="pt-2 border-t border-gray-50 dark:border-gray-700/50 flex items-center justify-between">
        <div className="flex gap-4">
          <div className="flex items-center gap-1.5 relative">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">{t('common.yes', 'Yes')}</span>
            <Handle
              type="source"
              position={Position.Bottom}
              id="true"
              className="!w-2 !h-2 !bg-green-500 !border-none !bottom-[-20px] !left-1/2"
            />
          </div>
          <div className="flex items-center gap-1.5 relative">
            <div className="w-2 h-2 rounded-full bg-red-500" />
            <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">{t('common.no', 'No')}</span>
            <Handle
              type="source"
              position={Position.Bottom}
              id="false"
              className="!w-2 !h-2 !bg-red-500 !border-none !bottom-[-20px] !left-1/2"
            />
          </div>
        </div>
        {!hasCondition && (
          <span className="text-[10px] bg-amber-50 dark:bg-amber-900/20 text-amber-600 px-1.5 py-0.5 rounded-md font-bold">
            {t('common.required', 'REQUIRED')}
          </span>
        )}
      </div>
    </div>
  );
};

export default memo(ConditionNode);
