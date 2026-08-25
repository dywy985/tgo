import React from 'react';

type Variant = 'blue' | 'purple' | 'green' | 'orange' | 'teal' | 'gray';

const variantClasses: Record<Variant, string> = {
  blue: 'bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-100 dark:from-blue-950 dark:to-indigo-950 dark:border-blue-800',
  purple: 'bg-gradient-to-r from-purple-50 to-pink-50 border-purple-100 dark:from-purple-950 dark:to-pink-950 dark:border-purple-800',
  green: 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-100 dark:from-green-950 dark:to-emerald-950 dark:border-green-800',
  orange: 'bg-gradient-to-r from-orange-50 to-amber-50 border-orange-100 dark:from-orange-950 dark:to-amber-950 dark:border-orange-800',
  teal: 'bg-gradient-to-r from-teal-50 to-cyan-50 border-teal-100 dark:from-teal-950 dark:to-cyan-950 dark:border-teal-800',
  gray: 'bg-white border-gray-200 dark:bg-gray-800 dark:border-gray-700',
};

interface SectionCardProps {
  variant?: Variant;
  className?: string;
  children: React.ReactNode;
}

/**
 * Reusable section container for modals and pages
 */
const SectionCard: React.FC<SectionCardProps> = ({ variant = 'gray', className = '', children }) => {
  const classes = variantClasses[variant];
  return (
    <div className={`rounded-lg p-6 border ${classes} ${className}`}>
      {children}
    </div>
  );
};

export default SectionCard;

