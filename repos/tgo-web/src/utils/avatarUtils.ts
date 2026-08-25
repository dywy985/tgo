// Shared avatar generation utilities for the TGO Web application

// Color mapping for default avatars (similar to Telegram's system)
export const AVATAR_COLORS = [
  'bg-gradient-to-br from-red-500 to-red-600',      // A
  'bg-gradient-to-br from-orange-500 to-orange-600', // B
  'bg-gradient-to-br from-amber-500 to-amber-600',   // C
  'bg-gradient-to-br from-yellow-500 to-yellow-600', // D
  'bg-gradient-to-br from-lime-500 to-lime-600',     // E
  'bg-gradient-to-br from-green-500 to-green-600',   // F
  'bg-gradient-to-br from-emerald-500 to-emerald-600', // G
  'bg-gradient-to-br from-teal-500 to-teal-600',     // H
  'bg-gradient-to-br from-cyan-500 to-cyan-600',     // I
  'bg-gradient-to-br from-sky-500 to-sky-600',       // J
  'bg-gradient-to-br from-blue-500 to-blue-600',     // K
  'bg-gradient-to-br from-indigo-500 to-indigo-600', // L
  'bg-gradient-to-br from-violet-500 to-violet-600', // M
  'bg-gradient-to-br from-purple-500 to-purple-600', // N
  'bg-gradient-to-br from-fuchsia-500 to-fuchsia-600', // O
  'bg-gradient-to-br from-pink-500 to-pink-600',     // P
  'bg-gradient-to-br from-rose-500 to-rose-600',     // Q
  'bg-gradient-to-br from-slate-500 to-slate-600',   // R
  'bg-gradient-to-br from-gray-500 to-gray-600',     // S
  'bg-gradient-to-br from-zinc-500 to-zinc-600',     // T
  'bg-gradient-to-br from-neutral-500 to-neutral-600', // U
  'bg-gradient-to-br from-stone-500 to-stone-600',   // V
  'bg-gradient-to-br from-red-400 to-red-500',       // W
  'bg-gradient-to-br from-orange-400 to-orange-500', // X
  'bg-gradient-to-br from-amber-400 to-amber-500',   // Y
  'bg-gradient-to-br from-yellow-400 to-yellow-500', // Z
];

export interface DefaultAvatar {
  letter: string;
  colorClass: string;
}

/**
 * Simple string hash function for consistent color assignment
 * @param str - The string to hash
 * @returns A positive integer hash value
 */
const hashString = (str: string): number => {
  let hash = 0;
  if (!str || str.length === 0) return hash;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
};

/**
 * Generate default avatar for entities without profile pictures
 * @param name - The name to generate avatar from (used for the letter)
 * @param colorSeed - Optional seed for color generation (e.g., channel_id, visitor_id, staff_id)
 *                    If provided, the color will be determined by this value instead of the name
 * @returns Object containing the letter and color class
 */
export const generateDefaultAvatar = (name: string, colorSeed?: string): DefaultAvatar => {
  if (!name || name.trim() === '') {
    return {
      letter: '?',
      colorClass: 'bg-gradient-to-br from-gray-400 to-gray-500'
    };
  }

  const firstChar = name.trim().charAt(0).toUpperCase();
  
  let colorIndex = 0;
  
  // If colorSeed is provided, use it to determine the color
  if (colorSeed && colorSeed.trim() !== '') {
    // Only use first 5 characters for hashing to maintain consistency
    const seed = colorSeed.length > 5 ? colorSeed.slice(0, 5) : colorSeed;
    colorIndex = hashString(seed) % AVATAR_COLORS.length;
  } else {
    // Fallback: use the name's first character for color
    const charCode = firstChar.charCodeAt(0);
    
    if (charCode >= 65 && charCode <= 90) { // A-Z
      colorIndex = charCode - 65;
    } else if (charCode >= 48 && charCode <= 57) { // 0-9
      colorIndex = (charCode - 48) % AVATAR_COLORS.length;
    } else {
      // For non-ASCII characters (like Chinese), use a hash-like approach
      colorIndex = charCode % AVATAR_COLORS.length;
    }
  }
  
  return {
    letter: firstChar,
    colorClass: AVATAR_COLORS[colorIndex] || AVATAR_COLORS[0]
  };
};

/**
 * Get avatar color class based on an ID
 * Useful for consistent color assignment across the app
 * @param id - The ID to generate color from (channel_id, visitor_id, staff_id, etc.)
 * @returns CSS color class string
 */
export const getAvatarColorFromId = (id?: string): string => {
  if (!id || id.trim() === '') {
    return 'bg-gradient-to-br from-gray-400 to-gray-500';
  }
  // Only use first 5 characters for hashing
  const seed = id.length > 5 ? id.slice(0, 5) : id;
  const colorIndex = hashString(seed) % AVATAR_COLORS.length;
  return AVATAR_COLORS[colorIndex] || AVATAR_COLORS[0];
};

/**
 * Check if an avatar URL is valid and should be displayed
 * @param avatarUrl - The avatar URL to validate
 * @returns Boolean indicating if the avatar is valid
 */
export const hasValidAvatar = (avatarUrl?: string): boolean => {
  return !!(
    avatarUrl && 
    avatarUrl.trim() !== '' && 
    !avatarUrl.includes('placeholder') &&
    !avatarUrl.includes('default')
  );
};

/**
 * Avatar component props for consistent avatar rendering
 */
export interface AvatarProps {
  name: string;
  avatarUrl?: string;
  size?: 'sm' | 'md' | 'lg';
  shape?: 'rounded' | 'circle';
  className?: string;
  onError?: () => void;
}

/**
 * Get size classes for avatars
 * @param size - The size variant
 * @returns CSS classes for the specified size
 */
export const getAvatarSizeClasses = (size: 'sm' | 'md' | 'lg' = 'md'): string => {
  switch (size) {
    case 'sm':
      return 'w-8 h-8 text-xs';
    case 'md':
      return 'w-10 h-10 text-sm';
    case 'lg':
      return 'w-12 h-12 text-base';
    default:
      return 'w-10 h-10 text-sm';
  }
};

/**
 * Get shape classes for avatars
 * @param shape - The shape variant
 * @returns CSS classes for the specified shape
 */
export const getAvatarShapeClasses = (shape: 'rounded' | 'circle' = 'rounded'): string => {
  switch (shape) {
    case 'circle':
      return 'rounded-full';
    case 'rounded':
      return 'rounded-md';
    default:
      return 'rounded-md';
  }
};
