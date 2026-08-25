/**
 * Classifier Node Component
 * Categorizes input using LLM - Minimal Clean Redesign
 */

import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { LayoutGrid } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ClassifierNodeData } from '@/types/workflow';
import NodeExecutionOverlay from '../overlays/NodeExecutionOverlay';

const ClassifierNode: React.FC<NodeProps<ClassifierNodeData>> = ({ id, data, selected }) => {
  const { t } = useTranslation();
  const hasInput = Boolean(data.input_variable);
  const categories = data.categories || [];
  const defaultLabel = t('workflow.node_types.classifier.label', '问题分类器');
  
  return (
    <div
      className={`
        px-5 py-4 rounded-2xl bg-white dark:bg-gray-800 shadow-sm border
        flex flex-col gap-3 min-w-[260px] transition-all duration-200 relative
        ${selected 
          ? 'border-orange-500 ring-4 ring-orange-500/10' 
          : 'border-gray-100 dark:border-gray-700 hover:shadow-md'
        }
      `}
    >
      <NodeExecutionOverlay nodeId={id} label={data.label || defaultLabel} />
      {/* Colored Side Bar */}
      <div className="absolute left-0 top-4 bottom-4 w-1 bg-orange-500 rounded-r-full" />

      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-orange-500 !border-2 !border-white dark:!border-gray-800 !shadow-sm"
      />
      
      <div className="flex items-center gap-4">
        <div className="p-2.5 rounded-xl bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400">
          <LayoutGrid className="w-6 h-6" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">
            {data.label || defaultLabel}
          </div>
          <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">
            {t('workflow.node_display.classifier_categories_count', `${categories.length} 个分类`, { count: categories.length })}
          </div>
        </div>
      </div>

      <div className="bg-gray-50 dark:bg-gray-900/50 p-3 rounded-xl border border-gray-100/50 dark:border-gray-700/50">
        <div className="text-[11px] text-gray-400 font-medium mb-1 uppercase tracking-wider text-center">{t('workflow.node_display.classifier_output', '分类输出')}</div>
        <div className="flex flex-wrap gap-2 justify-center mt-2">
          {categories.map((cat) => (
            <div key={cat.id} className="px-2 py-1 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-lg text-[10px] font-bold text-gray-600 dark:text-gray-300 shadow-sm">
              {cat.name}
            </div>
          ))}
        </div>
      </div>
      
      {/* Category Handles */}
      <div className="absolute left-0 right-0 -bottom-1 flex justify-around px-10 pointer-events-none">
        {categories.map((cat) => (
          <Handle
            key={cat.id}
            type="source"
            position={Position.Bottom}
            id={cat.id}
            className="!relative !w-2 !h-2 !bg-orange-500 !border-none !translate-x-0 !left-auto !pointer-events-auto"
          />
        ))}
      </div>
      
      <div className="pt-2 border-t border-gray-50 dark:border-gray-700/50 flex items-center justify-between">
        <span className="text-[10px] text-gray-400 uppercase font-medium tracking-wider">
          {hasInput ? `${t('workflow.node_display.input_label', 'In')}: ${data.input_variable}` : t('workflow.node_display.input_required', 'Input Required')}
        </span>
        {!hasInput && (
          <span className="text-[10px] bg-amber-50 dark:bg-amber-900/20 text-amber-600 px-1.5 py-0.5 rounded-md font-bold">
            {t('common.required', 'REQUIRED')}
          </span>
        )}
      </div>
    </div>
  );
};

export default memo(ClassifierNode);

