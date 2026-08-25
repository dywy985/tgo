/**
 * StaffTable — 客服负载表
 */

import React from 'react';
import type { StaffStatsResponse } from '../../types/dashboard';

interface StaffTableProps {
  staff: StaffStatsResponse | null;
}

const fmtDuration = (seconds: number): string => {
  if (seconds <= 0) return '--';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m${seconds % 60 ? `${seconds % 60}s` : ''}`;
  return `${(seconds / 3600).toFixed(1)}h`;
};

export const StaffTable: React.FC<StaffTableProps> = ({ staff }) => {
  const items = staff?.items ?? [];
  const totalReplies = items.reduce((acc, i) => acc + i.reply_count, 0);
  const totalSessions = items.reduce((acc, i) => acc + i.session_count, 0);

  return (
    <div className="bg-white/70 dark:bg-gray-900/70 backdrop-blur-lg border border-gray-200/50 dark:border-gray-700/50 rounded-xl p-4">
      <h2 className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-3">客服负载</h2>

      {items.length === 0 ? (
        <div className="text-sm text-gray-400 py-6 text-center">暂无数据</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400 border-b border-gray-200/50 dark:border-gray-700/50">
                <th className="py-2 pr-4 font-medium">客服</th>
                <th className="py-2 pr-4 font-medium">处理会话</th>
                <th className="py-2 pr-4 font-medium">回复消息</th>
                <th className="py-2 pr-4 font-medium">人均响应</th>
                <th className="py-2 font-medium">主动接管</th>
              </tr>
            </thead>
            <tbody>
              {items.slice(0, 10).map((item) => (
                <tr key={item.staff_id} className="border-b border-gray-100 dark:border-gray-800 last:border-0">
                  <td className="py-2.5 pr-4 text-gray-900 dark:text-gray-100 font-medium">
                    {item.staff_name}
                  </td>
                  <td className="py-2.5 pr-4 text-gray-600 dark:text-gray-300 tabular-nums">
                    {item.session_count}
                  </td>
                  <td className="py-2.5 pr-4 text-gray-600 dark:text-gray-300 tabular-nums">
                    {item.reply_count}
                  </td>
                  <td className="py-2.5 pr-4 text-gray-600 dark:text-gray-300 tabular-nums">
                    {totalReplies && totalSessions
                      ? fmtDuration(Math.round(totalReplies / Math.max(totalSessions, 1)))
                      : '--'}
                  </td>
                  <td className="py-2.5 text-gray-600 dark:text-gray-300 tabular-nums">
                    {item.handoff_handled}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
