/**
 * Event Node Component
 * System event trigger for workflow
 */

import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { EventNodeData } from '@/types/workflow';
import NodeExecutionOverlay from '../overlays/NodeExecutionOverlay';

const EventNode: React.FC<NodeProps<EventNodeData>> = ({ id, data, selected }) => {
  const { t } = useTranslation();
  const defaultLabel = t('workflow.node_types.event.label', '事件触发');

  return (
    <div
      className={`
        px-5 py-4 rounded-2xl bg-white dark:bg-gray-800 shadow-sm border
        flex items-center gap-4 min-w-[200px] transition-all duration-200 relative
        ${selected 
          ? 'border-green-500 ring-4 ring-green-500/10' 
          : 'border-gray-100 dark:border-gray-700 hover:shadow-md'
        }
      `}
    >
      <NodeExecutionOverlay nodeId={id} label={data.label || defaultLabel} />

      <div className="absolute left-0 top-4 bottom-4 w-1 bg-green-500 rounded-r-full" />

      <div className="p-2.5 rounded-xl bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400">
        <Zap className="w-6 h-6" />
      </div>
      
      <div className="min-w-0">
        <div className="text-sm font-bold text-gray-900 dark:text-gray-100">
          {data.label || defaultLabel}
        </div>
        <div className="text-[10px] text-purple-500 dark:text-purple-400 font-bold uppercase tracking-wider mt-0.5 truncate max-w-[120px]">
          {data.event_type || t('workflow.node_display.custom_event', 'Custom Event')}
        </div>
      </div>
      
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-green-500 !border-2 !border-white dark:!border-gray-800 !shadow-sm"
      />
    </div>
  );
};

export default memo(EventNode);

