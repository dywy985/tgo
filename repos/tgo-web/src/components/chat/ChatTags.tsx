import React, { memo } from 'react';
import { normalizeTagHex, hexToRgba } from '@/utils/tagUtils';

export interface ChatTagsProps {
  tags: { display_name: string; color?: string | null }[];
  isActive: boolean;
}

/**
 * Renders up to 4 tags with color styling; shows +N when more exist.
 */
export const ChatTags: React.FC<ChatTagsProps> = memo(({ tags, isActive }) => {
  if (!tags || tags.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {tags.slice(0, 4).map((tag, index) => {
        if (isActive) {
          return (
            <span key={index} className="inline-flex items-center rounded-md px-1 py-0.5 text-[10px] leading-none bg-white/20 text-white">
              {tag.display_name}
            </span>
          );
        }
        const hex = normalizeTagHex(tag.color);
        const style = { color: hex, backgroundColor: hexToRgba(hex, 0.12) } as React.CSSProperties;
        return (
          <span key={index} className="inline-flex items-center rounded-md px-1 py-0.5 text-[10px] leading-none" style={style}>
            {tag.display_name}
          </span>
        );
      })}
      {tags.length > 4 && (
        <span className={`text-[10px] ${isActive ? 'text-blue-100' : 'text-gray-400'}`}>+{tags.length - 4}</span>
      )}
    </div>
  );
});

ChatTags.displayName = 'ChatTags';

