/**
 * Stats API Service (监控面板统计)
 * 全部为只读聚合接口，JWT 认证，project_id 由服务端从当前用户取。
 */

import { BaseApiService } from './base/BaseApiService';
import type {
  HandoffListResponse,
  OverviewResponse,
  StaffStatsResponse,
  StatsQuery,
  TrendsResponse,
} from '../types/dashboard';

class StatsApiServiceClass extends BaseApiService {
  protected readonly apiVersion = 'v1';
  protected readonly endpoints = {
    OVERVIEW: `/${this.apiVersion}/stats/overview`,
    TRENDS: `/${this.apiVersion}/stats/trends`,
    STAFF: `/${this.apiVersion}/stats/staff`,
    HANDOFFS: `/${this.apiVersion}/stats/handoffs`,
  } as const;

  private buildQuery(query: StatsQuery, extra: Record<string, string> = {}): string {
    const qs = new URLSearchParams();
    if (query.start) qs.set('start', query.start);
    if (query.end) qs.set('end', query.end);
    if (query.platform_id) qs.set('platform_id', query.platform_id);
    for (const [k, v] of Object.entries(extra)) {
      if (v !== undefined && v !== null && v !== '') qs.set(k, v);
    }
    return qs.toString();
  }

  async getOverview(query: StatsQuery = {}): Promise<OverviewResponse> {
    const qs = this.buildQuery(query);
    const url = qs ? `${this.endpoints.OVERVIEW}?${qs}` : this.endpoints.OVERVIEW;
    return this.get<OverviewResponse>(url);
  }

  async getTrends(query: StatsQuery = {}, granularity: 'day' | 'hour' = 'day'): Promise<TrendsResponse> {
    const qs = this.buildQuery(query, { granularity });
    return this.get<TrendsResponse>(`${this.endpoints.TRENDS}?${qs}`);
  }

  async getStaffStats(query: StatsQuery = {}): Promise<StaffStatsResponse> {
    const qs = this.buildQuery(query);
    const url = qs ? `${this.endpoints.STAFF}?${qs}` : this.endpoints.STAFF;
    return this.get<StaffStatsResponse>(url);
  }

  async getHandoffs(
    query: StatsQuery = {},
    page = 1,
    pageSize = 20,
  ): Promise<HandoffListResponse> {
    const qs = this.buildQuery(query, { page: String(page), page_size: String(pageSize) });
    return this.get<HandoffListResponse>(`${this.endpoints.HANDOFFS}?${qs}`);
  }
}

export const statsApiService = new StatsApiServiceClass();

// ---------------------------------------------------------------------------
// 时间范围工具
// ---------------------------------------------------------------------------

export type DateRangeKey = 'today' | '7d' | '30d' | 'custom';

export interface DateRange {
  key: DateRangeKey;
  start: string; // ISO
  end: string; // ISO
}

export function buildDateRange(key: DateRangeKey, customStart?: string, customEnd?: string): DateRange {
  const end = new Date();
  let start = new Date(end);

  switch (key) {
    case 'today':
      start = new Date(end);
      start.setHours(0, 0, 0, 0);
      break;
    case '7d':
      start.setDate(start.getDate() - 7);
      break;
    case '30d':
      start.setDate(start.getDate() - 30);
      break;
    case 'custom':
      if (customStart && customEnd) {
        return {
          key,
          start: new Date(customStart).toISOString(),
          end: new Date(customEnd).toISOString(),
        };
      }
      start.setDate(start.getDate() - 7);
      break;
  }

  return {
    key,
    start: start.toISOString(),
    end: end.toISOString(),
  };
}
