import React from 'react';

interface ModalFooterProps {
  className?: string;
  children: React.ReactNode;
}

/**
 * Unified Modal Footer with consistent spacing and background
 */
const ModalFooter: React.FC<ModalFooterProps> = ({ className = '', children }) => {
  return (
    <div className={`flex items-center justify-end gap-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-6 py-3 ${className}`}>
      {children}
    </div>
  );
};

export default ModalFooter;

