/**
 * Base Card Component
 * Provides common card functionality and patterns
 */

import React, { ReactNode } from 'react';
import { Eye, Trash2, Edit, Plus, Check, Shield } from 'lucide-react';
import { generateDefaultAvatar } from '@/utils/avatarUtils';

/**
 * Base card item interface
 */
export interface BaseCardItem {
  id: string;
  name: string;
  title?: string;
  description: string;
  status?: string;
  author?: string;
  version?: string;
  tags?: string[];
  rating?: number;
  verified?: boolean;
  featured?: boolean;
  isInstalled?: boolean;
  short_no?: string;
}

/**
 * Card action interface
 */
export interface CardAction {
  type: string;
  label: string;
  icon: ReactNode;
  variant: 'primary' | 'secondary' | 'danger' | 'success';
  disabled?: boolean;
  loading?: boolean;
  onClick: () => void;
}

/**
 * Base card props interface
 */
export interface BaseCardProps<T extends BaseCardItem> {
  item: T;
  actions?: CardAction[];
  showAvatar?: boolean;
  showStatus?: boolean;
  showTags?: boolean;
  showRating?: boolean;
  showAuthor?: boolean;
  showVersion?: boolean;
  className?: string;
  onClick?: (item: T) => void;
  onAction?: (actionType: string, item: T) => void;
}

/**
 * Get action button styles
 */
const getActionButtonStyles = (variant: CardAction['variant'], disabled?: boolean, loading?: boolean) => {
  const baseStyles = 'flex items-center space-x-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1';
  
  if (disabled || loading) {
    return `${baseStyles} opacity-50 cursor-not-allowed bg-gray-100 text-gray-400`;
  }
  
  switch (variant) {
    case 'primary':
      return `${baseStyles} bg-blue-500 text-white hover:bg-blue-600 focus:ring-blue-500`;
    case 'success':
      return `${baseStyles} bg-green-100 text-green-700`;
    case 'danger':
      return `${baseStyles} text-gray-500 hover:text-red-600`;
    case 'secondary':
    default:
      return `${baseStyles} text-gray-500 hover:text-blue-600`;
  }
};

/**
 * Get status indicator styles
 */
const getStatusStyles = (status?: string) => {
  switch (status?.toLowerCase()) {
    case 'active':
      return 'bg-green-500';
    case 'error':
    case 'failed':
      return 'bg-red-500';
    case 'updating':
    case 'pending':
      return 'bg-yellow-500';
    default:
      return 'bg-gray-400';
  }
};

/**
 * Render star rating
 */
const renderRating = (rating?: number) => {
  if (!rating) return null;
  
  const stars = Math.round(rating);
  return (
    <div className="flex items-center space-x-1">
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          className={`text-xs ${i < stars ? 'text-yellow-400' : 'text-gray-300'}`}
        >
          ★
        </span>
      ))}
      <span className="text-xs text-gray-500 ml-1">{rating.toFixed(1)}</span>
    </div>
  );
};

/**
 * Base Card Component
 */
export function BaseCard<T extends BaseCardItem>({
  item,
  actions = [],
  showAvatar = true,
  showStatus = true,
  showTags = false,
  showRating = false,
  showAuthor = true,
  showVersion = false,
  className = '',
  onClick,
  onAction,
}: BaseCardProps<T>) {
  const displayName = item.title || item.name;
  const avatar = generateDefaultAvatar(displayName, item.id);
  
  const handleCardClick = () => {
    if (onClick) {
      onClick(item);
    }
  };
  
  const handleActionClick = (action: CardAction, event: React.MouseEvent) => {
    event.stopPropagation();
    if (!action.disabled && !action.loading) {
      action.onClick();
      onAction?.(action.type, item);
    }
  };
  
  return (
    <div 
      className={`bg-white/80 backdrop-blur-md rounded-lg p-4 flex flex-col shadow-sm border border-gray-200/60 hover:shadow-md transition-all duration-200 hover:border-gray-300/60 ${onClick ? 'cursor-pointer' : ''} ${className}`}
      onClick={handleCardClick}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center space-x-3 flex-1 min-w-0">
          {showAvatar && (
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs flex-shrink-0 ${avatar.colorClass}`}>
              {avatar.letter}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-2">
              <h3 className="font-semibold text-gray-900 text-sm truncate">
                {displayName}
              </h3>
              {item.verified && (
                <div title="已验证">
                  <Shield className="w-3 h-3 text-blue-500 flex-shrink-0" />
                </div>
              )}
              {item.featured && (
                <span className="bg-yellow-100 text-yellow-800 text-xs px-1.5 py-0.5 rounded-full font-medium">
                  推荐
                </span>
              )}
            </div>
            {(showAuthor && item.author) && (
              <p className="text-xs text-gray-500 truncate">{item.author}</p>
            )}
            {item.short_no && (
              <p className="text-xs text-gray-500">{item.short_no}</p>
            )}
          </div>
        </div>
        
        {showStatus && item.status && (
          <span
            className={`w-2 h-2 rounded-full flex-shrink-0 ${getStatusStyles(item.status)}`}
            title={item.status}
          />
        )}
      </div>
      
      {/* Description */}
      <p className="text-sm text-gray-600 leading-snug mb-3 flex-grow line-clamp-2">
        {item.description}
      </p>
      
      {/* Metadata */}
      <div className="space-y-2 mb-3">
        {showVersion && item.version && (
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>版本</span>
            <span className="font-mono">{item.version}</span>
          </div>
        )}
        
        {showRating && item.rating && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">评分</span>
            {renderRating(item.rating)}
          </div>
        )}
      </div>
      
      {/* Tags */}
      {showTags && item.tags && item.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {item.tags.slice(0, 3).map((tag, index) => (
            <span
              key={index}
              className="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded-full"
            >
              {tag}
            </span>
          ))}
          {item.tags.length > 3 && (
            <span className="text-xs text-gray-500">+{item.tags.length - 3}</span>
          )}
        </div>
      )}
      
      {/* Actions */}
      {actions.length > 0 && (
        <div className="flex items-center justify-between pt-2 border-t border-gray-200/60">
          <div className="flex items-center space-x-2">
            {actions.map((action, index) => (
              <button
                key={index}
                onClick={(e) => handleActionClick(action, e)}
                disabled={action.disabled || action.loading}
                className={getActionButtonStyles(action.variant, action.disabled, action.loading)}
                title={action.label}
              >
                {action.icon}
                <span>{action.loading ? '处理中...' : action.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Common action creators
 */
export const createCardActions = {
  view: (onClick: () => void): CardAction => ({
    type: 'view',
    label: '详情',
    icon: <Eye className="w-4 h-4" />,
    variant: 'secondary',
    onClick,
  }),
  
  edit: (onClick: () => void, disabled?: boolean): CardAction => ({
    type: 'edit',
    label: '编辑',
    icon: <Edit className="w-4 h-4" />,
    variant: 'secondary',
    disabled,
    onClick,
  }),
  
  delete: (onClick: () => void, disabled?: boolean): CardAction => ({
    type: 'delete',
    label: '删除',
    icon: <Trash2 className="w-4 h-4" />,
    variant: 'danger',
    disabled,
    onClick,
  }),
  
  install: (onClick: () => void, isInstalled?: boolean, loading?: boolean): CardAction => ({
    type: 'install',
    label: isInstalled ? '已安装' : '安装',
    icon: isInstalled ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />,
    variant: isInstalled ? 'success' : 'primary',
    disabled: isInstalled,
    loading,
    onClick,
  }),
};

export default BaseCard;
