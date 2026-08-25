/**
 * LLM Node Component
 * Direct LLM call in the workflow - Minimal Clean Redesign
 */

import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { MessageSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { LLMNodeData } from '@/types/workflow';
import NodeExecutionOverlay from '../overlays/NodeExecutionOverlay';

const LLMNode: React.FC<NodeProps<LLMNodeData>> = ({ id, data, selected }) => {
  const { t } = useTranslation();
  const hasPrompt = Boolean(data.user_prompt);
  const defaultLabel = t('workflow.node_types.llm.label', 'LLM调用');
  
  const getPromptPreview = () => {
    if (!data.user_prompt) return t('workflow.node_display.not_configured_prompt', '未配置提示词');
    return data.user_prompt.length > 50 
      ? `${data.user_prompt.slice(0, 50)}...` 
      : data.user_prompt;
  };
  
  return (
    <div
      className={`
        px-6 py-5 rounded-[1.5rem] bg-white dark:bg-gray-800 shadow-sm border transition-all duration-300 relative
        min-w-[280px] group
        ${selected 
          ? 'border-cyan-500 ring-[6px] ring-cyan-500/10 shadow-xl scale-[1.02]' 
          : 'border-gray-200 dark:border-gray-700 hover:border-cyan-300 dark:hover:border-cyan-800 hover:shadow-lg'
        }
      `}
    >
      <NodeExecutionOverlay nodeId={id} label={data.label || defaultLabel} />
      
      {/* Decorative accent */}
      <div className={`absolute left-0 top-6 bottom-6 w-1 rounded-r-full transition-all duration-300 ${selected ? 'bg-cyan-500 h-10' : 'bg-cyan-200 dark:bg-cyan-900 group-hover:bg-cyan-400'}`} />

      <Handle
        type="target"
        position={Position.Top}
        className="!w-3.5 !h-3.5 !bg-cyan-500 !border-[3px] !border-white dark:!border-gray-800 !shadow-md transition-transform hover:scale-125"
      />
      
      <div className="flex items-center gap-4 mb-4">
        <div className="p-3 rounded-2xl bg-cyan-50 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400 shadow-sm border border-cyan-100/50 dark:border-cyan-800/30">
          <MessageSquare className="w-6 h-6" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-bold text-gray-900 dark:text-gray-100 truncate tracking-tight">
            {data.label || defaultLabel}
          </div>
          {data.model_name ? (
            <div className="text-[10px] text-cyan-600 dark:text-cyan-400 font-bold uppercase tracking-widest mt-0.5 bg-cyan-50 dark:bg-cyan-900/30 px-1.5 py-0.5 rounded-md inline-block border border-cyan-100/50 dark:border-cyan-800/30">
              {data.model_name}
            </div>
          ) : (
            <div className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">LLM INFERENCE</div>
          )}
        </div>
      </div>
      
      <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-2xl border border-gray-100 dark:border-gray-700/50 shadow-inner group-hover:bg-white dark:group-hover:bg-gray-800 transition-colors">
        <div className="text-[9px] text-gray-400 font-bold mb-1.5 uppercase tracking-widest flex items-center gap-1.5">
          <div className="w-1 h-1 rounded-full bg-cyan-400"></div>
          {t('workflow.node_display.prompt_preview', 'Prompt Preview')}
        </div>
        <p className="text-[11px] text-gray-600 dark:text-gray-300 line-clamp-2 leading-relaxed font-medium">
          {getPromptPreview()}
        </p>
      </div>
      
      <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700/50 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-green-400"></div>
          <span className="text-[10px] text-gray-500 dark:text-gray-400 uppercase font-bold tracking-widest">
            {t('workflow.node_display.output', 'Output')}
          </span>
        </div>
        {!hasPrompt && (
          <span className="text-[9px] bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-lg font-bold border border-amber-100 dark:border-amber-800/50 animate-pulse">
            {t('common.required', '配置未完成')}
          </span>
        )}
      </div>
      
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3.5 !h-3.5 !bg-cyan-500 !border-[3px] !border-white dark:!border-gray-800 !shadow-md transition-transform hover:scale-125"
      />
    </div>
  );
};

export default memo(LLMNode);
