import React from 'react';
import { Wrench, ExternalLink } from 'lucide-react';
import type { AiTool } from '@/types';

interface ToolTagProps {
  toolId?: string;
  tool?: AiTool;
  toolsMap?: Record<string, AiTool>;
  tools?: AiTool[];
  onClick?: (tool: AiTool) => void;
  size?: 'xs' | 'sm' | 'md';
  showIcon?: boolean;
  className?: string;
}

/**
 * 工具标签组件
 * 用于显示AI员工关联的工具
 */
const ToolTag: React.FC<ToolTagProps> = ({
  toolId,
  tool: toolProp,
  toolsMap,
  tools,
  onClick,
  size = 'sm',
  showIcon = true,
  className = ''
}) => {
  // Resolve tool from provided sources without relying on mocks
  const resolvedTool: AiTool | undefined = (() => {
    if (toolProp) return toolProp;
    if (toolId && toolsMap && toolsMap[toolId]) return toolsMap[toolId];
    if (toolId && tools && tools.length) return tools.find(t => t.id === toolId);
    return undefined;
  })();

  // 根据工具状态确定颜色主题
  const getColorTheme = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800 border-green-200 hover:bg-green-200';
      case 'inactive':
        return 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200';
      case 'error':
        return 'bg-red-100 text-red-800 border-red-200 hover:bg-red-200';
      default:
        return 'bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-200';
    }
  };

  // 根据工具类型确定图标颜色
  const getIconColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'text-green-600';
      case 'inactive':
        return 'text-gray-400';
      case 'error':
        return 'text-red-600';
      default:
        return 'text-blue-600';
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

  const colorTheme = getColorTheme(resolvedTool?.status || 'inactive');
  const iconColor = getIconColor(resolvedTool?.status || 'inactive');

  const handleClick = () => {
    if (onClick && resolvedTool) {
      onClick(resolvedTool);
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
      title={resolvedTool ? `${resolvedTool.name} - ${resolvedTool.description}` : (toolId || '未知工具')}
    >
      {showIcon && (
        <Wrench className={`${iconSizeClasses[size]} mr-1 ${iconColor}`} />
      )}
      <span className="font-medium truncate max-w-[9rem]">{resolvedTool ? resolvedTool.name : (toolId || '未知工具')}</span>
      {onClick && resolvedTool && (
        <ExternalLink className={`${iconSizeClasses[size]} ml-1 opacity-60`} />
      )}
    </span>
  );
};

export default ToolTag;
