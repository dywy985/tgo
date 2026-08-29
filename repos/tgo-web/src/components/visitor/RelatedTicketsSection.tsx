import React from 'react';
import { Ticket } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import CollapsibleSection from '../ui/CollapsibleSection';

interface TicketItem {
  id: string;
  number: string;
  title: string;
  /** 后端工单状态: open/pending_human/processing/resolved/closed/rejected */
  status?: string;
  url?: string;
  /** 非终态 (可标记解决/拒绝) */
  resolvable?: boolean;
}

interface RelatedTicketsSectionProps {
  tickets: TicketItem[];
  className?: string;
  draggable?: boolean;
  expanded?: boolean;
  onToggle?: (expanded: boolean) => void;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  /** 快捷标记解决 */
  onResolve?: (id: string) => void;
  /** 快捷拒绝 (必填原因由调用方弹窗收集) */
  onReject?: (id: string) => void;
}

/**
 * 相关工单模块组件（H10: 接真实数据，展示当前访客的工单列表）
 */
const RelatedTicketsSection: React.FC<RelatedTicketsSectionProps> = ({
  tickets,
  className = '',
  draggable,
  expanded,
  onToggle,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onResolve,
  onReject,
}) => {
  const { t } = useTranslation();
  const getStatusColor = (status?: TicketItem['status']) => {
    switch (status) {
      case 'resolved':
        return 'text-teal-600 hover:text-teal-700';
      case 'rejected':
        return 'text-red-600 hover:text-red-700';
      case 'closed':
        return 'text-gray-600 hover:text-gray-700';
      case 'pending_human':
        return 'text-yellow-600 hover:text-yellow-700';
      case 'processing':
        return 'text-blue-600 hover:text-blue-700';
      case 'open':
        return 'text-green-600 hover:text-green-700';
      default:
        return 'text-blue-600 hover:text-blue-700';
    }
  };
  const getStatusText = (status?: TicketItem['status']) => {
    switch (status) {
      case 'open':
        return t('ticket.status.open', '待处理');
      case 'pending_human':
        return t('ticket.status.pendingHuman', '待人工接手');
      case 'processing':
        return t('ticket.status.processing', '处理中');
      case 'resolved':
        return t('ticket.status.resolved', '已解决');
      case 'closed':
        return t('ticket.status.closed', '已关闭');
      case 'rejected':
        return t('ticket.status.rejected', '已拒绝');
      default:
        return t('ticket.status.unknown', '未知');
    }
  };

  return (
    <CollapsibleSection
      title={t('visitor.sections.relatedTickets', '相关工单')}
      className={className}
      defaultExpanded={false}
      expanded={expanded}
      onToggle={onToggle}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className="space-y-3 pt-1">
        {tickets.length === 0 ? (
          <p className="text-[12px] text-gray-400 dark:text-gray-500">
            {t('visitor.noRelatedTickets', '暂无工单')}
          </p>
        ) : (
          tickets.map((item) => (
            <a
              key={item.id}
              href={item.url || '#'}
              className="flex items-start gap-3 group/item p-2 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors"
            >
              <div className="h-7 w-7 rounded-full bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                <Ticket className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center gap-2">
                  <span className="text-[12px] font-bold text-gray-700 dark:text-gray-200 truncate">
                    {item.number}
                  </span>
                  <span className={`text-[11px] font-medium flex-shrink-0 ${getStatusColor(item.status)}`}>
                    {getStatusText(item.status)}
                  </span>
                </div>
                <p className="text-[12px] text-gray-500 dark:text-gray-400 truncate mt-0.5" title={item.title}>
                  {item.title}
                </p>
                {item.resolvable && (onResolve || onReject) && (
                  <div className="flex items-center gap-2 mt-1.5">
                    {onResolve && (
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onResolve(item.id); }}
                        className="px-2 py-0.5 text-[11px] font-medium text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/30 hover:bg-teal-100 dark:hover:bg-teal-900/50 rounded"
                      >
                        ✓ 解决
                      </button>
                    )}
                    {onReject && (
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onReject(item.id); }}
                        className="px-2 py-0.5 text-[11px] font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50 rounded"
                      >
                        ✗ 拒绝
                      </button>
                    )}
                  </div>
                )}
              </div>
            </a>
          ))
        )}
      </div>
    </CollapsibleSection>
  );
};

export default RelatedTicketsSection;
