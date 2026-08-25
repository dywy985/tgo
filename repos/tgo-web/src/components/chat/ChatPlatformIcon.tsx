import React from 'react';
import { PlatformType } from '@/types';
import { getPlatformIconComponent, getPlatformLabel, getPlatformColor } from '@/utils/platformUtils';

export interface ChatPlatformIconProps {
  platformType?: PlatformType;
}

/**
 * Platform icon with consistent size/coloring for chat list items.
 */
export const ChatPlatformIcon: React.FC<ChatPlatformIconProps> = React.memo(({ platformType }) => {
  const type = platformType ?? PlatformType.WEBSITE;
  const IconComp = getPlatformIconComponent(type);
  const label = getPlatformLabel(type);
  return (
    <span title={label}>
      <IconComp size={14} className={`w-3.5 h-3.5 inline-block ml-1 -mt-0.5 ${getPlatformColor(type)}`} />
    </span>
  );
});

ChatPlatformIcon.displayName = 'ChatPlatformIcon';

