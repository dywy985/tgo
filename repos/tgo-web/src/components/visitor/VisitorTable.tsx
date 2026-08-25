import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import type { VisitorResponse } from '@/services/visitorApi';
import { ChatAvatar } from '@/components/chat/ChatAvatar';
import { ChatPlatformIcon } from '@/components/chat/ChatPlatformIcon';
import { getPlatformLabel, toPlatformType } from '@/utils/platformUtils';
import { formatLocalDateTime, formatOnlineDuration } from '@/utils/dateUtils';
import Icon from '@/components/ui/Icon';
import { normalizeTagHex, hexToRgba } from '@/utils/tagUtils';

interface VisitorTableProps {
  visitors: VisitorResponse[];
  onVisitorClick: (visitor: VisitorResponse) => void;
}

const VisitorTable: React.FC<VisitorTableProps> = ({ visitors, onVisitorClick }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const formatLastVisit = (timestamp: string) => {
    return formatLocalDateTime(timestamp);
  };

  const handleGoToChat = (e: React.MouseEvent, visitorId: string) => {
    e.stopPropagation();
    // Navigate to chat with customer service channel type (251)
    // Channel ID format for visitors is visitor_id + "-vtr"
    navigate(`/chat/251/${visitorId}-vtr`);
  };

  return (
    <table className="w-full text-left border-collapse">
      <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900/95">
        <tr className="border-b border-gray-200 dark:border-gray-700">
          <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            {t('visitor.table.visitor', '访客')}
          </th>
          <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            {t('visitor.table.platform', '来源平台')}
          </th>
          <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            {t('visitor.table.lastVisit', '最后访问')}
          </th>
          <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            {t('visitor.table.lastOnline', '最后在线')}
          </th>
          <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            {t('visitor.table.tags', '标签')}
          </th>
          <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">
            {t('visitor.table.actions', '操作')}
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {(!visitors || visitors.length === 0) ? (
              <tr>
                <td colSpan={5} className="px-6 py-10 text-center text-gray-500 dark:text-gray-400">
                  {t('visitor.table.empty', '暂无访客数据')}
                </td>
              </tr>
            ) : (
              visitors.map((v) => {
                if (!v) return null;
                return (
                  <tr
                    key={v.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors group"
                    onClick={() => onVisitorClick(v)}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <ChatAvatar
                          displayName={v.name || v.display_nickname || v.nickname_zh || v.nickname || t('visitor.unknown', '未知访客')}
                          displayAvatar={v.avatar_url || ''}
                          visitorStatus={v.is_online ? 'online' : 'offline'}
                          sizePx={40}
                          colorSeed={`${v.id}-vtr`}
                          wrapperClassName="relative flex-shrink-0"
                        />
                        <div className="flex flex-col min-w-0">
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate max-w-[150px]">
                            {v.name || v.display_nickname || v.nickname_zh || v.nickname || t('visitor.fallbackName', '访客 {{suffix}}').replace('{{suffix}}', (v.platform_open_id || '').slice(-4))}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[150px]">
                            {v.email || v.phone_number || v.platform_open_id || '-'}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <ChatPlatformIcon platformType={v.platform_type as any} />
                        <span className="text-sm text-gray-600 dark:text-gray-300">
                          {getPlatformLabel(toPlatformType(v.platform_type)) || v.platform_type || '-'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">
                      {formatLastVisit(v.last_visit_time)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">
                      {formatOnlineDuration(v.last_online_duration_minutes, v.is_online)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-wrap gap-1">
                        {v.tags && v.tags.length > 0 ? (
                          v.tags.map((tag) => {
                            const hex = normalizeTagHex(tag.color);
                            return (
                              <span
                                key={tag.id}
                                className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border"
                                style={{
                                  backgroundColor: hexToRgba(hex, 0.1),
                                  color: hex,
                                  borderColor: hexToRgba(hex, 0.2),
                                }}
                              >
                                {tag.name}
                              </span>
                            );
                          })
                        ) : (
                          <span className="text-xs text-gray-400">-</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={(e) => handleGoToChat(e, v.id)}
                          className="text-gray-400 hover:text-green-600 dark:hover:text-green-400 p-1 rounded-md hover:bg-green-50 dark:hover:bg-green-900/20 transition-all"
                          title={t('chat.openChat', '打开聊天')}
                        >
                          <Icon name="MessageCircle" size={16} />
                        </button>
                        <button
                          className="text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 p-1 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all"
                          title={t('common.details', '详情')}
                        >
                          <Icon name="ExternalLink" size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
  );
};

export default VisitorTable;
