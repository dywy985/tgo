/* Central utilities for channel identification */

export function getChannelKey(channelId: string, channelType: number): string {
  return `${channelId}::${channelType}`;
}

export function isSameChannel(
  aId: string | null | undefined,
  aType: number | null | undefined,
  bId: string | null | undefined,
  bType: number | null | undefined
): boolean {
  if (!aId || !bId) return false;
  if (aType == null || bType == null) return false;
  return aId === bId && aType === bType;
}

