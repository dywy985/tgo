/**
 * AiHealthCard — AI 运行状况：成功率（环形）+ 平均响应
 */

import React from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import type { AIUsageStats } from '../../types/dashboard';

interface AiHealthCardProps {
  ai: AIUsageStats | null;
}

export const AiHealthCard: React.FC<AiHealthCardProps> = ({ ai }) => {
  const successRate = ai?.success_rate ?? 0;
  const ratePct = Math.round(successRate * 100);
  const pieData = [
    { name: '成功', value: successRate },
    { name: '失败', value: Math.max(1 - successRate, 0) },
  ];

  return (
    <div className="bg-white/70 dark:bg-gray-900/70 backdrop-blur-lg border border-gray-200/50 dark:border-gray-700/50 rounded-xl p-4 flex flex-col">
      <h2 className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">AI 运行状况</h2>

      <div className="flex items-center justify-around flex-1">
        {/* 成功率环形 */}
        <div className="relative w-28 h-28">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                innerRadius={38}
                outerRadius={52}
                startAngle={90}
                endAngle={-270}
                stroke="none"
                isAnimationActive={false}
              >
                <Cell fill="#10B981" />
                <Cell fill="#374151" fillOpacity={0.15} />
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex items-center justify-center flex-col">
            <span className="text-xl font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
              {ratePct}%
            </span>
            <span className="text-[10px] text-gray-400">成功率</span>
          </div>
        </div>

        {/* 数字区 */}
        <div className="space-y-3">
          <div>
            <div className="text-2xl font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
              {ai?.avg_response_ms ? `${(ai.avg_response_ms / 1000).toFixed(1)}s` : '--'}
            </div>
            <div className="text-xs text-gray-400">平均响应</div>
          </div>
          <div>
            <div className="text-lg font-medium text-gray-900 dark:text-gray-100 tabular-nums">
              {(ai?.failure_count ?? 0).toLocaleString('zh-CN')}
            </div>
            <div className="text-xs text-gray-400">失败次数</div>
          </div>
        </div>
      </div>
    </div>
  );
};
