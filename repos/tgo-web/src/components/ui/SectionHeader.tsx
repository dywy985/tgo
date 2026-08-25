import React from 'react';

interface SectionHeaderProps {
  icon?: React.ReactNode;
  title: string;
  className?: string;
}

/**
 * Unified section header used inside SectionCard blocks
 */
const SectionHeader: React.FC<SectionHeaderProps> = ({ icon, title, className = '' }) => {
  return (
    <div className={`flex items-center space-x-2 mb-4 ${className}`}>
      {icon}
      <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">{title}</h3>
    </div>
  );
};

export default SectionHeader;

