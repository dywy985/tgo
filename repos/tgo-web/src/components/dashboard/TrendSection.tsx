/**
 * TrendSection — 时间趋势：会话/消息/转人工 Tabs + ComposedChart
 */

import React, { useMemo, useState } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TrendsResponse } from '../../types/dashboard';

type TrendMetric = 'sessions' | 'messages' | 'handoffs';

const METRICS: { key: TrendMetric; label: string; color: string }[] = [
  { key: 'sessions', label: '会话数', color: '#3B82F6' },
  { key: 'messages', label: '消息数', color: '#10B981' },
  { key: 'handoffs', label: '转人工数', color: '#F59E0B' },
];

function formatBucket(iso: string, granularity: string): string {
  const d = new Date(iso);
  if (granularity === 'hour') {
    return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:00`;
  }
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface TrendSectionProps {
  trends: TrendsResponse | null;
}

export const TrendSection: React.FC<TrendSectionProps> = ({ trends }) => {
  const [metric, setMetric] = useState<TrendMetric>('sessions');

  const data = useMemo(() => {
    if (!trends) return [];
    return trends.buckets.map((b, i) => {
      const row: Record<string, string | number> = {
        bucket: formatBucket(b, trends.granularity),
        sessions: trends.sessions[i] ?? 0,
        handoffs: trends.handoffs[i] ?? 0,
        '消息-访客': trends.messages.visitor[i] ?? 0,
        '消息-AI': trends.messages.ai[i] ?? 0,
        '消息-客服': trends.messages.staff[i] ?? 0,
      };
      return row;
    });
  }, [trends]);

  const bars = useMemo(() => {
    if (metric === 'messages') {
      return [
        { key: '消息-访客', color: '#93C5FD' },
        { key: '消息-AI', color: '#10B981' },
        { key: '消息-客服', color: '#FBBF24' },
      ];
    }
    return [{ key: metric, color: METRICS.find((m) => m.key === metric)?.color ?? '#3B82F6' }];
  }, [metric]);

  return (
    <div className="bg-white/70 dark:bg-gray-900/70 backdrop-blur-lg border border-gray-200/50 dark:border-gray-700/50 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium text-gray-700 dark:text-gray-200">时间趋势</h2>
        <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
          {METRICS.map((m) => (
            <button
              key={m.key}
              onClick={() => setMetric(m.key)}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                metric === m.key
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" strokeOpacity={0.15} />
            <XAxis
              dataKey="bucket"
              tick={{ fontSize: 11, fill: '#9CA3AF' }}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={32}
            />
            <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip
              contentStyle={{
                borderRadius: 8,
                border: '1px solid rgba(107,114,128,0.3)',
                fontSize: 12,
                background: 'rgba(17,24,39,0.92)',
                color: '#E5E7EB',
              }}
              cursor={{ fill: 'rgba(59,130,246,0.06)' }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {bars.map((bar) => (
              <Bar key={bar.key} dataKey={bar.key} fill={bar.color} radius={[3, 3, 0, 0]} barSize={metric === 'messages' ? 8 : 14} />
            ))}
            {metric !== 'messages' && (
              <Line type="monotone" dataKey={metric} stroke={METRICS.find((m) => m.key === metric)?.color} strokeWidth={2} dot={false} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
