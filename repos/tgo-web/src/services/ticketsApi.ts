/**
 * Tickets API Service (工单系统)
 * 工单 CRUD / 状态流转 / 备注 / 设置 / 客服路由
 */

import { BaseApiService } from './base/BaseApiService';
import { apiClient } from './api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TicketStatus = 'pending_reply' | 'replied' | 'archived';

export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';
export type TicketSource = 'reply_monitor';

export interface TicketAttachment {
  id: string;
  original_name: string;
  content_type: string;
  file_size: number;
  sha256: string;
  url: string;
}

export interface TicketSummary {
  reason?: string;
  urgency?: string;
  confidence?: number;
  sentiment?: string;
  message_ids?: string[];
  question_type?: string;
  autofill?: Record<string, { source: string; value: unknown }>;
}

export type TicketFormFieldType = 'text' | 'textarea' | 'select' | 'multi_select' | 'number' | 'date' | 'staff' | 'visitor' | 'boolean';

export interface TicketFormField {
  key: string;
  label: string;
  type: TicketFormFieldType;
  required?: boolean;
  editable?: boolean;
  options?: string[];
  placeholder?: string;
  auto_fill?: { source?: string; fallback?: string } | null;
}

export interface Ticket {
  id: string;
  project_id: string;
  number: string;
  title: string;
  description: string;
  category: string;
  visitor_id?: string | null;
  session_id?: string | null;
  platform_id?: string | null;
  group_key?: string | null;
  agent_id?: string | null;
  assignee_id?: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  source: TicketSource;
  ai_summary?: TicketSummary | null;
  custom_fields?: Record<string, unknown> | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  attachments?: TicketAttachment[];
  first_response_at?: string | null;
  replied_at?: string | null;
  archived_at?: string | null;
  sla_due_at?: string | null;
  created_at: string;
  updated_at: string;
  // 展示冗余
  assignee_name?: string | null;
  visitor_name?: string | null;
}

export interface TicketListResponse {
  data: Ticket[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    has_next: boolean;
    has_prev: boolean;
  };
}

export interface TicketComment {
  id: string;
  ticket_id: string;
  staff_id?: string | null;
  staff_name?: string | null;
  content: string;
  is_internal: boolean;
  created_at: string;
}

export interface TicketHistory {
  id: string;
  ticket_id: string;
  from_status?: string | null;
  to_status: string;
  operator_id?: string | null;
  operator_type: string;
  note?: string | null;
  created_at: string;
}

export interface ReplyMonitorTimelineEvent {
  id: string;
  message_id: string;
  sender_kind: 'customer' | 'staff' | 'system';
  sender_id?: string | null;
  sender_name?: string | null;
  responsible_staff_id?: string | null;
  message_type: string;
  content_summary?: string | null;
  occurred_at: string;
  metadata: Record<string, unknown>;
  media: Array<{
    id: string;
    content_type: string;
    file_size: number;
    width: number;
    height: number;
    url: string;
    status: string;
    capture_source: 'cache' | 'screen_crop' | 'recovered_cache' | 'recovered_screen_crop';
  }>;
  media_status: 'ready' | 'recovering' | 'missing' | 'failed';
  capture_source?: 'cache' | 'screen_crop' | 'recovered_cache' | 'recovered_screen_crop' | null;
}

export interface ReplyMonitorTicketContext {
  ticket_id: string;
  ticket_number: string;
  batch: {
    id: string;
    status: string;
    conversation_key: string;
    conversation_type: string;
    conversation_name?: string | null;
    responsible_staff_id?: string | null;
    actual_reply_staff_id?: string | null;
    first_customer_at: string;
    first_reply_at?: string | null;
    reminder_count: number;
    platform_id: string;
  };
  timeline: ReplyMonitorTimelineEvent[];
  wecom_action: 'available' | 'syncing' | 'ambiguous' | 'unsupported';
  can_dispatch_to_wecom: boolean;
  wecom_action_reason?: string | null;
}

export interface TicketSettings {
  project_id: string;
  sla_timeout_minutes: number;
  sla_by_priority: Record<'low' | 'normal' | 'high' | 'urgent', number>;
  auto_archive_hours: number;
  auto_archive_enabled: boolean;
  create_ticket_on_unresolved: boolean;
  create_ticket_on_handoff: boolean;
  create_ticket_on_negative: boolean;
  ignore_ack_words: boolean;
  reminder_enabled: boolean;
  reminder_channels: Record<string, boolean>;
  urgent_notify_all: boolean;
  categories: string[];
  form_schema: TicketFormField[];
  number_format: { prefix: string; date: boolean; seq_digits: number };
  ai_resolve_check_enabled: boolean;
  auto_resolve_minutes: number;
  updated_at?: string | null;
}

export interface TicketRoute {
  id: string;
  project_id: string;
  platform_id?: string | null;
  group_key?: string | null;
  visitor_key?: string | null;
  staff_id?: string | null;
  wecom_userid?: string | null;
  staff_name: string;
  priority: number;
  created_at: string;
}

export interface TicketStatistics {
  total: number;
  by_status: Record<string, number>;
  by_priority: Record<string, number>;
  by_category: Record<string, number>;
  pending_reply_total: number;
  replied_total: number;
  archived_total: number;
}

export interface TicketListQuery {
  status?: TicketStatus | '';
  priority?: TicketPriority | '';
  assignee_id?: string;
  visitor_id?: string;
  category?: string;
  keyword?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

class TicketsApiServiceClass extends BaseApiService {
  protected readonly apiVersion = 'v1';
  protected readonly endpoints = {
    TICKETS: `/${this.apiVersion}/tickets`,
    TICKET: (id: string) => `/${this.apiVersion}/tickets/${id}`,
    TICKET_ASSIGN: (id: string) => `/${this.apiVersion}/tickets/${id}/assign`,
    TICKET_STATUS: (id: string) => `/${this.apiVersion}/tickets/${id}/status`,
    TICKET_COMMENTS: (id: string) => `/${this.apiVersion}/tickets/${id}/comments`,
    TICKET_HISTORY: (id: string) => `/${this.apiVersion}/tickets/${id}/history`,
    TICKET_MONITOR_CONTEXT: (id: string) => `/${this.apiVersion}/tickets/${id}/monitor-context`,
    TICKET_STATISTICS: `/${this.apiVersion}/tickets/statistics`,
    TICKET_BULK_ARCHIVE: `/${this.apiVersion}/tickets/bulk/archive`,
    TICKET_SETTINGS: `/${this.apiVersion}/tickets/settings`,
    TICKET_ROUTES: `/${this.apiVersion}/tickets/routes`,
    TICKET_ROUTE: (id: string) => `/${this.apiVersion}/tickets/routes/${id}`,
  } as const;

  // ---- Tickets ----

  async listTickets(query: TicketListQuery = {}): Promise<TicketListResponse> {
    const qs = new URLSearchParams();
    if (query.status) qs.set('status', query.status);
    if (query.priority) qs.set('priority', query.priority);
    if (query.assignee_id) qs.set('assignee_id', query.assignee_id);
    if (query.visitor_id) qs.set('visitor_id', query.visitor_id);
    if (query.category) qs.set('category', query.category);
    if (query.keyword) qs.set('keyword', query.keyword);
    if (query.date_from) qs.set('date_from', query.date_from);
    if (query.date_to) qs.set('date_to', query.date_to);
    qs.set('limit', String(query.limit ?? 20));
    qs.set('offset', String(query.offset ?? 0));
    const url = `${this.endpoints.TICKETS}?${qs.toString()}`;
    return this.get<TicketListResponse>(url);
  }

  async getTicket(id: string): Promise<Ticket> {
    return this.get<Ticket>(this.endpoints.TICKET(id));
  }

  async getAttachmentBlob(url: string): Promise<Blob> {
    const response = await this.getResponse(url);
    return response.blob();
  }

  async createTicket(data: Partial<Ticket>): Promise<Ticket> {
    return this.post<Ticket>(this.endpoints.TICKETS, data);
  }

  async updateTicket(id: string, data: Partial<Ticket>): Promise<Ticket> {
    return this.patch<Ticket>(this.endpoints.TICKET(id), data);
  }

  async deleteTicket(id: string): Promise<void> {
    return this.delete<void>(this.endpoints.TICKET(id));
  }

  async createTicketWithFields(data: {
    title: string;
    description: string;
    category?: string;
    priority?: string;
    source?: string;
    visitor_id?: string | null;
    session_id?: string | null;
    platform_id?: string | null;
    group_key?: string | null;
    assignee_id?: string | null;
    custom_fields?: Record<string, unknown>;
  }): Promise<Ticket> {
    return this.post<Ticket>(this.endpoints.TICKETS, data);
  }

  async updateTicketFields(
    id: string,
    data: {
      title?: string;
      description?: string;
      category?: string;
      priority?: string;
      assignee_id?: string | null;
      group_key?: string;
      custom_fields?: Record<string, unknown>;
    }
  ): Promise<Ticket> {
    return this.patch<Ticket>(this.endpoints.TICKET(id), data);
  }

  async assignTicket(id: string, staffId: string | null): Promise<Ticket> {
    return this.post<Ticket>(this.endpoints.TICKET_ASSIGN(id), { staff_id: staffId });
  }

  async changeStatus(id: string, status: string, note?: string): Promise<Ticket> {
    return this.post<Ticket>(this.endpoints.TICKET_STATUS(id), {
      status,
      note,
      operator_type: 'staff',
    });
  }

  async bulkArchive(ticketIds: string[]): Promise<Ticket[]> {
    return this.post<Ticket[]>(this.endpoints.TICKET_BULK_ARCHIVE, { ticket_ids: ticketIds });
  }

  async addComment(id: string, content: string, isInternal: boolean = true): Promise<TicketComment> {
    return this.post<TicketComment>(this.endpoints.TICKET_COMMENTS(id), { content, is_internal: isInternal });
  }

  async getComments(id: string): Promise<TicketComment[]> {
    return this.get<TicketComment[]>(this.endpoints.TICKET_COMMENTS(id));
  }

  async getHistory(id: string): Promise<TicketHistory[]> {
    return this.get<TicketHistory[]>(this.endpoints.TICKET_HISTORY(id));
  }

  async getMonitorContext(id: string): Promise<ReplyMonitorTicketContext> {
    return this.get<ReplyMonitorTicketContext>(this.endpoints.TICKET_MONITOR_CONTEXT(id));
  }

  async getStatistics(): Promise<TicketStatistics> {
    return this.get<TicketStatistics>(this.endpoints.TICKET_STATISTICS);
  }

  // ---- Settings ----

  async getSettings(): Promise<TicketSettings> {
    return this.get<TicketSettings>(this.endpoints.TICKET_SETTINGS);
  }

  async updateSettings(data: Partial<TicketSettings>): Promise<TicketSettings> {
    return this.put<TicketSettings>(this.endpoints.TICKET_SETTINGS, data);
  }

  // ---- Routes ----

  async listRoutes(): Promise<TicketRoute[]> {
    return this.get<TicketRoute[]>(this.endpoints.TICKET_ROUTES);
  }

  async importRoutes(file: File): Promise<{success_count:number; error_count:number; errors:Array<{line:number;error:string}>}> {
    const form = new FormData();
    form.append('file', file);
    return apiClient.postFormData('/v1/tickets/routes/import', form);
  }

  async listRouteGroups(): Promise<Array<{ group_key: string; group_name: string }>> {
    return this.get<Array<{ group_key: string; group_name: string }>>(
      `${this.endpoints.TICKET_ROUTES}/groups`,
    );
  }

  async createRoute(data: Partial<TicketRoute>): Promise<TicketRoute> {
    return this.post<TicketRoute>(this.endpoints.TICKET_ROUTES, data);
  }

  async updateRoute(id: string, data: Partial<TicketRoute>): Promise<TicketRoute> {
    return this.patch<TicketRoute>(this.endpoints.TICKET_ROUTE(id), data);
  }

  async deleteRoute(id: string): Promise<void> {
    return this.delete<void>(this.endpoints.TICKET_ROUTE(id));
  }
}

export const ticketsApiService = new TicketsApiServiceClass();

// 状态/优先级展示映射
export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  pending_reply: '待回复',
  replied: '已回复',
  archived: '已归档',
};

export const TICKET_STATUS_COLORS: Record<TicketStatus, string> = {
  pending_reply: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400',
  replied: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
  archived: 'bg-gray-200 text-gray-600 dark:bg-gray-700/50 dark:text-gray-400',
};

export const TICKET_PRIORITY_LABELS: Record<TicketPriority, string> = {
  low: '低',
  normal: '普通',
  high: '高',
  urgent: '紧急',
};

export const TICKET_PRIORITY_COLORS: Record<TicketPriority, string> = {
  low: 'text-gray-500',
  normal: 'text-blue-600 dark:text-blue-400',
  high: 'text-orange-600 dark:text-orange-400',
  urgent: 'text-red-600 dark:text-red-400 font-semibold',
};
