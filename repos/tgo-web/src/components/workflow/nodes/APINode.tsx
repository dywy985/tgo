/**
 * API Node Component
 * External HTTP call node - Minimal Clean Redesign
 */

import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { APINodeData } from '@/types/workflow';
import NodeExecutionOverlay from '../overlays/NodeExecutionOverlay';

const APINode: React.FC<NodeProps<APINodeData>> = ({ id, data, selected }) => {
  const { t } = useTranslation();
  const defaultLabel = t('workflow.node_types.api.label', 'API调用');

  return (
    <div
      className={`
        px-5 py-4 rounded-2xl bg-white dark:bg-gray-800 shadow-sm border
        flex items-center gap-4 min-w-[200px] transition-all duration-200 relative
        ${selected 
          ? 'border-blue-500 ring-4 ring-blue-500/10' 
          : 'border-gray-100 dark:border-gray-700 hover:shadow-md'
        }
      `}
    >
      <NodeExecutionOverlay nodeId={id} label={data.label || defaultLabel} />
      {/* Colored Side Bar */}
      <div className="absolute left-0 top-4 bottom-4 w-1 bg-blue-500 rounded-r-full" />

      <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400">
        <Globe className="w-6 h-6" />
      </div>
      
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">
          {data.label || defaultLabel}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] font-bold text-blue-500 bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 rounded uppercase">
            {data.method || 'GET'}
          </span>
          <div className="text-[10px] text-gray-400 truncate max-w-[100px] font-mono">
            {data.url || 'https://api.example.com'}
          </div>
        </div>
      </div>
      
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-gray-300 !border-2 !border-white dark:!border-gray-800 !shadow-sm"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-blue-500 !border-2 !border-white dark:!border-gray-800 !shadow-sm"
      />
    </div>
  );
};

export default memo(APINode);

