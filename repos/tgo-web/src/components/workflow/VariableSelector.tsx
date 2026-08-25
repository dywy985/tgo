/**
 * Variable Selector Component
 * Dropdown to select available variables from upstream nodes
 */

import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Zap, Search, ChevronRight } from 'lucide-react';
import { getAvailableVariables, type AvailableVariable } from '@/utils/workflowVariables';
import type { WorkflowNode, WorkflowEdge } from '@/types/workflow';

interface VariableSelectorProps {
  nodeId: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  onSelect: (variable: AvailableVariable) => void;
  onOpenChange?: (isOpen: boolean) => void;
  className?: string;
}

const VariableSelector: React.FC<VariableSelectorProps> = ({
  nodeId,
  nodes,
  edges,
  onSelect,
  onOpenChange,
  className = '',
}) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  // Sync internal state with parent if needed
  useEffect(() => {
    onOpenChange?.(isOpen);
  }, [isOpen, onOpenChange]);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const availableVariablesGrouped = getAvailableVariables(nodeId, nodes, edges);
  const allVariables = Object.values(availableVariablesGrouped).flat();

  const filteredVariables = allVariables.filter(v => 
    v.nodeLabel.toLowerCase().includes(searchQuery.toLowerCase()) ||
    v.variableName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Group filtered variables by node for display
  const displayGroups: Record<string, { label: string; variables: AvailableVariable[] }> = {};
  filteredVariables.forEach(v => {
    if (!displayGroups[v.nodeId]) {
      displayGroups[v.nodeId] = { label: v.nodeLabel, variables: [] };
    }
    displayGroups[v.nodeId].variables.push(v);
  });

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`
          p-1 rounded-lg transition-all border
          ${isOpen 
            ? 'bg-blue-50 border-blue-200 text-blue-600 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-400' 
            : 'bg-white border-transparent text-gray-400 hover:text-blue-500 hover:bg-blue-50/50 dark:bg-transparent dark:border-transparent'
          }
        `}
        title={t('workflow.palette.insertVariable', '插入变量')}
      >
        <Zap className="w-3.5 h-3.5" />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-100">
          <div className="p-3 border-b border-gray-50 dark:border-gray-800">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('workflow.palette.searchVariables', '搜索变量...')}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-gray-50 dark:bg-gray-800 border-none rounded-lg focus:ring-1 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto p-2 space-y-3">
            {Object.entries(displayGroups).length > 0 ? (
              Object.entries(displayGroups).map(([nodeId, group]) => (
                <div key={nodeId} className="space-y-1">
                  <div className="px-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1">
                    <ChevronRight className="w-3 h-3" />
                    {group.label}
                  </div>
                  <div className="space-y-0.5">
                    {group.variables.map((v) => (
                      <button
                        key={`${v.nodeId}-${v.variableName}`}
                        onClick={() => {
                          onSelect(v);
                          setIsOpen(false);
                          setSearchQuery('');
                        }}
                        className="w-full text-left px-3 py-1.5 rounded-lg text-xs hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-900/30 dark:hover:text-blue-400 transition-colors flex items-center justify-between group"
                      >
                        <span className="font-mono">{v.variableName}</span>
                        {v.variableType && (
                          <span className="text-[10px] text-gray-400 group-hover:text-blue-400/70">{v.variableType}</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <div className="py-8 text-center">
                <p className="text-xs text-gray-400">
                  {allVariables.length === 0 
                    ? t('workflow.palette.noUpstreamVariables', '无上游可用变量') 
                    : t('workflow.palette.noMatchingVariables', '未找到匹配变量')
                  }
                </p>
              </div>
            )}
          </div>

          <div className="p-2 border-t border-gray-50 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50 rounded-b-xl">
            <p className="text-[10px] text-gray-400 leading-relaxed px-1">
              {t('workflow.palette.variableTip', '选择变量以在当前输入中引用。')}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default VariableSelector;

