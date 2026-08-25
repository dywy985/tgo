/**
 * Agent Node Component
 * Calls another AI Agent in the workflow - Minimal Clean Redesign
 */

import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Bot } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AgentNodeData } from '@/types/workflow';
import NodeExecutionOverlay from '../overlays/NodeExecutionOverlay';

const AgentNode: React.FC<NodeProps<AgentNodeData>> = ({ id, data, selected }) => {
  const { t } = useTranslation();
  const hasAgent = Boolean(data.agent_id);
  const defaultLabel = t('workflow.node_types.agent.label', 'AI Agent');
  
  return (
    <div
      className={`
        px-6 py-5 rounded-[1.5rem] bg-white dark:bg-gray-800 shadow-sm border transition-all duration-300 relative
        min-w-[260px] group
        ${selected 
          ? 'border-blue-500 ring-[6px] ring-blue-500/10 shadow-xl scale-[1.02]' 
          : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-800 hover:shadow-lg'
        }
      `}
    >
      <NodeExecutionOverlay nodeId={id} label={data.label || defaultLabel} />
      
      {/* Decorative accent */}
      <div className={`absolute left-0 top-6 bottom-6 w-1 rounded-r-full transition-all duration-300 ${selected ? 'bg-blue-500 h-10' : 'bg-blue-200 dark:bg-blue-900 group-hover:bg-blue-400'}`} />

      <Handle
        type="target"
        position={Position.Top}
        className="!w-3.5 !h-3.5 !bg-blue-500 !border-[3px] !border-white dark:!border-gray-800 !shadow-md transition-transform hover:scale-125"
      />
      
      <div className="flex items-center gap-4 mb-4">
        <div className="p-3 rounded-2xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 shadow-sm border border-blue-100/50 dark:border-blue-800/30">
          <Bot className="w-6 h-6" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-bold text-gray-900 dark:text-gray-100 truncate tracking-tight">
            {data.label || defaultLabel}
          </div>
          <div className="text-[10px] text-blue-600 dark:text-blue-400 font-bold uppercase tracking-widest mt-0.5 bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 rounded-md inline-block border border-blue-100/50 dark:border-blue-800/30">
            {hasAgent ? (data.agent_name || data.agent_id) : t('workflow.node_display.not_configured_agent', '未配置员工')}
          </div>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700/50 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-green-400"></div>
          <span className="text-[10px] text-gray-500 dark:text-gray-400 uppercase font-bold tracking-widest">
            {t('workflow.node_display.output', 'Output')}
          </span>
        </div>
        {!hasAgent && (
          <span className="text-[9px] bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-lg font-bold border border-amber-100 dark:border-amber-800/50 animate-pulse">
            {t('common.required', '配置未完成')}
          </span>
        )}
      </div>
      
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3.5 !h-3.5 !bg-blue-500 !border-[3px] !border-white dark:!border-gray-800 !shadow-md transition-transform hover:scale-125"
      />
    </div>
  );
};

export default memo(AgentNode);
