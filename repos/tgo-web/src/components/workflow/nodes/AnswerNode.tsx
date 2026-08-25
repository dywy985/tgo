/**
 * Answer Node Component
 * Response/Output point of a workflow
 */

import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { MessageSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AnswerNodeData } from '@/types/workflow';
import NodeExecutionOverlay from '../overlays/NodeExecutionOverlay';

const AnswerNode: React.FC<NodeProps<AnswerNodeData>> = ({ id, data, selected }) => {
  const { t } = useTranslation();
  const defaultLabel = t('workflow.node_types.answer.label', '直接回复');

  const getOutputSummary = () => {
    switch (data.output_type) {
      case 'variable':
        return data.output_variable ? `REF: ${data.output_variable}` : t('workflow.node_display.not_configured_variable', '未配置变量');
      case 'template':
        return t('workflow.node_display.template_output', '文本模板');
      case 'structured':
        return t('workflow.node_display.fields_count', `${data.output_structure?.length || 0} 个字段`, { count: data.output_structure?.length || 0 });
      default:
        return 'Workflow Output';
    }
  };

  return (
    <div
      className={`
        px-6 py-5 rounded-[1.5rem] bg-white dark:bg-gray-800 shadow-sm border transition-all duration-300 relative
        min-w-[240px] group
        ${selected 
          ? 'border-indigo-500 ring-[6px] ring-indigo-500/10 shadow-xl scale-[1.02]' 
          : 'border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-800 hover:shadow-lg'
        }
      `}
    >
      <NodeExecutionOverlay nodeId={id} label={data.label || defaultLabel} />
      
      {/* Decorative accent */}
      <div className={`absolute left-0 top-6 bottom-6 w-1 rounded-r-full transition-all duration-300 ${selected ? 'bg-indigo-500 h-10' : 'bg-indigo-200 dark:bg-indigo-900 group-hover:bg-indigo-400'}`} />

      <Handle
        type="target"
        position={Position.Top}
        className="!w-3.5 !h-3.5 !bg-indigo-500 !border-[3px] !border-white dark:!border-gray-800 !shadow-md transition-transform hover:scale-125"
      />
      
      <div className="flex items-center gap-4">
        <div className="p-3 rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 shadow-sm border border-indigo-100/50 dark:border-indigo-800/30">
          <MessageSquare className="w-6 h-6" />
        </div>
        
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-bold text-gray-900 dark:text-gray-100 truncate tracking-tight">
            {data.label || defaultLabel}
          </div>
          <div className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold uppercase tracking-widest mt-0.5 bg-indigo-50 dark:bg-indigo-900/30 px-1.5 py-0.5 rounded-md inline-block border border-indigo-100/50 dark:border-indigo-800/30 truncate max-w-full">
            {getOutputSummary()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default memo(AnswerNode);

