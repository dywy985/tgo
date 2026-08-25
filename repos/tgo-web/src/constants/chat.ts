/**
 * Chat-related constants
 */

// Scroll behavior constants
export const SCROLL_THRESHOLD = 100; // Load more when within 100px of top

// Time formatting constants
export const TIME_CONSTANTS = {
  MILLISECONDS_PER_DAY: 1000 * 60 * 60 * 24,
  DAYS_IN_WEEK: 7,
} as const;

// Locale constants
export const LOCALE_CONSTANTS = {
  CHINESE: 'zh-CN',
  TIME_FORMAT_OPTIONS: {
    hour: '2-digit' as const,
    minute: '2-digit' as const,
  },
} as const;

// UI constants
export const UI_CONSTANTS = {
  WECHAT_ICON_URL: 'https://cdn.simpleicons.org/wechat/07C160',
  ELLIPSIS_ICON_URL: 'https://unpkg.com/lucide-static@latest/icons/ellipsis.svg',
  DEFAULT_DATE_SEPARATOR: '10:30',
} as const;

// Error messages
export const ERROR_MESSAGES = {
  LOAD_MORE_FAILED: 'Failed to load more messages:',
} as const;
