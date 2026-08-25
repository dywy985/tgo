import React from 'react';
import * as LucideIcons from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { StoreSidebarProps } from '../types';

const StoreSidebar: React.FC<StoreSidebarProps> = ({ 
  title, 
  icon, 
  categories, 
  selectedCategory, 
  onCategoryChange,
  themeColor = 'blue'
}) => {
  const { i18n } = useTranslation();
  const currentLang = i18n.language.startsWith('zh') ? 'zh' : 'en';

  const colorClasses = {
    blue: 'bg-blue-600 shadow-blue-200',
    indigo: 'bg-indigo-600 shadow-indigo-200',
    purple: 'bg-purple-600 shadow-purple-200'
  };

  const activeClasses = {
    blue: 'bg-blue-600 text-white shadow-lg shadow-blue-100 dark:shadow-none',
    indigo: 'bg-indigo-600 text-white shadow-lg shadow-indigo-100 dark:shadow-none',
    purple: 'bg-purple-600 text-white shadow-lg shadow-purple-100 dark:shadow-none'
  };

  return (
    <aside className="w-72 bg-white/50 dark:bg-gray-900/50 border-r border-gray-200/50 dark:border-gray-800/50 hidden lg:flex flex-col">
      <div className="p-8">
        <div className="flex items-center gap-2 mb-8">
          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-lg dark:shadow-none ${colorClasses[themeColor]}`}>
            {icon}
          </div>
          <h2 className="text-xl font-black text-gray-900 dark:text-gray-100 tracking-tight">
            {title}
          </h2>
        </div>

        <nav className="space-y-1">
          {categories.map((cat) => {
            const IconComponent = (LucideIcons[cat.icon as keyof typeof LucideIcons] as LucideIcons.LucideIcon) || LucideIcons.Package;
            const displayName = currentLang === 'zh' ? cat.name_zh : (cat.name_en || cat.name_zh);
            const isActive = selectedCategory === cat.slug;

            return (
              <button
                key={cat.id}
                onClick={() => onCategoryChange(cat.slug)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition-all ${
                  isActive
                    ? activeClasses[themeColor]
                    : 'text-gray-500 hover:bg-white dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100'
                }`}
              >
                <IconComponent className={`w-4 h-4 ${isActive ? 'opacity-100' : 'opacity-50'}`} />
                {displayName}
              </button>
            );
          })}
        </nav>
      </div>
    </aside>
  );
};

export default StoreSidebar;
