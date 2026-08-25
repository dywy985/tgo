/**
 * Node Execution Badge Component
 * Displays execution status and duration on top of a node
 */

import React from 'react';
import { 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  Clock,
  ExternalLink
} from 'lucide-react';
import type { NodeExecution } from '@/types/workflow';

interface NodeExecutionBadgeProps {
  execution?: NodeExecution;
  onClick?: () => void;
}

const NodeExecutionBadge: React.FC<NodeExecutionBadgeProps> = ({ execution, onClick }) => {
  if (!execution) return null;

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'running':
        return {
          icon: <Loader2 className="w-3 h-3 animate-spin" />,
          bgColor: 'bg-blue-500',
          textColor: 'text-white',
          shadow: 'shadow-blue-500/40',
          pulse: true
        };
      case 'completed':
        return {
          icon: <CheckCircle2 className="w-3 h-3" />,
          bgColor: 'bg-green-500',
          textColor: 'text-white',
          shadow: 'shadow-green-500/40',
          pulse: false
        };
      case 'failed':
        return {
          icon: <XCircle className="w-3 h-3" />,
          bgColor: 'bg-red-500',
          textColor: 'text-white',
          shadow: 'shadow-red-500/40',
          pulse: false
        };
      default:
        return {
          icon: <Clock className="w-3 h-3" />,
          bgColor: 'bg-gray-400',
          textColor: 'text-white',
          shadow: 'shadow-gray-400/40',
          pulse: false
        };
    }
  };

  const config = getStatusConfig(execution.status);

  return (
    <div 
      className={`
        absolute -top-3 -right-3 z-[100] group flex items-center gap-1.5 
        px-2 py-1 rounded-full shadow-lg transition-all duration-300
        ${config.bgColor} ${config.textColor} ${config.shadow}
        ${config.pulse ? 'animate-pulse' : 'animate-in zoom-in-50 duration-200'}
        cursor-pointer hover:scale-110 active:scale-95
      `}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
    >
      {config.icon}
      
      {execution.duration && (
        <span className="text-[10px] font-bold font-mono border-l border-white/20 pl-1.5">
          {execution.duration < 1000 ? `${execution.duration}ms` : `${(execution.duration / 1000).toFixed(1)}s`}
        </span>
      )}

      {execution.status === 'completed' && (
        <div className="hidden group-hover:block border-l border-white/20 pl-1.5">
          <ExternalLink className="w-2.5 h-2.5" />
        </div>
      )}
    </div>
  );
};

export default NodeExecutionBadge;

