/**
 * KpiCard — 单个 KPI 卡片（大数值 + 环比 + 迷你趋势 sparkline）
 */

import React from 'react';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';
import type { IconType } from 'react-icons';

interface KpiCardProps {
  icon: IconType;
  label: string;
  value: string;
  sub?: string;
  sparkline?: number[];
  sparkColor?: string;
  accent?: string; // 图标底色 class
}

export const KpiCard: React.FC<KpiCardProps> = ({
  icon: Icon,
  label,
  value,
  sub,
  sparkline = [],
  sparkColor = '#3B82F6',
  accent = 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400',
}) => {
  const hasData = sparkline.length > 0 && sparkline.some((v) => v > 0);
  const sparkData = sparkline.length ? sparkline : [0, 0, 0, 0, 0, 0, 0];

  return (
    <div className="bg-white/70 dark:bg-gray-900/70 backdrop-blur-lg border border-gray-200/50 dark:border-gray-700/50 rounded-xl p-4 flex flex-col gap-2 min-w-0">
      <div className="flex items-center gap-2">
        <span className={`p-1.5 rounded-lg ${accent}`}>
          <Icon className="w-4 h-4" />
        </span>
        <span className="text-sm text-gray-500 dark:text-gray-400 truncate">{label}</span>
      </div>

      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <div className="text-2xl font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
            {value}
          </div>
          {sub && (
            <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate">{sub}</div>
          )}
        </div>
        <div className="w-24 h-10 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkData.map((v, i) => ({ i, v }))} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`spark-${label}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={sparkColor} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={sparkColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="v"
                stroke={sparkColor}
                strokeWidth={1.5}
                fill={hasData ? `url(#spark-${label})` : 'none'}
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
