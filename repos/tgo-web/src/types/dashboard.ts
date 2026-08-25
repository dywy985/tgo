/**
 * 监控面板类型定义
 * 与后端 app/schemas/stats.py 一一对应
 */

export interface StatsPeriod {
  start: string;
  end: string;
}

export interface SessionsStats {
  total: number;
  open: number;
  closed: number;
}

export interface MessagesStats {
  total: number;
  visitor: number;
  ai: number;
  staff: number;
}

export interface AnsweredStats {
  ai_reply_count: number;
  ai_session_count: number;
}

export interface HandoffStats {
  count: number;
  rate: number; // 0-1
}

export interface VisitorsStats {
  uv: number;
}

export interface AIUsageStats {
  request_count: number;
  success_rate: number; // 0-1
  failure_count: number;
  avg_response_ms: number | null;
}

export interface OverviewResponse {
  period: StatsPeriod;
  sessions: SessionsStats;
  messages: MessagesStats;
  answered: AnsweredStats;
  handoff: HandoffStats;
  visitors: VisitorsStats;
  ai: AIUsageStats;
}

export interface TrendsResponse {
  granularity: 'day' | 'hour';
  buckets: string[]; // ISO datetime
  sessions: number[];
  messages: {
    visitor: number[];
    ai: number[];
    staff: number[];
  };
  handoffs: number[];
}

export interface StaffStatItem {
  staff_id: string;
  staff_name: string;
  session_count: number;
  reply_count: number;
  handoff_handled: number;
}

export interface StaffStatsResponse {
  items: StaffStatItem[];
}

export type HandoffStatus = 'assigned' | 'waiting';

export interface HandoffItem {
  id: string;
  happened_at: string;
  visitor_name: string;
  reason: string | null;
  staff_name: string | null;
  channel: string | null;
  status: HandoffStatus;
}

export interface HandoffListResponse {
  total: number;
  items: HandoffItem[];
}

export interface StatsQuery {
  start?: string;
  end?: string;
  platform_id?: string | null;
}
