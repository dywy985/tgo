import React, { useCallback, useMemo } from 'react';
import type { VisitorResponse } from '@/services/visitorApi';
import { ChatAvatar } from './ChatAvatar';
import { ChatPlatformIcon } from './ChatPlatformIcon';
import { ChatTags } from './ChatTags';
import { toPlatformType } from '@/utils/platformUtils';
import { formatWeChatConversationTime } from '@/utils/timeFormatting';
import { diffMinutesFromNow } from '@/utils/dateUtils';

export interface OnlineVisitorListItemProps {
  visitor: VisitorResponse;
  isActive: boolean;
  onClick: (visitor: VisitorResponse) => void;
}

/**
 * Specialized list item for online visitors tab.
 * Does not show last message or unread count.
 */
export const OnlineVisitorListItem: React.FC<OnlineVisitorListItemProps> = React.memo(({ visitor, isActive, onClick }) => {
  const displayName = visitor.name || visitor.display_nickname || visitor.nickname_zh || visitor.nickname || 'Guest';
  const displayAvatar = visitor.avatar_url || '';
  
  const handleClick = useCallback(() => {
    onClick(visitor);
  }, [onClick, visitor]);

  const tags = (visitor.tags || []).map(t => ({
    display_name: t.name,
    color: t.color,
  }));

  const lastSeenMinutes = useMemo(() => {
    if (visitor.is_online) return undefined;
    return diffMinutesFromNow(visitor.last_offline_time) ?? undefined;
  }, [visitor.is_online, visitor.last_offline_time]);

  const displayTime = useMemo(() => {
    if (visitor.is_online) return visitor.last_visit_time;
    return visitor.last_offline_time || visitor.last_visit_time;
  }, [visitor.is_online, visitor.last_visit_time, visitor.last_offline_time]);
  
  return (
    <div
      className={`
        flex items-center p-3 rounded-lg cursor-pointer transition-colors duration-150
        ${isActive ? 'bg-blue-500 dark:bg-blue-600 text-white shadow-sm' : 'hover:bg-gray-100/70 dark:hover:bg-gray-700/70'}
      `}
      onClick={handleClick}
    >
      <ChatAvatar
        displayName={displayName}
        displayAvatar={displayAvatar}
        visitorStatus={visitor.is_online ? 'online' : 'offline'}
        lastSeenMinutes={lastSeenMinutes}
        colorSeed={`${visitor.id}-vtr`}
      />

      <div className="flex-grow overflow-hidden ml-3">
        <div className="flex justify-between items-center">
          <h3 className={`text-sm font-semibold truncate flex items-center ${isActive ? 'text-white' : 'text-gray-800 dark:text-gray-200'}`}>
            <span className="truncate">{displayName}</span>
            <span className="ml-1 flex-shrink-0">
              <ChatPlatformIcon platformType={toPlatformType(visitor.platform_type || 'website')} />
            </span>
          </h3>
          <span className={`text-[10px] flex-shrink-0 ml-2 ${isActive ? 'text-blue-100' : 'text-gray-400 dark:text-gray-500'}`}>
            {formatWeChatConversationTime(displayTime)}
          </span>
        </div>

        <div className="mt-1">
          <ChatTags tags={tags} isActive={isActive} />
        </div>
      </div>
    </div>
  );
});

OnlineVisitorListItem.displayName = 'OnlineVisitorListItem';
