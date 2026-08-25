/**
 * Onboarding API Service
 * Handles onboarding progress tracking with backend API
 */

import { BaseApiService } from './base/BaseApiService';

/**
 * Step type defines the behavior when clicking on a step
 * - 'action': Navigate to the route (default behavior)
 * - 'notify': Show a modal with markdown content
 */
export type OnboardingStepType = 'action' | 'notify';

/**
 * Single onboarding step status
 */
export interface OnboardingStepStatus {
  step_number: number;      // 1-5
  step_name: string;        // Step identifier name
  is_completed: boolean;    // Whether this step is completed
  title?: string;           // Human-readable step title (English)
  title_zh?: string;        // Chinese step title
  description: string;      // Human-readable step description (English)
  description_zh?: string;  // Chinese step description
  route: string;            // Frontend route path for this step
  step_type: OnboardingStepType;  // Type of step behavior
}

/**
 * Onboarding progress response from API
 */
export interface OnboardingProgressResponse {
  created_at: string;
  updated_at: string;
  id: string;
  project_id: string;
  steps: OnboardingStepStatus[];
  current_step: number;           // 1-5 for in-progress, 6 if all completed
  progress_percentage: number;    // 0-100
  is_completed: boolean;          // Whether all steps are completed or skipped
  completed_at?: string | null;   // Timestamp when onboarding was completed
}

/**
 * Onboarding API Service Class
 */
class OnboardingApiService extends BaseApiService {
  protected readonly apiVersion = 'v1';
  protected readonly endpoints = {
    progress: '/v1/onboarding',
    skip: '/v1/onboarding/skip',
    reset: '/v1/onboarding/reset',
  } as const;

  /**
   * Get onboarding progress
   * GET /v1/onboarding
   * 
   * Automatically detects completion status for each step:
   * - Step 1: AI Provider configured
   * - Step 2: Default models set
   * - Step 3: RAG Collection created
   * - Step 4: Agent with knowledge base created
   * - Step 5: First chat started
   */
  async getProgress(): Promise<OnboardingProgressResponse> {
    return this.get<OnboardingProgressResponse>(this.endpoints.progress);
  }

  /**
   * Skip onboarding
   * POST /v1/onboarding/skip
   * 
   * Marks the onboarding as completed without requiring all steps to be finished.
   * This allows users to dismiss the onboarding guide if they don't want to follow it.
   */
  async skip(): Promise<OnboardingProgressResponse> {
    return this.post<OnboardingProgressResponse>(this.endpoints.skip);
  }

  /**
   * Reset onboarding
   * POST /v1/onboarding/reset
   * 
   * Clears all step completion statuses and allows the user to restart
   * the onboarding process. Useful for testing or when users want to
   * review the onboarding steps again.
   */
  async reset(): Promise<OnboardingProgressResponse> {
    return this.post<OnboardingProgressResponse>(this.endpoints.reset);
  }
}

// Export singleton instance
export const onboardingApi = new OnboardingApiService();
export default onboardingApi;

