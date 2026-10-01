import { apiClient } from './api';

export interface ReplyMetrics {
  batch_count: number; customer_message_count: number; answered: number; unanswered: number;
  response_rate: number; avg_first_response_minutes: number;
  p50_first_response_minutes: number; p95_first_response_minutes: number;
  avg_calendar_first_response_minutes?: number;
  p50_calendar_first_response_minutes?: number;
  p95_calendar_first_response_minutes?: number;
  max_calendar_first_response_minutes?: number;
  avg_working_first_response_minutes?: number;
  p50_working_first_response_minutes?: number;
  p95_working_first_response_minutes?: number;
  max_working_first_response_minutes?: number;
  within_sla_count?: number;
  within_sla_rate?: number;
  avg_reminder_count?: number;
  auto_ticket_count?: number;
  longest_pending_minutes?: number;
  longest_pending_working_minutes?: number;
}
export interface StaffReplyMetrics extends ReplyMetrics {
  staff_id: string;
  staff_name: string;
  assigned_questions?: number;
  assigned_answered?: number;
  assigned_unanswered?: number;
  assigned_response_rate?: number;
  actual_replies?: number;
  cross_assist_count?: number;
  actual_response_metrics?: ReplyMetrics;
  unresolved_ticket_count?: number;
  unprocessed_ticket_count?: number;
  open_ticket_count?: number;
  pending_ticket_count?: number;
}
export interface ReplyMonitorStats {
  summary: ReplyMetrics;
  daily: Array<ReplyMetrics & { date: string }>;
  staff_breakdown: StaffReplyMetrics[];
  group_breakdown: Array<ReplyMetrics & { conversation_key: string; conversation_name?: string }>;
}
export interface PendingReply {
  batch_id: string; platform_id: string; conversation_key: string; channel_open_id?: string; channel_id?: string;
  conversation_type: 'group' | 'private'; conversation_name?: string; reply_status: 'pending';
  pending_reply_since: string; responsible_staff?: { id: string; name: string };
  pending_working_minutes?: number; next_reminder_at?: string | null;
  reminder_count: number; customer_message_count: number;
  ticket_id?: string | null;
  ticket_number?: string | null;
  wecom_action: 'available' | 'syncing' | 'ambiguous' | 'unsupported';
  can_dispatch_to_wecom: boolean;
  wecom_action_reason?: string | null;
  customer_identity_key: string;
  customer_sender_id?: string | null;
  customer_sender_name?: string | null;
  reply_match_status: 'not_applicable' | 'matched_quote' | 'matched_single' | 'matched_manual' | 'matched_self_resolution' | 'ambiguous' | 'unmatched';
  ambiguous_reason?: string | null;
  reply_candidates?: Array<{event_id: string; sender_name?: string | null; content_summary?: string | null; occurred_at: string}>;
}
export interface KnowledgeSuggestion {
  document_id: string; collection_id: string; collection_name: string; title: string;
  suggested_reply: string; relevance_score: number;
}
export interface KnowledgeSuggestionResult {
  status: 'ready' | 'empty' | 'unavailable'; query: string; collection_count: number;
  items: KnowledgeSuggestion[]; message?: string | null;
}
export interface ReplyMonitorSettings {
  enabled: boolean; reminders_enabled: boolean; timezone: string; weekly_schedule: Record<string, Array<{start: string; end: string}>>;
  first_reminder_minutes: number; repeat_reminder_minutes: number; max_reminders: number;
  wecom_digest_minutes: number; wecom_digest_max_items: number;
  notification_channels: { in_app?: boolean; wecom_app?: boolean }; ai_reply_frozen: boolean;
}
export interface GroupOwnerAssignment {
  platform_id: string; platform_name?: string; group_key: string; group_name?: string;
  detected_owner_userid?: string | null; detected_owner_name?: string | null;
  effective_staff_id?: string | null; effective_staff_name?: string | null;
  assignment_source: 'group_owner' | 'manual_override' | 'unmatched';
  customer_roster_configured: boolean;
  roster_version: number;
  roster_confirmed_at?: string | null;
  customer_members: CustomerMember[];
  observed_members: ObservedGroupMember[];
  unreviewed_members: ObservedGroupMember[];
  updated_at: string;
}
export interface CustomerMember {
  identity_type: 'userid' | 'name'; identity_value: string; display_name: string;
}
export interface ObservedGroupMember {
  identity_type: 'userid' | 'name'; identity_value: string; display_name: string;
  sender_id?: string | null; sender_name?: string | null;
}
export interface ResolvedMonitorMedia {
  id: string; content_type: string; file_size: number; width: number; height: number;
  status: string; url: string; capture_source: 'cache' | 'screen_crop' | 'recovered_cache' | 'recovered_screen_crop';
}
export interface WeComActionResponse {
  wecom_action: 'available' | 'syncing' | 'ambiguous' | 'unsupported';
  can_dispatch_to_wecom: boolean; reason?: string | null; jump_url?: string | null; dispatched: boolean;
}
export interface MediaRecoveryTarget {
  event_id: string; message_id: string; conversation_key: string; conversation_name: string;
  sender_name: string; occurred_at: string; previous_text?: string | null; next_text?: string | null;
}
export interface MediaRecoveryCandidate {
  candidate_id: string; event_id: string; message_id: string;
  capture_source: 'recovered_cache' | 'recovered_screen_crop';
  status: 'pending' | 'confirmed' | 'rejected'; width: number; height: number;
  created_at: string; content_url: string;
}
export interface MediaRecoveryJob {
  job_id: string; status: string; progress: number; error?: string | null;
  target_count: number; candidate_count: number; result_message?: string | null;
  candidates: MediaRecoveryCandidate[];
}
export interface HistoricalRebuildPreview {
  event_count: number;
  snapshot: string;
  preview_token: string;
  expires_at: string;
  items: Array<{
    event_id: string; occurred_at: string; conversation_key: string;
    sender_name?: string | null; old_sender_kind: string; new_sender_kind: string;
    old_problem_score?: number | null; new_problem_score: number;
    problem_reasons: string[]; requires_manual_quote_review: boolean;
  }>;
}

const ROOT = '/v1/reply-monitor';
export const replyMonitorApi = {
  getPending: (params?: {staff_id?: string; conversation_key?: string; platform_id?: string}) => {
    const qs = new URLSearchParams(Object.entries(params || {}).filter(([,v]) => Boolean(v)) as Array<[string,string]>);
    return apiClient.get<PendingReply[]>(`${ROOT}/pending${qs.size ? `?${qs}` : ''}`);
  },
  dismissPending: (batchId: string) => apiClient.delete<{ok: boolean; batch_id: string}>(
    `${ROOT}/pending/${encodeURIComponent(batchId)}`,
  ),
  resolveReplyMatch: (batchId: string, replyEventId: string) => apiClient.post<{ok: boolean; reply_match_status: 'matched_manual'}>(
    `${ROOT}/pending/${batchId}/resolve-reply-match`, { reply_event_id: replyEventId },
  ),
  getKnowledgeSuggestions: (batchId: string) => apiClient.get<KnowledgeSuggestionResult>(
    `${ROOT}/pending/${batchId}/knowledge-suggestions`,
  ),
  getSettings: () => apiClient.get<ReplyMonitorSettings>(`${ROOT}/settings`),
  resolveMedia: (monitorMessageIds: string[]) => apiClient.post<{items: Record<string, ResolvedMonitorMedia[]>}>(
    `${ROOT}/media/resolve`, { monitor_message_ids: monitorMessageIds },
  ),
  dispatchToWeCom: (platformId: string, conversationKey: string) => apiClient.post<WeComActionResponse>(
    `${ROOT}/wecom-action/dispatch`, { platform_id: platformId, conversation_key: conversationKey },
  ),
  syncWeComBindings: () => apiClient.post<{ok: boolean; counts: Record<string, number>; group_count: number}>(
    `${ROOT}/wecom-bindings/sync`, {},
  ),
  previewMediaRecovery: (platformId: string) => apiClient.get<{count: number; targets: MediaRecoveryTarget[]}>(
    `${ROOT}/media-recovery/preview?platform_id=${encodeURIComponent(platformId)}`,
  ),
  startMediaRecovery: (platformId: string, eventIds: string[]) => apiClient.post<{job_id: string; status: string; target_count: number}>(
    `${ROOT}/media-recovery/jobs`, { platform_id: platformId, event_ids: eventIds },
  ),
  getMediaRecoveryJob: (jobId: string) => apiClient.get<MediaRecoveryJob>(`${ROOT}/media-recovery/jobs/${jobId}`),
  previewHistoricalRebuild: (platformId: string, startAt: string, endAt: string) => apiClient.post<HistoricalRebuildPreview>(
    `${ROOT}/history-rebuild/preview`, { platform_id: platformId, start_at: startAt, end_at: endAt },
  ),
  submitHistoricalRebuild: (platformId: string, startAt: string, endAt: string, previewToken: string) => apiClient.post<{job_id: string; status: string; result: Record<string, number>}>(
    `${ROOT}/history-rebuild/jobs`, { platform_id: platformId, start_at: startAt, end_at: endAt, preview_token: previewToken },
  ),
  getHistoricalRebuildJob: (jobId: string) => apiClient.get<{job_id: string; status: string; result: Record<string, number>}>(`${ROOT}/history-rebuild/jobs/${jobId}`),
  cancelMediaRecovery: (jobId: string) => apiClient.post<{ok: boolean; status: string; reason?: string}>(`${ROOT}/media-recovery/jobs/${jobId}/cancel`, {}),
  decideMediaRecoveryCandidate: (candidateId: string, decision: 'confirm' | 'reject') => apiClient.post<{ok: boolean; status: string}>(
    `${ROOT}/media-recovery/candidates/${candidateId}`, { decision },
  ),
  updateSettings: (data: Omit<ReplyMonitorSettings, 'ai_reply_frozen'>) => apiClient.put<ReplyMonitorSettings>(`${ROOT}/settings`, data),
  getGroupOwners: () => apiClient.get<GroupOwnerAssignment[]>(`${ROOT}/group-owners`),
  setGroupOwner: (platformId: string, groupKey: string, staffId: string) => apiClient.put<{ok: boolean; message: string}>(
    `${ROOT}/group-owners/${platformId}?group_key=${encodeURIComponent(groupKey)}`, { staff_id: staffId },
  ),
  clearGroupOwner: (platformId: string, groupKey: string) => apiClient.delete<{ok: boolean; message: string}>(
    `${ROOT}/group-owners/${platformId}?group_key=${encodeURIComponent(groupKey)}`,
  ),
  setGroupCustomers: (platformId: string, groupKey: string, customerMembers: CustomerMember[]) => apiClient.put<{ok: boolean; message: string; roster_version: number; historical_rebuild_required: boolean}>(
    `${ROOT}/group-customers/${platformId}?group_key=${encodeURIComponent(groupKey)}`, { roster_confirmed: true, customer_members: customerMembers },
  ),
  clearGroupCustomers: (platformId: string, groupKey: string) => apiClient.delete<{ok: boolean; message: string; deleted: number}>(
    `${ROOT}/group-customers/${platformId}?group_key=${encodeURIComponent(groupKey)}`,
  ),
  getStats: (params: {start_date: string; end_date: string; staff_id?: string; responder_id?: string; conversation_key?: string; platform_id?: string}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([,v]) => Boolean(v)) as Array<[string,string]>);
    return apiClient.get<ReplyMonitorStats>(`${ROOT}/stats?${qs}`);
  },
  importRoutes: (file: File) => {
    const form = new FormData(); form.append('file', file);
    return apiClient.postFormData<{success_count: number; error_count: number; errors: Array<{line:number;error:string}>}>('/v1/tickets/routes/import', form);
  },
};
