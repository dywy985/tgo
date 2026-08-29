/**
 * AiHealthCard — AI 运行状况：成功率（环形）+ 请求量 + Token 消耗
 */

import React from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import type { AIUsageStats } from '../../types/dashboard';

interface AiHealthCardProps {
  ai: AIUsageStats | null;
}

const fmt = (n: number) => (n ?? 0).toLocaleString('zh-CN');

// Token 数字格式化: >= 1M 显示 xx.xM, >= 1k 显示 x.xk, 否则原样
const fmtTokens = (n: number) => {
  const v = n ?? 0;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return String(v);
};

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
              {fmt(ai?.request_count ?? 0)}
            </div>
            <div className="text-xs text-gray-400">请求次数</div>
          </div>
          <div>
            <div className="text-lg font-medium text-gray-900 dark:text-gray-100 tabular-nums">
              {ai?.avg_response_ms ? `${(ai.avg_response_ms / 1000).toFixed(1)}s` : '--'}
            </div>
            <div className="text-xs text-gray-400">平均响应</div>
          </div>
          <div>
            <div className="text-lg font-medium text-gray-900 dark:text-gray-100 tabular-nums">
              {fmt(ai?.failure_count ?? 0)}
            </div>
            <div className="text-xs text-gray-400">失败次数</div>
          </div>
        </div>
      </div>

      {/* Token 消耗区 */}
      <div className="mt-3 pt-3 border-t border-gray-200/50 dark:border-gray-700/50 grid grid-cols-3 gap-2">
        <div className="text-center">
          <div className="text-base font-semibold text-violet-600 dark:text-violet-400 tabular-nums">
            {fmtTokens(ai?.prompt_tokens ?? 0)}
          </div>
          <div className="text-[10px] text-gray-400">Prompt Tokens</div>
        </div>
        <div className="text-center">
          <div className="text-base font-semibold text-sky-600 dark:text-sky-400 tabular-nums">
            {fmtTokens(ai?.completion_tokens ?? 0)}
          </div>
          <div className="text-[10px] text-gray-400">生成 Tokens</div>
        </div>
        <div className="text-center">
          <div className="text-base font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
            {fmtTokens(ai?.total_tokens ?? 0)}
          </div>
          <div className="text-[10px] text-gray-400">总 Tokens</div>
        </div>
      </div>
    </div>
  );
};
