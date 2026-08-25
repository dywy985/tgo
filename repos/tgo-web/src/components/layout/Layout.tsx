import React, { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import OnboardingWelcome from '@/components/onboarding/OnboardingWelcome';
import { useOnboardingStore } from '@/stores/onboardingStore';

/**
 * Main layout component with sidebar and content area
 */
const Layout: React.FC = () => {
  const {
    hasInitialized,
    isLoading,
    isCompleted,
    fetchProgress,
    startPolling,
    stopPolling
  } = useOnboardingStore();

  // Fetch onboarding progress on mount
  useEffect(() => {
    if (!hasInitialized && !isLoading) {
      fetchProgress();
    }
  }, [hasInitialized, isLoading, fetchProgress]);

  // Start polling when onboarding is not completed
  useEffect(() => {
    if (hasInitialized && !isCompleted) {
      startPolling();
    }

    // Cleanup on unmount or when completed
    return () => {
      stopPolling();
    };
  }, [hasInitialized, isCompleted, startPolling, stopPolling]);

  return (
    <div className="bg-gray-100 dark:bg-gray-900 h-screen overflow-hidden font-sans antialiased">
      <div className="flex h-full w-full">
        {/* Sidebar Navigation */}
        <Sidebar />

        {/* Main Content */}
        <Outlet />
      </div>

      {/* Onboarding Welcome Modal */}
      <OnboardingWelcome />
    </div>
  );
};

export default Layout;
