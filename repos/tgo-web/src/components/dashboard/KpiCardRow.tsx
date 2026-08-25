/**
 * KpiCardRow — 5 张 KPI 卡（回答问题总数/会话总数/转人工数/转人工率/AI请求量）
 */

import React from 'react';
import {
  LuMessageSquareText,
  LuMessagesSquare,
  LuUserRoundCog,
  LuPercent,
  LuCpu,
} from 'react-icons/lu';
import { KpiCard } from './KpiCard';
import type { OverviewResponse } from '../../types/dashboard';

interface KpiCardRowProps {
  overview: OverviewResponse | null;
  trendSeries?: Record<string, number[]>;
}

const fmt = (n: number) => n.toLocaleString('zh-CN');

export const KpiCardRow: React.FC<KpiCardRowProps> = ({ overview, trendSeries }) => {
  if (!overview) return null;

  const { answered, sessions, handoff, messages, ai } = overview;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
      <KpiCard
        icon={LuMessageSquareText}
        label="回答问题总数"
        value={fmt(answered.ai_reply_count)}
        sub={`AI 服务 ${fmt(answered.ai_session_count)} 个会话`}
        sparkline={trendSeries?.ai}
      />
      <KpiCard
        icon={LuMessagesSquare}
        label="会话总数"
        value={fmt(sessions.total)}
        sub={`进行中 ${fmt(sessions.open)} · 访客消息 ${fmt(messages.visitor)}`}
        sparkline={trendSeries?.sessions}
        sparkColor="#10B981"
        accent="bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400"
      />
      <KpiCard
        icon={LuUserRoundCog}
        label="转人工数"
        value={fmt(handoff.count)}
        sub="AI 发起 + 客服转接"
        sparkline={trendSeries?.handoffs}
        sparkColor="#F59E0B"
        accent="bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400"
      />
      <KpiCard
        icon={LuPercent}
        label="转人工率"
        value={`${(handoff.rate * 100).toFixed(1)}%`}
        sub="转人工会话 ÷ AI 服务会话"
        sparkline={trendSeries?.handoffs}
        sparkColor="#EF4444"
        accent="bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400"
      />
      <KpiCard
        icon={LuCpu}
        label="AI 请求量"
        value={fmt(ai.request_count)}
        sub={`成功率 ${(ai.success_rate * 100).toFixed(1)}% · 均响 ${ai.avg_response_ms ? `${Math.round(ai.avg_response_ms / 1000 * 10) / 10}s` : '--'}`}
        sparkColor="#8B5CF6"
        accent="bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-400"
      />
    </div>
  );
};
