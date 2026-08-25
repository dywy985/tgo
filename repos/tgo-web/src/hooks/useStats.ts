/**
 * useStats hook — 监控面板数据获取（overview + trends + staff）
 * handoffs 明细由 DashboardPage 单独管理（含分页）。
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { statsApiService, type DateRange } from '../services/statsApi';
import type {
  OverviewResponse,
  StaffStatsResponse,
  TrendsResponse,
} from '../types/dashboard';

export interface UseStatsResult {
  overview: OverviewResponse | null;
  trends: TrendsResponse | null;
  staff: StaffStatsResponse | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useStats(range: DateRange, platformId: string | null): UseStatsResult {
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [trends, setTrends] = useState<TrendsResponse | null>(null);
  const [staff, setStaff] = useState<StaffStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const query = useMemo(
    () => ({ start: range.start, end: range.end, platform_id: platformId }),
    [range.start, range.end, platformId],
  );
  const granularity = useMemo(() => (range.key === 'today' ? 'hour' : 'day'), [range.key]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.allSettled([
      statsApiService.getOverview(query),
      statsApiService.getTrends(query, granularity),
      statsApiService.getStaffStats(query),
    ]).then(([ov, tr, st]) => {
      if (cancelled) return;
      const failures: string[] = [];
      if (ov.status === 'fulfilled') setOverview(ov.value);
      else failures.push(ov.reason?.message ?? 'overview');
      if (tr.status === 'fulfilled') setTrends(tr.value);
      else failures.push(tr.reason?.message ?? 'trends');
      if (st.status === 'fulfilled') setStaff(st.value);
      else failures.push(st.reason?.message ?? 'staff');

      if (failures.length) setError(`部分数据加载失败：${failures.join('、')}`);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [range.start, range.end, range.key, platformId, granularity, tick]);

  return { overview, trends, staff, loading, error, refresh };
}
