import React from 'react';
import { Ticket } from 'lucide-react';
import { useTranslation } from 'react-i18next';

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
}

/**
 * 相关工单模块组件
 */
const RelatedTicketsSection: React.FC<RelatedTicketsSectionProps> = ({
  tickets,
  className = ''
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

  return (
    <div className={`pt-4 space-y-3 ${className}`}>
      <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">{t('visitor.sections.relatedTickets', '相关工单')}</h4>
      <div className="space-y-2">
        {tickets.map((ticket) => (
          <a
            key={ticket.id}
            href={ticket.url || '#'}
            className={`flex items-center hover:underline text-[13px] leading-5 transition-colors ${getStatusColor(ticket.status)}`}
          >
            <Ticket className="w-3.5 h-3.5 mr-2 flex-shrink-0" />
            <span className="font-medium">
              {ticket.number} - {ticket.title}
            </span>
          </a>
        ))}
        {(!tickets || tickets.length === 0) && (
          <div className="text-gray-400 text-xs">{t('visitor.activity.noTickets', '暂无相关工单')}</div>
        )}
      </div>
    </div>
  );
};

export default RelatedTicketsSection;
