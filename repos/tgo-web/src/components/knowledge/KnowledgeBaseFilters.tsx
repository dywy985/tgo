import React from 'react';
import Icon from '../ui/Icon';
import Button from '../ui/Button';

interface FilterOption {
  value: string;
  label: string;
}

interface QuickFilter {
  id: string;
  label: string;
}

type FilterType = 'all' | 'published' | 'draft' | 'archived';
type QuickFilterType = 'recent' | 'popular' | 'mine';

interface KnowledgeBaseFiltersProps {
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  selectedFilter?: FilterType;
  onFilterChange?: (filter: FilterType) => void;
  activeQuickFilter?: QuickFilterType;
  onQuickFilterChange?: (quickFilter: QuickFilterType) => void;
}

// Mock data for filters (since we don't have the original constants)
const FILTER_OPTIONS: FilterOption[] = [
  { value: 'all', label: '全部状态' },
  { value: 'published', label: '已发布' },
  { value: 'draft', label: '草稿' },
  { value: 'archived', label: '已归档' }
];

const QUICK_FILTERS: QuickFilter[] = [
  { id: 'recent', label: '最近更新' },
  { id: 'popular', label: '热门' },
  { id: 'mine', label: '我的' }
];

/**
 * Knowledge base filters component
 */
const KnowledgeBaseFilters: React.FC<KnowledgeBaseFiltersProps> = ({
  searchQuery = '',
  onSearchChange,
  selectedFilter = 'all',
  onFilterChange,
  activeQuickFilter = 'recent',
  onQuickFilterChange
}) => {
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    onSearchChange?.(e.target.value);
  };

  const handleFilterChange = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    onFilterChange?.(e.target.value as FilterType);
  };

  const handleQuickFilterChange = (filterId: string): void => {
    onQuickFilterChange?.(filterId as QuickFilterType);
  };

  return (
    <div className="space-y-3">
      {/* Search and Filters */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        {/* Search Input */}
        <div className="relative flex-grow max-w-xs">
          <input 
            type="text" 
            placeholder="搜索知识库..." 
            value={searchQuery}
            onChange={handleSearchChange}
            className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-300/70 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white/80"
          />
          <Icon 
            name="Search" 
            size={16} 
            className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-gray-400" 
          />
        </div>

        {/* Filter Dropdown */}
        <div className="flex items-center space-x-2 flex-shrink-0">
          <span className="text-sm text-gray-500">筛选:</span>
          <select 
            value={selectedFilter}
            onChange={handleFilterChange}
            className="text-sm border border-gray-300/70 rounded-md py-1.5 pl-2 pr-7 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white/80 appearance-none"
          >
            {FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Quick Filters */}
      <div className="flex items-center space-x-2 flex-wrap gap-y-2">
        <span className="text-sm text-gray-500 mr-1 flex-shrink-0">快速筛选:</span>
        {QUICK_FILTERS.map((filter) => (
          <Button
            key={filter.id}
            variant={activeQuickFilter === filter.id ? 'primary' : 'secondary'}
            size="sm"
            className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
              activeQuickFilter === filter.id 
                ? 'bg-blue-500 text-white' 
                : 'bg-gray-200/70 text-gray-700 hover:bg-gray-300/70'
            }`}
            onClick={() => handleQuickFilterChange(filter.id)}
          >
            {filter.label}
          </Button>
        ))}
      </div>
    </div>
  );
};

export default KnowledgeBaseFilters;
