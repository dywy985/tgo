/**
 * Variable Input Component
 * Input or Textarea with integrated VariableSelector
 */

import React, { useRef, useState } from 'react';
import VariableSelector from './VariableSelector';
import type { WorkflowNode, WorkflowEdge } from '@/types/workflow';
import type { AvailableVariable } from '@/utils/workflowVariables';

interface VariableInputProps {
  value: string;
  onChange: (value: string) => void;
  nodeId: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
  className?: string;
  inputClassName?: string;
}

const VariableInput: React.FC<VariableInputProps> = ({
  value,
  onChange,
  nodeId,
  nodes,
  edges,
  placeholder,
  multiline = false,
  rows = 3,
  className = '',
  inputClassName = '',
}) => {
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);

  const handleSelectVariable = (variable: AvailableVariable) => {
    const input = inputRef.current;
    if (!input) return;

    const start = input.selectionStart || 0;
    const end = input.selectionEnd || 0;
    const variableText = `{{${variable.fullPath}}}`;
    
    const newValue = value.substring(0, start) + variableText + value.substring(end);
    onChange(newValue);

    // Set cursor position after insertion in next tick
    setTimeout(() => {
      input.focus();
      const newCursorPos = start + variableText.length;
      input.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  return (
    <div className={`relative group w-full ${isSelectorOpen ? 'z-50' : 'z-10'} ${className}`}>
      {multiline ? (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          className={`
            w-full px-3 py-2 pr-9 bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 rounded-xl 
            focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm dark:text-gray-100 
            resize-none leading-relaxed ${inputClassName}
          `}
        />
      ) : (
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`
            w-full h-full px-3 py-1.5 pr-9 bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 rounded-xl 
            focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm dark:text-gray-100 
            ${inputClassName}
          `}
        />
      )}

      <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center">
        <VariableSelector
          nodeId={nodeId}
          nodes={nodes}
          edges={edges}
          onSelect={handleSelectVariable}
          onOpenChange={setIsSelectorOpen}
        />
      </div>
    </div>
  );
};

export default VariableInput;

