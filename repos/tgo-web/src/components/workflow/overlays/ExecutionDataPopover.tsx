/**
 * Execution Data Popover Component
 * Shows node input/output data in a floating panel
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { 
  X, 
  Copy, 
  Check, 
  Terminal,
  Database,
  ArrowRightLeft
} from 'lucide-react';
import type { NodeExecution } from '@/types/workflow';

interface ExecutionDataPopoverProps {
  execution: NodeExecution;
  nodeLabel: string;
  onClose: () => void;
}

const ExecutionDataPopover: React.FC<ExecutionDataPopoverProps> = ({ 
  execution, 
  nodeLabel,
  onClose 
}) => {
  const { t } = useTranslation();
  const [copiedField, setCopiedField] = React.useState<string | null>(null);

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const renderJson = (data: any, title: string, icon: React.ReactNode, field: string) => {
    if (!data) return null;
    const jsonString = JSON.stringify(data, null, 2);
    
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-gray-400">
            {icon}
            <span className="text-[10px] font-bold uppercase tracking-wider">{title}</span>
          </div>
          <button 
            onClick={() => handleCopy(jsonString, field)}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors text-gray-400 hover:text-blue-500"
          >
            {copiedField === field ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
          </button>
        </div>
        <div className="bg-gray-900 dark:bg-black rounded-xl p-3 border border-gray-800 overflow-x-auto max-h-48 custom-scrollbar">
          <pre className="text-[11px] font-mono leading-relaxed text-blue-400">
            {jsonString}
          </pre>
        </div>
      </div>
    );
  };

  return (
    <div 
      className="absolute top-0 left-full ml-4 w-80 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 z-[110] flex flex-col overflow-hidden animate-in fade-in slide-in-from-left-2 duration-200"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-50 dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-gray-800/50">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400">
            <ArrowRightLeft className="w-3.5 h-3.5" />
          </div>
          <span className="text-xs font-bold text-gray-700 dark:text-gray-200 truncate max-w-[180px]">
            {nodeLabel}
          </span>
        </div>
        <button 
          onClick={onClose}
          className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors text-gray-400"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <div className="p-4 space-y-6 overflow-y-auto max-h-[400px] custom-scrollbar text-left">
        {execution.error && (
          <div className="p-3 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-xl">
            <p className="text-[10px] font-bold text-red-600 dark:text-red-400 uppercase mb-1">{t('workflow.debug.error', 'Error')}</p>
            <p className="text-[11px] text-red-700 dark:text-red-300 leading-relaxed font-mono">
              {execution.error}
            </p>
          </div>
        )}

        {renderJson(execution.input, t('workflow.debug.input', 'Input'), <Terminal className="w-3 h-3" />, 'input')}
        {renderJson(execution.output, t('workflow.debug.output', 'Output'), <Database className="w-3 h-3" />, 'output')}

        {execution.duration && (
          <div className="pt-2 border-t border-gray-50 dark:border-gray-800 flex items-center justify-between text-[10px]">
            <span className="text-gray-400 font-medium uppercase tracking-wider">{t('workflow.debug.duration', 'Execution Time')}</span>
            <span className="text-gray-600 dark:text-gray-300 font-mono font-bold">
              {execution.duration < 1000 ? `${execution.duration}ms` : `${(execution.duration / 1000).toFixed(2)}s`}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default ExecutionDataPopover;

