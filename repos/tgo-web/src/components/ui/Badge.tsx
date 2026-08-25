import React from 'react';
import { TAG_COLORS } from '@/utils/constants';

type BadgeVariant = 'auto' | 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info';
type BadgeSize = 'sm' | 'md';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: BadgeSize;
  className?: string;
}

/**
 * Badge component for displaying tags and labels
 */
const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'auto',
  size = 'sm',
  className = ''
}) => {
  const sizeClasses: Record<BadgeSize, string> = {
    sm: 'text-[10px] leading-none px-1 py-0.5',
    md: 'text-xs px-2 py-1'
  };

  const variantClasses: Record<BadgeVariant, string> = {
    auto: TAG_COLORS[children as string] || 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200',
    primary: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200',
    secondary: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200',
    success: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200',
    warning: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-200',
    error: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200',
    info: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-200'
  };

  return (
    <span
      className={`
        ${sizeClasses[size]} 
        ${variantClasses[variant]} 
        rounded-md 
        ${className}
      `}
    >
      {children}
    </span>
  );
};

export default Badge;
