/**
 * Tags API Service
 * Handles tag-related API endpoints for visitor categorization
 */

import { BaseApiService } from './base/BaseApiService';

// ============================================================================
// API Request/Response Types based on OpenAPI specification
// ============================================================================

/**
 * Tag category enumeration
 */
export type TagCategory = 'visitor' | 'knowledge';

/**
 * Tag response structure from API
 */
export interface TagResponse {
  /** Base64 encoded tag ID */
  id: string;
  /** Tag display name (1-50 characters) */
  display_name: string;
  /** Tag name (1-50 characters) */
  name: string;
  /** Tag category */
  category: TagCategory;
  /** Tag importance/priority weight (0-10) */
  weight: number;
  /** Tag color (max 20 characters) */
  color?: string | null;
  /** Tag description (max 255 characters) */
  description?: string | null;
  /** Associated project ID */
  project_id: string;
  /** Creation timestamp */
  created_at: string;
  /** Last update timestamp */
  updated_at: string;
  /** Soft deletion timestamp */
  deleted_at?: string | null;
}

/**
 * Tag list response with pagination
 */
export interface TagListResponse {
  /** List of tags */
  data: TagResponse[];
  /** Pagination metadata */
  pagination: {
    total: number;
    limit: number;
    offset: number;
  };
}

/**
 * Tag creation request
 */
export interface TagCreateRequest {
  /** Tag name (1-50 characters) */
  name: string;
  /** Tag category */
  category: TagCategory;
  /** Tag importance/priority weight (0-10), default: 0 */
  weight?: number;
  /** Tag color */
  color?: string | null;
  /** Tag description */
  description?: string | null;
}

/**
 * Tag update request
 */
export interface TagUpdateRequest {
  /** Updated tag weight */
  weight?: number | null;
  /** Updated tag color */
  color?: string | null;
  /** Updated tag description */
  description?: string | null;
}

/**
 * Visitor-tag association creation request
 */
export interface VisitorTagCreateRequest {
  /** Visitor ID (UUID) */
  visitor_id: string;
  /** Tag ID (Base64 encoded) */
  tag_id: string;
}

/**
 * Visitor-tag association response
 */
export interface VisitorTagResponse {
  /** Visitor-tag relationship ID (UUID) */
  id: string;
  /** Associated project ID */
  project_id: string;
  /** Associated visitor ID */
  visitor_id: string;
  /** Associated tag ID */
  tag_id: string;
  /** Creation timestamp */
  created_at: string;
  /** Last update timestamp */
  updated_at: string;
  /** Soft deletion timestamp */
  deleted_at?: string | null;
}

// ============================================================================
// Tags API Service Class
// ============================================================================

/**
 * Tags API Service
 * 
 * Provides methods for managing tags and visitor-tag associations.
 * All operations follow the project's error handling patterns with
 * Chinese error messages and proper loading states.
 */
class TagsApiService extends BaseApiService {
  protected readonly endpoints = {
    // Tag management endpoints
    tags: '/v1/tags',
    tagById: (tagId: string) => `/v1/tags/${tagId}`,
    
    // Visitor-tag association endpoints
    visitorTags: '/v1/tags/visitor-tags',
    visitorTagById: (visitorTagId: string) => `/v1/tags/visitor-tags/${visitorTagId}`,
    // Delete association by visitor_id and tag_id (preferred)
    visitorTagByVisitorAndTag: (visitorId: string, tagId: string) => `/v1/tags/visitors/${visitorId}/tags/${tagId}`,
  };

  protected readonly apiVersion = 'v1';

  // ==========================================================================
  // Tag Management Methods
  // ==========================================================================

  /**
   * List tags with optional filtering
   * 
   * @param options - Filtering options
   * @returns Promise resolving to tag list with pagination
   * @throws Error with Chinese message on API failure
   */
  async listTags(options?: {
    category?: TagCategory | null;
    search?: string | null;
    limit?: number;
    offset?: number;
  }): Promise<TagListResponse> {
    const params = new URLSearchParams();
    
    if (options?.category) {
      params.append('category', options.category);
    }
    if (options?.search) {
      params.append('search', options.search);
    }
    if (options?.limit !== undefined) {
      params.append('limit', options.limit.toString());
    }
    if (options?.offset !== undefined) {
      params.append('offset', options.offset.toString());
    }

    const endpoint = `${this.endpoints.tags}${params.toString() ? `?${params.toString()}` : ''}`;
    return this.get<TagListResponse>(endpoint);
  }

  /**
   * Get tag by ID
   * 
   * @param tagId - Base64 encoded tag ID
   * @returns Promise resolving to tag details
   * @throws Error with Chinese message on API failure
   */
  async getTag(tagId: string): Promise<TagResponse> {
    const endpoint = this.endpoints.tagById(tagId);
    return this.get<TagResponse>(endpoint);
  }

  /**
   * Create a new tag
   * 
   * @param data - Tag creation data
   * @returns Promise resolving to created tag
   * @throws Error with Chinese message on API failure
   */
  async createTag(data: TagCreateRequest): Promise<TagResponse> {
    return this.post<TagResponse>(this.endpoints.tags, data);
  }

  /**
   * Update an existing tag
   * 
   * @param tagId - Base64 encoded tag ID
   * @param data - Tag update data
   * @returns Promise resolving to updated tag
   * @throws Error with Chinese message on API failure
   */
  async updateTag(tagId: string, data: TagUpdateRequest): Promise<TagResponse> {
    const endpoint = this.endpoints.tagById(tagId);
    return this.patch<TagResponse>(endpoint, data);
  }

  /**
   * Delete a tag (soft delete)
   * 
   * @param tagId - Base64 encoded tag ID
   * @returns Promise resolving when deletion is complete
   * @throws Error with Chinese message on API failure
   */
  async deleteTag(tagId: string): Promise<void> {
    const endpoint = this.endpoints.tagById(tagId);
    return this.delete(endpoint);
  }

  // ==========================================================================
  // Visitor-Tag Association Methods
  // ==========================================================================

  /**
   * Create visitor-tag association
   * 
   * Associates a tag with a visitor for categorization purposes.
   * 
   * @param data - Visitor-tag association data
   * @returns Promise resolving to created association
   * @throws Error with Chinese message on API failure
   */
  async createVisitorTag(data: VisitorTagCreateRequest): Promise<VisitorTagResponse> {
    return this.post<VisitorTagResponse>(this.endpoints.visitorTags, data);
  }

  /**
   * Delete visitor-tag association (soft delete)
   * 
   * Removes the association between a visitor and a tag.
   * 
   * @param visitorTagId - Visitor-tag relationship ID (UUID)
   * @returns Promise resolving when deletion is complete
   * @throws Error with Chinese message on API failure
   */
  async deleteVisitorTag(visitorTagId: string): Promise<void> {
    const endpoint = this.endpoints.visitorTagById(visitorTagId);
    return this.delete(endpoint);
  }

  /**
   * Delete visitor-tag association by visitor_id and tag_id
   *
   * @param visitorId - Visitor ID (UUID)
   * @param tagId - Tag ID (Base64 encoded)
   */
  async deleteVisitorTagByVisitorAndTag(visitorId: string, tagId: string): Promise<void> {
    const endpoint = this.endpoints.visitorTagByVisitorAndTag(visitorId, tagId);
    return this.delete(endpoint);
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  /**
   * Get all visitor tags (category: 'visitor')
   *
   * Convenience method to fetch only visitor-category tags.
   *
   * @param options - Additional filtering options
   * @returns Promise resolving to visitor tags list
   */
  async listVisitorTags(options?: {
    search?: string | null;
    limit?: number;
    offset?: number;
  }): Promise<TagListResponse> {
    return this.listTags({
      ...options,
      category: 'visitor',
    });
  }

  /**
   * Find visitor-tag association ID by visitor ID and tag ID
   *
   * Note: This is a workaround since the API doesn't provide a direct endpoint
   * to query visitor-tag associations by visitor_id and tag_id.
   * This method requires fetching the visitor data which includes tags.
   *
   * @param _visitorId - Visitor ID (UUID) - currently unused
   * @param _tagId - Tag ID (Base64 encoded) - currently unused
   * @returns Promise resolving to visitor-tag association ID or null if not found
   */
  async findVisitorTagAssociationId(
    _visitorId: string,
    _tagId: string
  ): Promise<string | null> {
    // Note: This is a placeholder. The actual implementation would require
    // either a new API endpoint or fetching visitor data and parsing it.
    // For now, we'll return null and handle deletion differently.
    console.warn('findVisitorTagAssociationId not fully implemented');
    return null;
  }
}

// Create and export service instance
export const tagsApiService = new TagsApiService();

