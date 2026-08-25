/**
 * Channel API Service
 * Handles channel-related API endpoints
 */

import { BaseApiService } from './base/BaseApiService';

// API response for GET /v1/channels/info as defined in docs/api.json -> ChannelInfoResponse
export interface ChannelInfoApiResponse {
  name: string;
  avatar: string;
  channel_id: string;
  channel_type: number; // 1 personal, 251 customer service
  entity_type: 'visitor' | 'staff';
  // extra: VisitorResponse-like object for visitor channels, or staff metadata for staff channels
  // Keep as generic to avoid tight coupling; downstream transform will type it to ChannelInfo.extra
  extra: Record<string, any> | null;
}

export interface ChannelInfoParams {
  channel_id: string;
  channel_type: number;
}

class ChannelApiService extends BaseApiService {
  protected readonly endpoints = {
    channelInfo: '/v1/channels/info',
  } as const;

  protected readonly apiVersion = 'v1';

  /**
   * Get channel info using GET /v1/channels/info
   */
  async getChannelInfo(params: ChannelInfoParams): Promise<ChannelInfoApiResponse> {
    const endpoint = this.endpoints.channelInfo;
    const url = `${endpoint}?channel_id=${encodeURIComponent(params.channel_id)}&channel_type=${params.channel_type}`;
    return this.get<ChannelInfoApiResponse>(url);
  }
}

export const channelApiService = new ChannelApiService();

