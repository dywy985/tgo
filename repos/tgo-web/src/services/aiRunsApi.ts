import { BaseApiService } from './base/BaseApiService';

/**
 * Staff cancel request - for staff-facing cancel endpoint (JWT auth)
 */
export interface StaffCancelRequest {
  client_msg_no: string;
  reason?: string | null;
}

class AIRunsApiService extends BaseApiService {
  protected readonly apiVersion = 'v1';
  protected readonly endpoints = {
    cancel: '/v1/ai/runs/cancel',
  } as const;

  /**
   * Cancel a running supervisor agent execution by client_msg_no (Staff)
   * Uses JWT authentication
   * @param request - Cancel request with client_msg_no
   */
  async cancelByClientNo(request: StaffCancelRequest): Promise<void> {
    return this.post<void>(this.endpoints.cancel, request);
  }
}

export const aiRunsApiService = new AIRunsApiService();

