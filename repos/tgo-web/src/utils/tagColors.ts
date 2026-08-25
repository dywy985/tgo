/**
 * Tag Color System
 * Provides consistent, hash-based color assignment for tags throughout the application
 */

// Predefined color palette for tags with good contrast and accessibility
const TAG_COLOR_PALETTE = [
  {
    name: 'blue',
    background: 'bg-blue-100',
    text: 'text-blue-800',
    border: 'border-blue-200',
  },
  {
    name: 'green',
    background: 'bg-green-100',
    text: 'text-green-800',
    border: 'border-green-200',
  },
  {
    name: 'purple',
    background: 'bg-purple-100',
    text: 'text-purple-800',
    border: 'border-purple-200',
  },
  {
    name: 'orange',
    background: 'bg-orange-100',
    text: 'text-orange-800',
    border: 'border-orange-200',
  },
  {
    name: 'pink',
    background: 'bg-pink-100',
    text: 'text-pink-800',
    border: 'border-pink-200',
  },
  {
    name: 'teal',
    background: 'bg-teal-100',
    text: 'text-teal-800',
    border: 'border-teal-200',
  },
  {
    name: 'indigo',
    background: 'bg-indigo-100',
    text: 'text-indigo-800',
    border: 'border-indigo-200',
  },
  {
    name: 'red',
    background: 'bg-red-100',
    text: 'text-red-800',
    border: 'border-red-200',
  },
  {
    name: 'yellow',
    background: 'bg-yellow-100',
    text: 'text-yellow-800',
    border: 'border-yellow-200',
  },
  {
    name: 'gray',
    background: 'bg-gray-100',
    text: 'text-gray-800',
    border: 'border-gray-200',
  },
  {
    name: 'emerald',
    background: 'bg-emerald-100',
    text: 'text-emerald-800',
    border: 'border-emerald-200',
  },
  {
    name: 'cyan',
    background: 'bg-cyan-100',
    text: 'text-cyan-800',
    border: 'border-cyan-200',
  },
] as const;

// Type definitions for the color system
export type TagColorName = typeof TAG_COLOR_PALETTE[number]['name'];

export interface TagColorScheme {
  name: TagColorName;
  background: string;
  text: string;
  border: string;
}

/**
 * Simple hash function to generate consistent hash values from strings
 * Uses character code summation with position weighting for better distribution
 */
const hashString = (str: string): number => {
  if (!str || str.length === 0) {
    return 0;
  }

  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    // Use position weighting to improve hash distribution
    hash = ((hash << 5) - hash) + char + (i * 31);
    // Ensure hash stays within 32-bit integer range
    hash = hash & hash;
  }

  // Return absolute value to ensure positive index
  return Math.abs(hash);
};

/**
 * Get color scheme for a tag based on its name
 * Uses hash-based assignment to ensure consistency
 */
export const getTagColorScheme = (tagName: string): TagColorScheme => {
  // Handle edge cases
  if (!tagName || typeof tagName !== 'string') {
    return TAG_COLOR_PALETTE[0]; // Default to first color (blue)
  }

  // Normalize tag name (trim whitespace, convert to lowercase for consistency)
  const normalizedTagName = tagName.trim().toLowerCase();
  
  if (normalizedTagName.length === 0) {
    return TAG_COLOR_PALETTE[0]; // Default to first color for empty strings
  }

  // Generate hash and map to color index
  const hash = hashString(normalizedTagName);
  const colorIndex = hash % TAG_COLOR_PALETTE.length;
  
  return TAG_COLOR_PALETTE[colorIndex];
};

/**
 * Get background color class for a tag
 */
export const getTagBackgroundColor = (tagName: string): string => {
  return getTagColorScheme(tagName).background;
};

/**
 * Get text color class for a tag
 */
export const getTagTextColor = (tagName: string): string => {
  return getTagColorScheme(tagName).text;
};

/**
 * Get border color class for a tag
 */
export const getTagBorderColor = (tagName: string): string => {
  return getTagColorScheme(tagName).border;
};

/**
 * Get complete CSS classes for a tag element
 * Returns a string with all necessary classes for styling a tag
 */
export const getTagClasses = (
  tagName: string,
  options: {
    includeHover?: boolean;
    includeBorder?: boolean;
    size?: 'sm' | 'md' | 'lg';
    rounded?: boolean;
  } = {}
): string => {
  const {
    includeHover = true,
    includeBorder = true,
    size = 'sm',
    rounded = true,
  } = options;

  const colorScheme = getTagColorScheme(tagName);
  
  const baseClasses = [
    colorScheme.background,
    colorScheme.text,
  ];

  // Add border if requested
  if (includeBorder) {
    baseClasses.push('border', colorScheme.border);
  }

  // Add size classes
  switch (size) {
    case 'sm':
      baseClasses.push('px-2', 'py-0.5', 'text-xs');
      break;
    case 'md':
      baseClasses.push('px-3', 'py-1', 'text-sm');
      break;
    case 'lg':
      baseClasses.push('px-4', 'py-1.5', 'text-base');
      break;
  }

  // Add rounded corners if requested
  if (rounded) {
    baseClasses.push('rounded-full');
  }

  // Add hover effects if requested
  if (includeHover) {
    baseClasses.push('hover:opacity-80', 'transition-opacity', 'duration-200');
  }

  // Add common tag styling
  baseClasses.push('font-medium', 'inline-flex', 'items-center', 'whitespace-nowrap');

  return baseClasses.join(' ');
};

/**
 * Get all available color schemes (useful for testing or color previews)
 */
export const getAllTagColorSchemes = (): TagColorScheme[] => {
  return [...TAG_COLOR_PALETTE];
};

/**
 * Test function to verify color distribution
 * Useful for development and testing
 */
export const testTagColorDistribution = (tagNames: string[]): Record<string, TagColorName> => {
  const distribution: Record<string, TagColorName> = {};
  
  tagNames.forEach(tagName => {
    const colorScheme = getTagColorScheme(tagName);
    distribution[tagName] = colorScheme.name;
  });

  return distribution;
};

/**
 * Get color statistics for a list of tags
 * Returns count of how many tags use each color
 */
export const getTagColorStats = (tagNames: string[]): Record<TagColorName, number> => {
  const stats = {} as Record<TagColorName, number>;
  
  // Initialize all colors with 0 count
  TAG_COLOR_PALETTE.forEach(color => {
    stats[color.name] = 0;
  });

  // Count usage of each color
  tagNames.forEach(tagName => {
    const colorScheme = getTagColorScheme(tagName);
    stats[colorScheme.name]++;
  });

  return stats;
};

// Export the color palette for external use if needed
export { TAG_COLOR_PALETTE };
