import React from 'react';
import { useTranslation } from 'react-i18next';
import { StoreCardBaseProps } from '../types';

const StoreCardBase: React.FC<StoreCardBaseProps> = ({ 
  onClick, 
  featured, 
  themeColor = 'blue',
  className = '',
  children 
}) => {
  const { t } = useTranslation();

  const colorClasses = {
    blue: 'hover:shadow-blue-500/10 group-hover:text-blue-600 dark:group-hover:text-blue-400',
    indigo: 'hover:shadow-indigo-500/10 group-hover:text-indigo-600 dark:group-hover:text-indigo-400',
    purple: 'hover:shadow-purple-500/10 group-hover:text-purple-600 dark:group-hover:text-purple-400'
  };

  const badgeClasses = {
    blue: 'bg-blue-600',
    indigo: 'bg-indigo-600',
    purple: 'bg-purple-600'
  };

  return (
    <div 
      onClick={onClick}
      className={`group relative bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer overflow-hidden ${className} ${colorClasses[themeColor].split(' ')[0]}`}
    >
      {/* Featured Badge */}
      {featured && (
        <div className="absolute top-0 right-0">
          <div className={`text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl shadow-sm ${badgeClasses[themeColor]}`}>
            {t('tools.store.featured', '精选')}
          </div>
        </div>
      )}

      {children}
    </div>
  );
};

export default StoreCardBase;
