/**
 * DashboardPage — 监控面板
 * 布局：工具栏 → KPI 卡行 → 趋势区（含 AI 健康）→ 客服负载 → 转人工明细
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DashboardHeader } from '../components/dashboard/DashboardHeader';
import { KpiCardRow } from '../components/dashboard/KpiCardRow';
import { TrendSection } from '../components/dashboard/TrendSection';
import { AiHealthCard } from '../components/dashboard/AiHealthCard';
import { StaffTable } from '../components/dashboard/StaffTable';
import { HandoffTable } from '../components/dashboard/HandoffTable';
import { useStats } from '../hooks/useStats';
import { statsApiService, buildDateRange, type DateRange, type DateRangeKey } from '../services/statsApi';
import { platformsApiService, type PlatformResponse } from '../services/platformsApi';
import type { HandoffListResponse } from '../types/dashboard';

export const DashboardPage: React.FC = () => {
  const [range, setRange] = useState<DateRange>(() => buildDateRange('7d'));
  const [platformId, setPlatformId] = useState<string | null>(null);
  const [platforms, setPlatforms] = useState<{ id: string; name: string }[]>([]);
  const [handoffPage, setHandoffPage] = useState(1);
  const [handoffs, setHandoffs] = useState<HandoffListResponse | null>(null);
  const [handoffsLoading, setHandoffsLoading] = useState(false);

  const { overview, trends, staff, loading, error, refresh } = useStats(range, platformId);

  // 平台列表（筛选器用）
  useEffect(() => {
    let cancelled = false;
    platformsApiService
      .listPlatforms()
      .then((res: { data: PlatformResponse[] }) => {
        if (cancelled) return;
        setPlatforms(
          (res?.data ?? []).map((p) => ({
            id: p.id,
            name: p.display_name || p.name || p.id,
          })),
        );
      })
      .catch(() => {
        /* 平台筛选失败不阻塞面板 */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 转人工明细（独立分页拉取）
  useEffect(() => {
    let cancelled = false;
    setHandoffsLoading(true);
    statsApiService
      .getHandoffs({ start: range.start, end: range.end, platform_id: platformId }, handoffPage, 20)
      .then((data) => {
        if (!cancelled) setHandoffs(data);
      })
      .catch(() => {
        if (!cancelled) setHandoffs(null);
      })
      .finally(() => {
        if (!cancelled) setHandoffsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range.start, range.end, platformId, handoffPage]);

  const handleRangeChange = useCallback((key: DateRangeKey) => {
    setRange(buildDateRange(key));
    setHandoffPage(1);
  }, []);

  const handlePlatformChange = useCallback((id: string | null) => {
    setPlatformId(id);
    setHandoffPage(1);
  }, []);

  // KPI sparkline 数据源（从趋势序列提取）
  const trendSeries = useMemo(() => {
    if (!trends) return undefined;
    return {
      sessions: trends.sessions,
      ai: trends.messages.ai,
      handoffs: trends.handoffs,
    };
  }, [trends]);

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <DashboardHeader
        range={range}
        onRangeChange={handleRangeChange}
        platformId={platformId}
        onPlatformChange={handlePlatformChange}
        platforms={platforms}
        loading={loading}
        onRefresh={refresh}
      />

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
          {error}
          <button onClick={refresh} className="ml-2 underline hover:no-underline">
            重试
          </button>
        </div>
      )}

      {/* KPI 行 */}
      <div className="mb-4">
        <KpiCardRow overview={overview} trendSeries={trendSeries} />
      </div>

      {/* 趋势区 + AI 健康 */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 mb-4">
        <div className="xl:col-span-2">
          <TrendSection trends={trends} />
        </div>
        <AiHealthCard ai={overview?.ai ?? null} />
      </div>

      {/* 客服负载 */}
      <div className="mb-4">
        <StaffTable staff={staff} />
      </div>

      {/* 转人工明细 */}
      <HandoffTable handoffs={handoffs} loading={handoffsLoading} onPageChange={setHandoffPage} />
    </div>
  );
};

export default DashboardPage;
