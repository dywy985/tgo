/**
 * Tools API Service
 * Handles Tools API endpoints using base service patterns
 */

import BaseApiService from './base/BaseApiService';
import type { ToolListResponse, ToolSummary, ToolResponse } from '@/types';

// Query parameters interface for tools list
export interface ToolsQueryParams {
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
  status?: string;
  tool_source_type?: string;
  tags?: string[];
}

/**
 * Tools API Service Class
 */
export class ToolsApiService extends BaseApiService {
  protected readonly apiVersion = 'v1';
  protected readonly endpoints = {
    TOOLS: `/${this.apiVersion}/tools`,
    TOOL_BY_ID: (id: string) => `/${this.apiVersion}/tools/${id}`,
  } as const;
  /**
   * Get paginated list of tools
   */
  static async getTools(params?: ToolsQueryParams): Promise<ToolListResponse> {
    const service = new ToolsApiService();
    return service.get<ToolListResponse>(service.endpoints.TOOLS, params);
  }

  /**
   * Get a specific tool by ID (summary version)
   */
  static async getTool(id: string): Promise<ToolSummary> {
    const service = new ToolsApiService();
    const endpoint = service.endpoints.TOOL_BY_ID(id);
    return service.get<ToolSummary>(endpoint);
  }

  /**
   * Get detailed information about a specific tool by ID
   */
  static async getToolDetails(id: string): Promise<ToolResponse> {
    const service = new ToolsApiService();
    const endpoint = service.endpoints.TOOL_BY_ID(id);
    return service.get<ToolResponse>(endpoint);
  }

  /**
   * Search tools with specific filters
   */
  static async searchTools(
    query: string,
    filters?: {
      category?: string;
      status?: string;
      limit?: number;
    }
  ): Promise<ToolListResponse> {
    const service = new ToolsApiService();
    const params: ToolsQueryParams = {
      search: query,
      limit: filters?.limit || 20,
      ...filters,
    };
    return service.get<ToolListResponse>(service.endpoints.TOOLS, params);
  }

  /**
   * Get tools by category
   */
  static async getToolsByCategory(
    category: string,
    params?: Omit<ToolsQueryParams, 'category'>
  ): Promise<ToolListResponse> {
    return this.getTools({ ...params, category });
  }

  /**
   * Get tools by status
   */
  static async getToolsByStatus(
    status: string,
    params?: Omit<ToolsQueryParams, 'status'>
  ): Promise<ToolListResponse> {
    return this.getTools({ ...params, status });
  }

  /**
   * Get tools with pagination
   */
  static async getToolsPage(
    page: number,
    pageSize: number = 20,
    filters?: Omit<ToolsQueryParams, 'limit' | 'page'>
  ): Promise<ToolListResponse> {
    return this.getTools({ ...filters, page, limit: pageSize });
  }
}

// Export default instance for convenience
export default ToolsApiService;
