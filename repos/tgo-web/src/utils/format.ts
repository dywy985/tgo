/**
 * Format bytes as human-readable string.
 * Examples: 0 B, 1.0 KB, 1.5 MB, 2.0 GB
 */
export function formatBytes(bytes?: number): string {
  if (bytes === undefined || bytes === null) return '';
  if (bytes === 0) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(i === 0 ? 0 : 1)} ${sizes[i]}`;
}

