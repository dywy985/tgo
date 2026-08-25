/**
 * Parallel Node Component
 * Parallel execution of multiple branches - Minimal Clean Redesign
 */

import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { GitMerge } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ParallelNodeData } from '@/types/workflow';
import NodeExecutionOverlay from '../overlays/NodeExecutionOverlay';

const ParallelNode: React.FC<NodeProps<ParallelNodeData>> = ({ id, data, selected }) => {
  const { t } = useTranslation();
  const branches = data.branches || 2;
  const defaultLabel = t('workflow.node_types.parallel.label', '并行执行');
  
  return (
    <div
      className={`
        px-5 py-4 rounded-2xl bg-white dark:bg-gray-800 shadow-sm border
        flex flex-col gap-3 min-w-[240px] transition-all duration-200 relative
        ${selected 
          ? 'border-indigo-500 ring-4 ring-indigo-500/10' 
          : 'border-gray-100 dark:border-gray-700 hover:shadow-md'
        }
      `}
    >
      <NodeExecutionOverlay nodeId={id} label={data.label || defaultLabel} />
      {/* Colored Side Bar */}
      <div className="absolute left-0 top-4 bottom-4 w-1 bg-indigo-500 rounded-r-full" />

      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-indigo-500 !border-2 !border-white dark:!border-gray-800 !shadow-sm"
      />
      
      <div className="flex items-center gap-4">
        <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400">
          <GitMerge className="w-6 h-6" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">
            {data.label || defaultLabel}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 px-1.5 py-0.5 rounded font-bold uppercase">
              {t('workflow.node_display.branches_count', `${branches} Branches`, { count: branches })}
            </span>
            {data.wait_for_all && (
              <span className="text-[10px] text-gray-400 font-medium italic">{t('workflow.node_display.wait_for_all', 'Wait for all')}</span>
            )}
          </div>
        </div>
      </div>

      <div className="pt-2 border-t border-gray-50 dark:border-gray-700/50 flex justify-around">
        {Array.from({ length: Math.min(branches, 5) }).map((_, index) => (
          <div key={index} className="flex flex-col items-center relative h-4">
            <span className="text-[9px] text-gray-300 font-bold mb-1">#{index + 1}</span>
            <Handle
              type="source"
              position={Position.Bottom}
              id={`branch-${index}`}
              className="!w-2 !h-2 !bg-indigo-500 !border-none !bottom-[-10px] !left-1/2"
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default memo(ParallelNode);

