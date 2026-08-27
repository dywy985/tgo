import React from 'react';
import { Ticket } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import CollapsibleSection from '../ui/CollapsibleSection';

interface TicketItem {
  id: string;
  number: string;
  title: string;
  status?: 'open' | 'closed' | 'pending';
  url?: string;
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
}) => {
  const { t } = useTranslation();
  const getStatusColor = (status?: TicketItem['status']) => {
    switch (status) {
      case 'open':
        return 'text-green-600 hover:text-green-700';
      case 'closed':
        return 'text-gray-600 hover:text-gray-700';
      case 'pending':
        return 'text-yellow-600 hover:text-yellow-700';
      default:
        return 'text-blue-600 hover:text-blue-700';
    }
  };
  const getStatusText = (status?: TicketItem['status']) => {
    switch (status) {
      case 'open':
        return t('ticket.status.open', '待处理');
      case 'closed':
        return t('ticket.status.closed', '已关闭');
      case 'pending':
        return t('ticket.status.pending', '处理中');
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
              </div>
            </a>
          ))
        )}
      </div>
    </CollapsibleSection>
  );
};

export default RelatedTicketsSection;
