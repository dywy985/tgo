import React from 'react';
import { FolderOpen } from 'lucide-react';
import { getIconComponent, getIconColor } from '@/components/knowledge/IconPicker';

interface KnowledgeBaseTagProps {
  name: string;
  size?: 'xs' | 'sm' | 'md';
  showIcon?: boolean;
  className?: string;
  icon?: string; // Optional icon name from the centralized icon system
}

const sizeClasses: Record<NonNullable<KnowledgeBaseTagProps['size']>, string> = {
  xs: 'px-1.5 py-0.5 text-[11px]',
  sm: 'px-2 py-1 text-xs',
  md: 'px-3 py-1.5 text-sm',
};

const iconSize: Record<NonNullable<KnowledgeBaseTagProps['size']>, string> = {
  xs: 'w-3 h-3',
  sm: 'w-3.5 h-3.5',
  md: 'w-4 h-4',
};

/**
 * Knowledge base compact tag
 */
const KnowledgeBaseTag: React.FC<KnowledgeBaseTagProps> = ({
  name,
  size = 'xs',
  showIcon = true,
  className = '',
  icon,
}) => {
  // Use centralized icon system if icon is provided, otherwise fall back to FolderOpen
  const IconComponent = icon ? getIconComponent(icon) : FolderOpen;
  const iconColor = icon ? getIconColor(icon) : 'text-indigo-600';

  return (
    <span
      className={[
        'inline-flex items-center rounded-md border transition-colors duration-200',
        'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100',
        sizeClasses[size],
        className,
      ].join(' ')}
      title={name}
    >
      {showIcon && (
        <IconComponent
          className={`${iconSize[size]} mr-1 transition-colors duration-200 ${iconColor} hover:opacity-80`}
        />
      )}
      <span className="font-medium">{name}</span>
    </span>
  );
};

export default KnowledgeBaseTag;

