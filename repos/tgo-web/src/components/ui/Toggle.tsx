import React from 'react';
import type { ToggleProps } from '@/types';

/**
 * Toggle switch component
 */
const Toggle: React.FC<ToggleProps> = ({ 
  checked = false, 
  onChange, 
  disabled = false, 
  size = 'md',
  className = '',
  'aria-label': ariaLabel,
  ...props 
}) => {
  const sizeClasses = {
    sm: {
      container: 'h-4 w-7',
      thumb: 'w-3 h-3',
      translate: checked ? 'translate-x-3' : 'translate-x-0.5'
    },
    md: {
      container: 'h-6 w-11',
      thumb: 'w-4 h-4',
      translate: checked ? 'translate-x-5' : 'translate-x-1'
    },
    lg: {
      container: 'h-8 w-14',
      thumb: 'w-6 h-6',
      translate: checked ? 'translate-x-6' : 'translate-x-1'
    }
  };

  const currentSize = sizeClasses[size] || sizeClasses.md;

  const handleClick = (): void => {
    if (!disabled && onChange) {
      onChange(!checked);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>): void => {
    if ((e.key === ' ' || e.key === 'Enter') && !disabled) {
      e.preventDefault();
      onChange?.(!checked);
    }
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={`
        relative inline-flex items-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800
        ${currentSize.container}
        ${checked 
          ? 'bg-blue-600 dark:bg-blue-500' 
          : 'bg-gray-300 dark:bg-gray-600'
        }
        ${disabled 
          ? 'opacity-50 cursor-not-allowed' 
          : 'cursor-pointer'
        }
        ${className}
      `}
      {...props}
    >
      <span className="sr-only">{ariaLabel || 'Toggle'}</span>
      <span
        className={`
          inline-block bg-white rounded-full shadow-sm transform transition-transform duration-200 ease-in-out
          ${currentSize.thumb}
          ${currentSize.translate}
        `}
      />
    </button>
  );
};

export default Toggle;
