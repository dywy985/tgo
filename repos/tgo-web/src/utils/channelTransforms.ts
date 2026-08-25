import type { ChannelInfo } from '@/types';
import { toPlatformType } from '@/utils/platformUtils';
import type { VisitorResponse } from '@/services/visitorApi';
import type { ChannelInfoApiResponse } from '@/services/channelApi';

/**
 * Transform a VisitorResponse from /v1/visitors/by-channel into unified ChannelInfo
 */
export function visitorToChannelInfo(
  visitor: VisitorResponse,
  channelId: string,
  channelType: number
): ChannelInfo {
  const name = (visitor.name || visitor.nickname || '').trim() || `访客${visitor.id.slice(-4)}`;
  const avatar = (visitor.avatar_url || '').trim();

  return {
    name,
    avatar,
    channel_id: channelId,
    channel_type: channelType,
    extra: {
      id: visitor.id,
      platform_id: visitor.platform_id,
      platform_type: toPlatformType((visitor as any).platform_type),
      platform_open_id: visitor.platform_open_id,
      name: visitor.name ?? undefined,
      nickname: visitor.nickname ?? undefined,
      avatar_url: visitor.avatar_url ?? undefined,
      phone_number: visitor.phone_number ?? undefined,
      email: visitor.email ?? undefined,
      company: visitor.company ?? undefined,
      job_title: visitor.job_title ?? undefined,
      source: visitor.source ?? undefined,
      note: visitor.note ?? undefined,
      custom_attributes: visitor.custom_attributes,
      created_at: (visitor as any).created_at ?? undefined,
      updated_at: (visitor as any).updated_at ?? undefined,
      deleted_at: (visitor as any).deleted_at ?? undefined,
      first_visit_time: (visitor as any).first_visit_time ?? undefined,
      last_visit_time: (visitor as any).last_visit_time ?? undefined,
      last_offline_time: (visitor as any).last_offline_time ?? undefined,
      is_online: visitor.is_online,
      ai_disabled: visitor.ai_disabled,
      ai_settings: visitor.ai_settings,
      ai_insights: (visitor as any).ai_insights ?? null,
      tags: Array.isArray(visitor.tags)
        ? visitor.tags.map((t: any) => ({
            display_name: t.display_name,
            name: t.name,
            category: t.category,
            weight: t.weight,
            color: (t.color ?? 'gray') as string,
            description: (t.description ?? null) as string | null,
            id: t.id
          }))
        : undefined,
    },
  };
}

/**
 * Transform ChannelInfoApiResponse from /v1/channels/info into unified ChannelInfo
 */
export function channelResponseToChannelInfo(resp: ChannelInfoApiResponse): ChannelInfo {
  const name = (resp.name || '').trim() || fallbackChannelName(resp.channel_id);
  const avatar = (resp.avatar || '').trim();

  // Normalize extra:
  // - Ensure platform_type is coerced to PlatformType
  // - Preserve full tag objects with metadata
  // - Pass through staff extra as-is
  let normalizedExtra: import('@/types').ChannelExtra = null;
  const rawExtra: any = resp.extra;
  if (rawExtra && typeof rawExtra === 'object') {
    if ('staff_id' in rawExtra) {
      normalizedExtra = rawExtra as import('@/types').ChannelExtra;
    } else {
      const normalizeTags = (tags: any): import('@/types').VisitorTag[] | undefined => {
        if (!Array.isArray(tags)) return undefined;
        const result: import('@/types').VisitorTag[] = [];
        for (const t of tags) {
          if (t && typeof t === 'object') {
            result.push({
              display_name: String(t.display_name ?? ''),
              category: String(t.category ?? 'visitor'),
              weight: Number.isFinite(t.weight) ? Number(t.weight) : 0,
              color: String(t.color ?? 'gray'),
              description: (t.description ?? null) as string | null,
              id: String(t.id ?? '')
            });
          }
        }
        return result.length ? result : undefined;
      };

      normalizedExtra = {
        ...rawExtra,
        platform_type: toPlatformType(rawExtra.platform_type),
        tags: normalizeTags(rawExtra.tags)
      } as any;
    }
  }

  return {
    name,
    avatar,
    channel_id: resp.channel_id,
    channel_type: resp.channel_type,
    extra: normalizedExtra,
  };
}

/**
 * Fallback helper for name from channel id when API returns nothing usable
 */
export function fallbackChannelName(channelId: string): string {
  if (!channelId) return '未知频道';
  return `访客${channelId.slice(-4)}`;
}

