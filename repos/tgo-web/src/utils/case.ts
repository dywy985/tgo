/**
 * Case conversion utilities
 * - camelCase -> snake_case
 * - Shallow object key transformation to snake_case
 */

/** Convert a single camelCase or PascalCase string to snake_case */
export const camelToSnake = (str: string): string => {
  if (!str) return str;
  return str
    .replace(/([A-Z])/g, '_$1')
    .replace(/[-\s]+/g, '_')
    .replace(/__+/g, '_')
    .toLowerCase();
};

/** Convert the top-level keys of an object to snake_case (shallow) */
export const keysToSnake = <T extends Record<string, any>>(obj: T): Record<string, any> => {
  if (!obj || typeof obj !== 'object') return obj as any;
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    out[camelToSnake(key)] = value;
  }
  return out;
};

