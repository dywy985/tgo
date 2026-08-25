import React from 'react';
import * as LucideIcons from 'lucide-react';
import type { ToolStoreCategory } from '@/types';

interface ToolStoreCategoryFilterProps {
  categories: ToolStoreCategory[];
  selectedCategory: string;
  onCategoryChange: (categoryId: string) => void;
  className?: string;
}

/**
 * Icon mapping for categories
 */
const getIconComponent = (iconName: string): LucideIcons.LucideIcon => {
  return (LucideIcons[iconName as keyof typeof LucideIcons] as LucideIcons.LucideIcon) || LucideIcons.Grid3X3;
};

/**
 * Tool Store Category Filter component
 */
const ToolStoreCategoryFilter: React.FC<ToolStoreCategoryFilterProps> = ({
  categories,
  selectedCategory,
  onCategoryChange,
  className = ''
}) => {
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {categories.map((category) => {
        const IconComponent = getIconComponent(category.icon);
        const isSelected = selectedCategory === category.id;
        
        return (
          <button
            key={category.id}
            onClick={() => onCategoryChange(category.id)}
            className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
              isSelected
                ? 'bg-blue-500 text-white shadow-sm'
                : 'bg-white/60 text-gray-600 hover:bg-white/80 hover:text-gray-800 border border-gray-200/60'
            }`}
          >
            <IconComponent className="w-4 h-4" />
            <span>{category.label}</span>
          </button>
        );
      })}
    </div>
  );
};

export default ToolStoreCategoryFilter;
