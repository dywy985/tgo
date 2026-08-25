import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { onboardingApi, OnboardingStepStatus, OnboardingProgressResponse } from '@/services/onboardingApi';

/**
 * Polling configuration
 */
const POLLING_INTERVAL_MS = 2000; // 2 seconds

/**
 * Onboarding state interface (API-backed)
 */
interface OnboardingState {
  // API data
  steps: OnboardingStepStatus[];
  currentStep: number;           // 1-5 for in-progress, 6 if all completed
  progressPercentage: number;    // 0-100
  isCompleted: boolean;          // All steps completed or skipped

  // UI state
  isLoading: boolean;
  error: string | null;
  showWelcomeModal: boolean;     // Show full-page welcome modal
  isPanelExpanded: boolean;      // Sidebar panel expanded state
  hasInitialized: boolean;       // Has fetched from API at least once
  isPolling: boolean;            // Whether polling is active

  // Actions
  fetchProgress: () => Promise<void>;
  skipOnboarding: () => Promise<void>;
  resetOnboarding: () => Promise<void>;
  goToStep: (stepNumber: number) => string | null;  // Returns route or null
  setShowWelcomeModal: (show: boolean) => void;
  togglePanelExpanded: () => void;
  startPolling: () => void;
  stopPolling: () => void;

  // Legacy compatibility (no-op, backend auto-detects step completion)
  markTaskCompleted: (taskId: string) => void;

  // Computed
  getCompletedCount: () => number;
  getTotalCount: () => number;
  getCurrentStepData: () => OnboardingStepStatus | null;
  getNextIncompleteStep: () => OnboardingStepStatus | null;
}

/**
 * Update state from API response
 */
const updateFromResponse = (response: OnboardingProgressResponse) => ({
  steps: response.steps,
  currentStep: response.current_step,
  progressPercentage: response.progress_percentage,
  isCompleted: response.is_completed,
  hasInitialized: true,
  isLoading: false,
  error: null,
});

/**
 * Onboarding Store
 * Manages the state of the onboarding with API backend
 */
export const useOnboardingStore = create<OnboardingState>()(
  devtools(
    persist(
      (set, get) => ({
        // Initial state
        steps: [],
        currentStep: 1,
        progressPercentage: 0,
        isCompleted: false,
        isLoading: false,
        error: null,
        showWelcomeModal: false,
        isPanelExpanded: true,
        hasInitialized: false,
        isPolling: false,

        // Fetch progress from API
        fetchProgress: async () => {
          set({ isLoading: true, error: null }, false, 'fetchProgress:start');
          try {
            const response = await onboardingApi.getProgress();
            const { hasInitialized, showWelcomeModal } = get();

            // Show welcome modal on first load if not completed
            const shouldShowWelcome = !hasInitialized && !response.is_completed;

            set({
              ...updateFromResponse(response),
              showWelcomeModal: shouldShowWelcome || showWelcomeModal,
            }, false, 'fetchProgress:success');
          } catch (error) {
            // Set hasInitialized to true even on error to prevent infinite retry loops
            set({
              isLoading: false,
              hasInitialized: true,
              error: error instanceof Error ? error.message : 'Failed to fetch onboarding progress',
            }, false, 'fetchProgress:error');
          }
        },

        // Skip onboarding
        skipOnboarding: async () => {
          set({ isLoading: true, error: null }, false, 'skipOnboarding:start');
          try {
            const response = await onboardingApi.skip();
            set({
              ...updateFromResponse(response),
              showWelcomeModal: false,
            }, false, 'skipOnboarding:success');
          } catch (error) {
            set({
              isLoading: false,
              error: error instanceof Error ? error.message : 'Failed to skip onboarding',
            }, false, 'skipOnboarding:error');
          }
        },

        // Reset onboarding
        resetOnboarding: async () => {
          set({ isLoading: true, error: null }, false, 'resetOnboarding:start');
          try {
            const response = await onboardingApi.reset();
            set({
              ...updateFromResponse(response),
              showWelcomeModal: true,
            }, false, 'resetOnboarding:success');
          } catch (error) {
            set({
              isLoading: false,
              error: error instanceof Error ? error.message : 'Failed to reset onboarding',
            }, false, 'resetOnboarding:error');
          }
        },

        // Get route for a step and navigate
        goToStep: (stepNumber: number) => {
          const { steps } = get();
          const step = steps.find(s => s.step_number === stepNumber);
          return step?.route || null;
        },

        // UI actions
        setShowWelcomeModal: (show: boolean) => {
          set({ showWelcomeModal: show }, false, 'setShowWelcomeModal');
        },

        togglePanelExpanded: () => {
          set((state) => ({ isPanelExpanded: !state.isPanelExpanded }), false, 'togglePanelExpanded');
        },

        // Start polling for progress updates
        startPolling: () => {
          const { isPolling, isCompleted } = get();

          // Don't start if already polling or onboarding is completed
          if (isPolling || isCompleted) return;

          set({ isPolling: true }, false, 'startPolling');

          // Store interval ID and visibility handler in closure
          let intervalId: ReturnType<typeof setInterval> | null = null;
          let isVisible = !document.hidden;

          const pollProgress = async () => {
            // Only poll if tab is visible and onboarding is not completed
            if (!isVisible) return;

            const currentState = get();
            if (currentState.isCompleted) {
              // Stop polling if completed
              get().stopPolling();
              return;
            }

            try {
              const response = await onboardingApi.getProgress();

              // Check if completed after fetch
              if (response.is_completed) {
                set({
                  ...updateFromResponse(response),
                  isPolling: false,
                }, false, 'polling:completed');

                // Clear interval since onboarding is done
                if (intervalId) {
                  clearInterval(intervalId);
                  intervalId = null;
                }
                document.removeEventListener('visibilitychange', handleVisibilityChange);
                return;
              }

              set(updateFromResponse(response), false, 'polling:update');
            } catch (error) {
              // Silently ignore errors during polling - don't stop polling
              // unless it's an authentication error
              if (error instanceof Error && error.message.includes('401')) {
                get().stopPolling();
              }
            }
          };

          const handleVisibilityChange = () => {
            isVisible = !document.hidden;
            if (isVisible) {
              // Immediately poll when tab becomes visible
              pollProgress();
            }
          };

          // Listen for visibility changes
          document.addEventListener('visibilitychange', handleVisibilityChange);

          // Start the interval
          intervalId = setInterval(pollProgress, POLLING_INTERVAL_MS);

          // Store cleanup function in window for stopPolling to access
          (window as unknown as { __onboardingPollingCleanup?: () => void }).__onboardingPollingCleanup = () => {
            if (intervalId) {
              clearInterval(intervalId);
              intervalId = null;
            }
            document.removeEventListener('visibilitychange', handleVisibilityChange);
          };
        },

        // Stop polling
        stopPolling: () => {
          const cleanup = (window as unknown as { __onboardingPollingCleanup?: () => void }).__onboardingPollingCleanup;
          if (cleanup) {
            cleanup();
            delete (window as unknown as { __onboardingPollingCleanup?: () => void }).__onboardingPollingCleanup;
          }
          set({ isPolling: false }, false, 'stopPolling');
        },

        // Legacy compatibility - no-op since backend auto-detects step completion
        // Kept for backward compatibility with existing code
        markTaskCompleted: (_taskId: string) => {
          // No-op: Backend automatically detects step completion
          // Do NOT call fetchProgress here to avoid infinite loops
        },

        // Computed
        getCompletedCount: () => {
          const { steps } = get();
          return steps.filter(s => s.is_completed).length;
        },

        getTotalCount: () => {
          const { steps } = get();
          return steps.length || 5;
        },

        getCurrentStepData: () => {
          const { steps, currentStep } = get();
          return steps.find(s => s.step_number === currentStep) || null;
        },

        getNextIncompleteStep: () => {
          const { steps } = get();
          return steps.find(s => !s.is_completed) || null;
        },
      }),
      {
        name: 'onboarding-store',
        partialize: (state) => ({
          isPanelExpanded: state.isPanelExpanded,
          // Don't persist showWelcomeModal - should be determined by API response
        }),
      }
    ),
    { name: 'onboarding-store' }
  )
);

