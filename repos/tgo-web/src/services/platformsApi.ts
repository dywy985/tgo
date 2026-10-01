import { BaseApiService } from './base/BaseApiService';
import type { PlatformType, PaginationMetadata, PlatformAIMode } from '@/types';
import { apiClient } from './api';


export interface PlatformTypeDefinitionResponse {
  id: string; // uuid
  type: string; // e.g., wechat, website, email, phone, custom, tiktok, etc.
  name: string; // human-readable
  display_name?: string; // display name for UI (preferred over name)
  is_supported?: boolean; // whether this platform type is currently supported
  icon?: string | null; // optional SVG markup or identifier
  created_at: string;
  updated_at: string;
}

// OpenAPI: PlatformCreate
export interface PlatformCreateRequest {
  name: string;
  type: PlatformType;
  config?: Record<string, any> | null;
  is_active?: boolean; // default true
  agent_id?: string | null;
}

// OpenAPI: PlatformResponse
export interface PlatformResponse {
  id: string; // uuid
  project_id: string; // uuid
  name: string;
  display_name?: string; // display name for UI (preferred over name)
  type: PlatformType;
  is_supported?: boolean; // whether this platform type is currently supported
  icon?: string | null; // SVG icon markup for the platform type
  // Some APIs also return api_key at the top level (e.g., website widget)
  api_key?: string | null; // optional API key (top-level)
  config?: Record<string, any> | null;
  is_active: boolean;
  // Read-only fields from API
  callback_url?: string; // public callback URL for this platform
  logo_url?: string | null; // public URL to retrieve the platform logo
  chat_url?: string | null; // chat completion URL for custom platforms
  deleted_at?: string | null;
  created_at: string;
  updated_at: string;
  // AI settings (top-level fields)
  agent_id?: string | null; // AI Agent ID assigned to this platform
  ai_mode?: PlatformAIMode | null; // AI mode: auto, assist, or off
  fallback_to_ai_timeout?: number | null; // Timeout in seconds before AI takes over (assist mode)
}
// OpenAPI: PlatformUpdate (partial)
export interface PlatformUpdateRequest {
  name?: string | null;
  type?: PlatformType | null; // usually immutable; keep for completeness
  config?: Record<string, any> | null;
  is_active?: boolean | null;
  // AI settings
  agent_id?: string | null;
  ai_mode?: PlatformAIMode | null;
  fallback_to_ai_timeout?: number | null;
}

export interface PlatformConnectionConfig {
  platform_id: string;
  type: 'worktool' | 'wecom_bot';
  state: 'draft' | 'active';
  version: number;
  draft: Record<string, any>;
  active: Record<string, any>;
  has_draft_credentials: boolean;
  has_active_credentials: boolean;
  cutover_at?: string | null;
}

export interface PlatformConnectionStatus {
  platform_id: string;
  type: 'worktool' | 'wecom_bot';
  state: string;
  severity: 'ok' | 'warning' | 'critical';
  version: number;
  config_version?: number;
  cutover_at?: string | null;
  reason?: string;
  devices?: WorkToolDeviceStatus[];
  error?: string;
  data_complete?: boolean;
  gaps?: Array<{ device_id?: string | null; reason: string; started_at: string; ended_at?: string | null }>;
}

export interface WorkToolDeviceStatus {
  robot_id: string;
  name?: string;
  online?: boolean;
  last_seen?: number;
  last_message_at?: number | null;
  pending_sends?: number;
  pending_media_uploads?: number;
  last_media_upload_at?: number | null;
  last_capture_source?: 'cache' | 'screen_crop' | 'recovered_cache' | 'recovered_screen_crop' | null;
  capture_mode?: string;
  last_error?: string | null;
}

export interface PlatformResetPreview {
  platform_id: string;
  platform_name: string;
  preview_job_id: string;
  confirmation_token: string;
  cutoff_utc: string;
  counts: Record<string, number>;
  target_id_summary: string[];
  requires_backup: boolean;
  preserves: string[];
}
export interface MonitorTicketCleanupPreview {
  platform_id: string; platform_name: string; ticket_count: number; requires_backup: boolean;
  tickets: Array<{id: string; number: string; title: string; created_at: string; attachment_count: number}>;
  preserves: string[];
}


/**
 * Platforms API Service
 */
class PlatformsApiService extends BaseApiService {
  protected readonly apiVersion = 'v1';

  protected readonly endpoints = {
    TYPES: `/${this.apiVersion}/platforms/types`,
    LIST: `/${this.apiVersion}/platforms`,
    CREATE: `/${this.apiVersion}/platforms`,
    PLATFORM_BY_ID: (id: string) => `/${this.apiVersion}/platforms/${id}`,
    UPDATE: (id: string) => `/${this.apiVersion}/platforms/${id}`,
    REGENERATE_API_KEY: (id: string) => `/${this.apiVersion}/platforms/${id}/regenerate_api_key`,
    DELETE: (id: string) => `/${this.apiVersion}/platforms/${id}`,
    ENABLE: (id: string) => `/${this.apiVersion}/platforms/${id}/enable`,
    DISABLE: (id: string) => `/${this.apiVersion}/platforms/${id}/disable`,
    UPLOAD_LOGO: (id: string) => `/${this.apiVersion}/platforms/${id}/logo`,
    CONNECTION_CONFIG: (id: string) => `/${this.apiVersion}/platforms/${id}/connection-config`,
    CONNECTION_TEST: (id: string) => `/${this.apiVersion}/platforms/${id}/connection-test`,
    CONNECTION_ACTIVATE: (id: string) => `/${this.apiVersion}/platforms/${id}/activate`,
    CONNECTION_STATUS: (id: string) => `/${this.apiVersion}/platforms/${id}/connection-status`,
    RESET_PREVIEW: (id: string) => `/${this.apiVersion}/platforms/${id}/data-reset/preview`,
    RESET_EXECUTE: (id: string) => `/${this.apiVersion}/platforms/${id}/data-reset`,
    RESET_STATUS: (id: string, jobId: string) => `/${this.apiVersion}/platforms/${id}/data-reset/${jobId}`,
    MONITOR_TICKET_PREVIEW: (id: string) => `/${this.apiVersion}/platforms/${id}/reply-monitor-ticket-cleanup/preview`,
    MONITOR_TICKET_CLEANUP: (id: string) => `/${this.apiVersion}/platforms/${id}/reply-monitor-ticket-cleanup`,
  } as const;

  private static typesCache: { data: PlatformTypeDefinitionResponse[]; ts: number } | null = null;
  private static readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  /**
   * List available platform types (with simple in-memory caching)
   */
  async listPlatformTypes(forceRefresh = false): Promise<PlatformTypeDefinitionResponse[]> {
    const now = Date.now();
    if (!forceRefresh && PlatformsApiService.typesCache) {
      const { ts, data } = PlatformsApiService.typesCache;
      if (now - ts < PlatformsApiService.CACHE_TTL_MS) return data;
    }

    const result = await this.get<PlatformTypeDefinitionResponse[]>(this.endpoints.TYPES);
    PlatformsApiService.typesCache = { data: result, ts: Date.now() };
    return result;
  }

  /**
   * Create a platform via API
   */
  async createPlatform(payload: PlatformCreateRequest): Promise<PlatformResponse> {
    return this.post<PlatformResponse>(this.endpoints.CREATE, payload);
  }


  /**
   * List platforms with optional filters and pagination
   */
  async listPlatforms(params?: PlatformListQueryParams): Promise<PlatformListResponse> {
    const qs = new URLSearchParams();
    if (params?.type !== undefined && params?.type !== null) qs.append('type', String(params.type));
    if (params?.limit !== undefined) qs.append('limit', String(params.limit));
    if (params?.offset !== undefined) qs.append('offset', String(params.offset));
    if (params?.is_active !== undefined && params?.is_active !== null) {
      qs.append('is_active', String(params.is_active));
    }

    const endpoint = qs.toString() ? `${this.endpoints.LIST}?${qs.toString()}` : this.endpoints.LIST;
    return this.get<PlatformListResponse>(endpoint);
  }

  /**
   * Update a platform (partial update)
   */
  async updatePlatform(id: string, payload: PlatformUpdateRequest): Promise<PlatformResponse> {
    const endpoint = this.endpoints.UPDATE(id);
    return this.patch<PlatformResponse>(endpoint, payload);
  }
  /**
   * Upload or replace platform logo (multipart/form-data: field 'file')
   */
  async uploadPlatformLogo(id: string, file: File): Promise<PlatformResponse> {
    const endpoint = this.endpoints.UPLOAD_LOGO(id);
    const form = new FormData();
    form.append('file', file);
    // Use apiClient directly for multipart upload
    return apiClient.postFormData<PlatformResponse>(endpoint, form);
  }


  /**
   * Get a platform by ID
   */
  async getPlatformById(id: string): Promise<PlatformResponse> {
    const endpoint = this.endpoints.PLATFORM_BY_ID(id);
    return this.get<PlatformResponse>(endpoint);
  }

  /**
   * Regenerate API key for a platform
   * Note: backend returns only { id, api_key }
   */
  async regenerateApiKey(id: string): Promise<{ id: string; api_key: string }> {
    const endpoint = this.endpoints.REGENERATE_API_KEY(id);
    return this.post<{ id: string; api_key: string }>(endpoint, {});
  }

  /**
   * Delete a platform by ID
   */
  async deletePlatform(id: string): Promise<void> {
    const endpoint = this.endpoints.DELETE(id);
    await this.delete<void>(endpoint);
  }

  async enablePlatform(id: string): Promise<void> {
    const endpoint = this.endpoints.ENABLE(id);
    await this.post<void>(endpoint, {});
  }

  async disablePlatform(id: string): Promise<void> {
    const endpoint = this.endpoints.DISABLE(id);
    await this.post<void>(endpoint, {});
  }

  async getConnectionConfig(id: string): Promise<PlatformConnectionConfig> {
    return this.get<PlatformConnectionConfig>(this.endpoints.CONNECTION_CONFIG(id));
  }

  async saveConnectionDraft(id: string, config: Record<string, any>): Promise<PlatformConnectionConfig> {
    return this.patch<PlatformConnectionConfig>(this.endpoints.CONNECTION_CONFIG(id), { config });
  }

  async testConnection(id: string): Promise<Record<string, any>> {
    return this.post<Record<string, any>>(this.endpoints.CONNECTION_TEST(id), {});
  }

  async activateConnection(id: string): Promise<PlatformConnectionConfig> {
    return this.post<PlatformConnectionConfig>(this.endpoints.CONNECTION_ACTIVATE(id), {});
  }

  async getConnectionStatus(id: string): Promise<PlatformConnectionStatus> {
    return this.get<PlatformConnectionStatus>(this.endpoints.CONNECTION_STATUS(id));
  }

  async previewDataReset(id: string): Promise<PlatformResetPreview> {
    return this.get<PlatformResetPreview>(`${this.endpoints.RESET_PREVIEW(id)}?cutoff=${encodeURIComponent('2026-09-04T00:00:00+08:00')}`);
  }

  async executeDataReset(id: string, preview: PlatformResetPreview): Promise<Record<string, any>> {
    return this.post<Record<string, any>>(this.endpoints.RESET_EXECUTE(id), {
      preview_job_id: preview.preview_job_id,
      confirmation_token: preview.confirmation_token,
      cutoff: '2026-09-04T00:00:00+08:00',
    });
  }

  async previewMonitorTicketCleanup(id: string): Promise<MonitorTicketCleanupPreview> {
    return this.get<MonitorTicketCleanupPreview>(this.endpoints.MONITOR_TICKET_PREVIEW(id));
  }

  async executeMonitorTicketCleanup(id: string, confirmation: string): Promise<Record<string, any>> {
    return this.post<Record<string, any>>(this.endpoints.MONITOR_TICKET_CLEANUP(id), { confirmation });
  }

  async getDataResetStatus(id: string, jobId: string): Promise<Record<string, any>> {
    return this.get<Record<string, any>>(this.endpoints.RESET_STATUS(id, jobId));
  }
}


export const platformsApiService = new PlatformsApiService();
export default platformsApiService;


export interface PlatformListResponse {
  data: PlatformResponse[];
  pagination: PaginationMetadata;
}

export interface PlatformListQueryParams {
  type?: PlatformType | null;
  is_active?: boolean | null;
  limit?: number;
  offset?: number;
}
