/**
 * Search API Service
 * Implements unified search across visitors and messages using GET /v1/search
 */

import { BaseApiService } from './base/BaseApiService';
import { apiClient } from './api';
import type {
  SearchScope,
  UnifiedSearchResponse,
} from '@/types';

export interface SearchRequestParams {
  q: string;
  scope?: SearchScope; // default: 'all'
  visitor_page?: number; // default: 1
  visitor_page_size?: number; // default: 10
  message_page?: number; // default: 1
  message_page_size?: number; // default: 20
}

class SearchApiService extends BaseApiService {
  protected readonly endpoints = {
    search: '/v1/search',
  } as const;

  protected readonly apiVersion = 'v1';

  /**
   * Unified search across visitors and messages
   * Maps to GET /v1/search with query parameters defined in docs/api.json
   */
  async unifiedSearch(params: SearchRequestParams): Promise<UnifiedSearchResponse> {
    const endpoint = this.endpoints.search;
    const qp = new URLSearchParams();
    qp.set('q', params.q);
    if (params.scope) qp.set('scope', params.scope);
    if (params.visitor_page) qp.set('visitor_page', String(params.visitor_page));
    if (params.visitor_page_size) qp.set('visitor_page_size', String(params.visitor_page_size));
    if (params.message_page) qp.set('message_page', String(params.message_page));
    if (params.message_page_size) qp.set('message_page_size', String(params.message_page_size));

    const url = `${endpoint}?${qp.toString()}`;
    // Use apiClient directly because BaseApiService.buildQueryString doesn't support these parameter names
    return apiClient.get<UnifiedSearchResponse>(url);
  }
}

export const searchApiService = new SearchApiService();

