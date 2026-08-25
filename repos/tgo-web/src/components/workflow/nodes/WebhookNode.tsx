/**
 * Webhook Node Component
 * HTTP callback trigger for workflow
 */

import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { WebhookNodeData } from '@/types/workflow';
import NodeExecutionOverlay from '../overlays/NodeExecutionOverlay';

const WebhookNode: React.FC<NodeProps<WebhookNodeData>> = ({ id, data, selected }) => {
  const { t } = useTranslation();
  const defaultLabel = t('workflow.node_types.webhook.label', 'Webhook');

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
        <Globe className="w-6 h-6" />
      </div>
      
      <div className="min-w-0">
        <div className="text-sm font-bold text-gray-900 dark:text-gray-100">
          {data.label || defaultLabel}
        </div>
        <div className="text-[10px] text-blue-500 dark:text-blue-400 font-bold uppercase tracking-wider mt-0.5 truncate max-w-[120px]">
          {data.method || 'POST'} {data.path ? `/${data.path}` : '/'}
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

export default memo(WebhookNode);

