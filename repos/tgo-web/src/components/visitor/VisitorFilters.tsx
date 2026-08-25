import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '@/components/ui/Icon';
import Select from '@/components/ui/Select';
import { useVisitorStore } from '@/stores/visitorStore';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { tagsApiService, type TagResponse } from '@/services/tagsApi';
import { platformsApiService, type PlatformResponse } from '@/services/platformsApi';
import { X } from 'lucide-react';

import { normalizeTagHex, hexToRgba } from '@/utils/tagUtils';

const VisitorFilters: React.FC = () => {
  const { t } = useTranslation();
  const { filters, setFilters, resetFilters } = useVisitorStore();
  
  const [searchValue, setSearchValue] = useState(filters.search || '');
  const debouncedSearch = useDebouncedValue(searchValue, 300);

  const [availableTags, setAvailableTags] = useState<TagResponse[]>([]);
  const [isLoadingTags, setIsLoadingTags] = useState(false);
  
  const [platforms, setPlatforms] = useState<PlatformResponse[]>([]);
  const [isLoadingPlatforms, setIsLoadingPlatforms] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoadingTags(true);
      setIsLoadingPlatforms(true);
      try {
        const [tagsResp, platformsResp] = await Promise.all([
          tagsApiService.listVisitorTags({ limit: 100 }),
          platformsApiService.listPlatforms({ limit: 100 })
        ]);
        setAvailableTags(tagsResp.data || []);
        setPlatforms(platformsResp.data || []);
      } catch (err) {
        console.error('Failed to fetch filter data:', err);
      } finally {
        setIsLoadingTags(false);
        setIsLoadingPlatforms(false);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    if (debouncedSearch !== filters.search) {
      setFilters({ search: debouncedSearch });
    }
  }, [debouncedSearch, filters.search, setFilters]);

  const platformOptions = useMemo(() => {
    return [
      { value: '', label: t('visitor.filters.platform.all', '所有平台') },
      ...platforms.map(p => ({
        value: p.id,
        label: p.display_name || p.name || p.type,
      }))
    ];
  }, [platforms, t]);

  const onlineOptions = [
    { value: '', label: t('visitor.filters.online.all', '所有状态') },
    { value: 'true', label: t('visitor.filters.online.online', '在线') },
    { value: 'false', label: t('visitor.filters.online.offline', '离线') },
  ];

  const tagOptions = useMemo(() => {
    return [
      { value: '', label: t('visitor.filters.tags.all', '所有标签') },
      ...availableTags.map(tag => ({
        value: tag.id,
        label: tag.display_name || tag.name,
        color: normalizeTagHex(tag.color),
      }))
    ];
  }, [availableTags, t]);

  const sortOptions = [
    { value: 'last_offline_time:desc', label: t('visitor.filters.sort.lastVisit', '最近活跃') },
    { value: 'created_at:desc', label: t('visitor.filters.sort.createdAt', '最新创建') },
  ];

  const handlePlatformChange = (value: string) => {
    setFilters({ platform_id: value || undefined });
  };

  const handleOnlineChange = (value: string) => {
    setFilters({ is_online: value === '' ? undefined : value === 'true' });
  };

  const handleTagSelect = (tagId: string) => {
    if (!tagId) return;
    const currentTags = filters.tag_ids || [];
    if (!currentTags.includes(tagId)) {
      setFilters({ tag_ids: [...currentTags, tagId] });
    }
  };

  const handleSortChange = (value: string) => {
    const [sortBy, sortOrder] = value.split(':');
    setFilters({ 
      sort_by: sortBy, 
      sort_order: (sortOrder || 'desc') as 'asc' | 'desc' 
    });
  };

  const removeTag = (tagId: string) => {
    const currentTags = filters.tag_ids || [];
    setFilters({ tag_ids: currentTags.filter(id => id !== tagId) });
  };

  const hasFilters = searchValue || filters.platform_id || filters.is_online !== undefined || (filters.tag_ids && filters.tag_ids.length > 0);

  return (
    <div className="space-y-4 mb-6">
      <div className="flex flex-wrap items-center gap-4">
        {/* Search Input */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Icon
            name="Search"
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            placeholder={t('visitor.filters.search.placeholder', '搜索名称、邮箱或手机号...')}
            className="w-full pl-9 pr-4 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none dark:text-gray-100"
          />
        </div>

        {/* Platform Filter */}
        <div className="w-40">
          <Select
            value={filters.platform_id || ''}
            onChange={handlePlatformChange}
            options={platformOptions}
            isLoading={isLoadingPlatforms}
          />
        </div>

        {/* Online Status Filter */}
        <div className="w-40">
          <Select
            value={filters.is_online === undefined ? '' : String(filters.is_online)}
            onChange={handleOnlineChange}
            options={onlineOptions}
          />
        </div>

        {/* Tag Filter */}
        <div className="w-48">
          <Select
            value=""
            onChange={handleTagSelect}
            options={tagOptions}
            placeholder={t('visitor.filters.tags.select', '按标签筛选')}
            isLoading={isLoadingTags}
          />
        </div>

        {/* Sort Order */}
        <div className="w-40">
          <Select
            value={`${filters.sort_by || 'last_visit_time'}:${filters.sort_order || 'desc'}`}
            onChange={handleSortChange}
            options={sortOptions}
          />
        </div>

        {/* Reset Button */}
        {hasFilters && (
          <button
            onClick={() => {
              setSearchValue('');
              resetFilters();
            }}
            className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
          >
            <Icon name="RotateCcw" size={14} />
            {t('common.reset', '重置')}
          </button>
        )}
      </div>

      {/* Selected Tags Chips */}
      {filters.tag_ids && filters.tag_ids.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-gray-500 dark:text-gray-400">{t('visitor.filters.tags.selected', '已选标签')}:</span>
          {filters.tag_ids.map(tagId => {
            const tag = availableTags.find(t => t.id === tagId);
            if (!tag) return null;
            
            const hex = normalizeTagHex(tag.color);
            return (
              <span
                key={tagId}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border transition-colors"
                style={{
                  backgroundColor: hexToRgba(hex, 0.1),
                  color: hex,
                  borderColor: hexToRgba(hex, 0.2),
                }}
              >
                {tag.display_name || tag.name}
                <button
                  onClick={() => removeTag(tagId)}
                  className="ml-1 p-0.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                  aria-label={t('common.remove', '移除')}
                >
                  <X size={12} />
                </button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default VisitorFilters;
