/**
 * DashboardHeader — 工具栏：标题 + 时间范围 + 平台筛选 + 刷新
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { LuRefreshCw } from 'react-icons/lu';
import type { DateRange, DateRangeKey } from '../../services/statsApi';

interface DashboardHeaderProps {
  range: DateRange;
  onRangeChange: (key: DateRangeKey, start?: string, end?: string) => void;
  platformId: string | null;
  onPlatformChange: (id: string | null) => void;
  platforms: { id: string; name: string }[];
  loading: boolean;
  onRefresh: () => void;
}

const RANGE_OPTIONS: { key: DateRangeKey; label: string }[] = [
  { key: 'today', label: '今日' },
  { key: '7d', label: '近7日' },
  { key: '30d', label: '近30日' },
  { key: 'custom', label: '自定义' },
];

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  range,
  onRangeChange,
  platformId,
  onPlatformChange,
  platforms,
  loading,
  onRefresh,
}) => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
        {t('dashboard.title', '监控面板')}
      </h1>

      <div className="flex flex-wrap items-center gap-2">
        {/* 时间范围 */}
        <div className="flex items-center gap-1 bg-white/70 dark:bg-gray-900/70 border border-gray-200/50 dark:border-gray-700/50 rounded-lg p-1">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => onRangeChange(opt.key)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                range.key === opt.key
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* 平台筛选 */}
        <select
          value={platformId ?? ''}
          onChange={(e) => onPlatformChange(e.target.value || null)}
          className="bg-white/70 dark:bg-gray-900/70 border border-gray-200/50 dark:border-gray-700/50 rounded-lg px-3 py-2 text-sm text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
        >
          <option value="">全部平台</option>
          {platforms.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        {/* 刷新 */}
        <button
          onClick={onRefresh}
          disabled={loading}
          className="p-2 rounded-lg bg-white/70 dark:bg-gray-900/70 border border-gray-200/50 dark:border-gray-700/50 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
          title="刷新数据"
        >
          <LuRefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
    </div>
  );
};
