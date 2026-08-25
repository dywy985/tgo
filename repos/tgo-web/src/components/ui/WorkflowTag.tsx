import React from 'react';
import { GitBranch, ExternalLink } from 'lucide-react';

interface WorkflowTagProps {
  workflow: {
    id: string;
    name: string;
    status?: string;
    enabled?: boolean;
    [key: string]: any;
  };
  onClick?: (workflow: any) => void;
  size?: 'xs' | 'sm' | 'md';
  showIcon?: boolean;
  className?: string;
}

/**
 * 工作流标签组件
 * 用于显示AI员工关联的工作流
 */
const WorkflowTag: React.FC<WorkflowTagProps> = ({
  workflow,
  onClick,
  size = 'sm',
  showIcon = true,
  className = ''
}) => {
  // 根据工作流状态确定颜色主题
  const getColorTheme = (enabled: boolean = true) => {
    if (enabled) {
      return 'bg-purple-100 text-purple-800 border-purple-200 hover:bg-purple-200';
    } else {
      return 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200';
    }
  };

  const getIconColor = (enabled: boolean = true) => {
    if (enabled) {
      return 'text-purple-600';
    } else {
      return 'text-gray-400';
    }
  };

  const sizeClasses = {
    xs: 'px-1.5 py-0.5 text-[11px]',
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-1.5 text-sm'
  };

  const iconSizeClasses = {
    xs: 'w-3 h-3',
    sm: 'w-3 h-3',
    md: 'w-4 h-4'
  };

  const isEnabled = workflow.enabled !== false && workflow.status !== 'inactive';
  const colorTheme = getColorTheme(isEnabled);
  const iconColor = getIconColor(isEnabled);

  const handleClick = (e: React.MouseEvent) => {
    if (onClick) {
      e.stopPropagation();
      onClick(workflow);
    }
  };

  return (
    <span
      className={`
        inline-flex items-center rounded-md border transition-colors duration-200
        ${sizeClasses[size]}
        ${colorTheme}
        ${onClick ? 'cursor-pointer' : 'cursor-default'}
        ${className}
      `}
      onClick={handleClick}
      title={`${workflow.name}${isEnabled ? ' (已启用)' : ' (已禁用)'}`}
    >
      {showIcon && (
        <GitBranch className={`${iconSizeClasses[size]} mr-1 ${iconColor}`} />
      )}
      <span className="font-medium truncate max-w-[9rem]">
        {workflow.name}
      </span>
      {onClick && (
        <ExternalLink className={`${iconSizeClasses[size]} ml-1 opacity-60`} />
      )}
    </span>
  );
};

export default WorkflowTag;

