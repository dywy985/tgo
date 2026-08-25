import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronDown, Check, Plus } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  color?: string;
}

export interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Show "Add Provider" option at the end */
  showAddProvider?: boolean;
  /** Callback when "Add Provider" is clicked */
  onAddProvider?: () => void;
  /** Label for the add provider option */
  addProviderLabel?: string;
  /** Message to show when no options are available */
  emptyMessage?: string;
  /** Called when dropdown opens (for lazy loading) */
  onOpen?: () => void;
  /** Show loading state */
  isLoading?: boolean;
  /** Loading text */
  loadingText?: string;
}

/**
 * Custom Select component with dropdown
 * Supports adding a "Add Provider" option at the end
 */
const Select: React.FC<SelectProps> = ({
  value,
  onChange,
  options,
  placeholder = '请选择',
  disabled = false,
  className = '',
  showAddProvider = false,
  onAddProvider,
  addProviderLabel = '+ 添加供应商',
  emptyMessage = '暂无可用选项',
  onOpen,
  isLoading = false,
  loadingText = '加载中...',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleToggle = useCallback(() => {
    if (disabled) return;
    const willOpen = !isOpen;
    setIsOpen(willOpen);
    if (willOpen && onOpen) {
      onOpen();
    }
  }, [disabled, isOpen, onOpen]);

  const handleSelect = useCallback((optionValue: string) => {
    onChange(optionValue);
    setIsOpen(false);
  }, [onChange]);

  const handleAddProvider = useCallback(() => {
    setIsOpen(false);
    onAddProvider?.();
  }, [onAddProvider]);

  const selectedOption = options.find(o => o.value === value);
  const displayLabel = selectedOption?.label || placeholder;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={handleToggle}
        disabled={disabled}
        className={`
          w-full flex items-center justify-between px-3 py-2 text-sm text-left
          rounded-md border transition-colors
          ${disabled
            ? 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
            : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 hover:border-gray-400 dark:hover:border-gray-500 cursor-pointer'
          }
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
        `}
      >
        <span className={!selectedOption ? 'text-gray-500 dark:text-gray-400' : ''}>
          {displayLabel}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg max-h-60 overflow-auto">
          {/* Loading state */}
          {isLoading && (
            <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
              {loadingText}
            </div>
          )}

          {/* Empty state */}
          {!isLoading && options.length === 0 && (
            <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
              {emptyMessage}
            </div>
          )}

          {/* Options */}
          {!isLoading && options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => !option.disabled && handleSelect(option.value)}
              disabled={option.disabled}
              className={`
                w-full flex items-center justify-between px-3 py-2 text-sm text-left
                transition-colors
                ${option.disabled
                  ? 'text-gray-400 dark:text-gray-500 cursor-not-allowed'
                  : option.value === value
                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                    : 'text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700'
                }
              `}
            >
              <div className="flex items-center gap-2 overflow-hidden">
                {option.color && (
                  <span 
                    className="w-2 h-2 rounded-full flex-shrink-0" 
                    style={{ backgroundColor: option.color }}
                  />
                )}
                <span className="truncate">{option.label}</span>
              </div>
              {option.value === value && (
                <Check className="w-4 h-4 text-blue-500" />
              )}
            </button>
          ))}

          {/* Add Provider option */}
          {showAddProvider && (
            <>
              {options.length > 0 && (
                <div className="border-t border-gray-200 dark:border-gray-700" />
              )}
              <button
                type="button"
                onClick={handleAddProvider}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>{addProviderLabel}</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default Select;

