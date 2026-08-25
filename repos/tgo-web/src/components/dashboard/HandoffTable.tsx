/**
 * HandoffTable — 转人工明细（分页 + 导出 CSV）
 */

import React, { useCallback, useState } from 'react';
import { LuDownload } from 'react-icons/lu';
import type { HandoffListResponse, HandoffItem } from '../../types/dashboard';

interface HandoffTableProps {
  handoffs: HandoffListResponse | null;
  loading?: boolean;
  onPageChange: (page: number) => void;
}

const fmtTime = (iso: string): string => {
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

function exportCsv(items: HandoffItem[]): void {
  const header = ['时间', '访客', '原因', '分配客服', '渠道', '状态'];
  const rows = items.map((i) => [
    fmtTime(i.happened_at),
    i.visitor_name,
    i.reason ?? '',
    i.staff_name ?? '',
    i.channel ?? '',
    i.status === 'assigned' ? '已分配' : '排队中',
  ]);
  const csv = [header, ...rows]
    .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `转人工明细_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const PAGE_SIZE = 20;

export const HandoffTable: React.FC<HandoffTableProps> = ({ handoffs, loading, onPageChange }) => {
  const [page, setPage] = useState(1);
  const items = handoffs?.items ?? [];
  const total = handoffs?.total ?? 0;
  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  const handlePage = useCallback(
    (next: number) => {
      if (next < 1 || next > totalPages) return;
      setPage(next);
      onPageChange(next);
    },
    [totalPages, onPageChange],
  );

  return (
    <div className="bg-white/70 dark:bg-gray-900/70 backdrop-blur-lg border border-gray-200/50 dark:border-gray-700/50 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium text-gray-700 dark:text-gray-200">转人工明细</h2>
        <button
          onClick={() => exportCsv(items)}
          disabled={items.length === 0}
          className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-40"
        >
          <LuDownload className="w-3.5 h-3.5" />
          导出 CSV
        </button>
      </div>

      {items.length === 0 ? (
        <div className="text-sm text-gray-400 py-6 text-center">
          {loading ? '加载中…' : '暂无转人工记录'}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400 border-b border-gray-200/50 dark:border-gray-700/50">
                <th className="py-2 pr-4 font-medium">时间</th>
                <th className="py-2 pr-4 font-medium">访客</th>
                <th className="py-2 pr-4 font-medium">原因</th>
                <th className="py-2 pr-4 font-medium">分配客服</th>
                <th className="py-2 pr-4 font-medium">渠道</th>
                <th className="py-2 font-medium">状态</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-gray-100 dark:border-gray-800 last:border-0">
                  <td className="py-2.5 pr-4 text-gray-500 dark:text-gray-400 tabular-nums whitespace-nowrap">
                    {fmtTime(item.happened_at)}
                  </td>
                  <td className="py-2.5 pr-4 text-gray-900 dark:text-gray-100 font-medium">
                    {item.visitor_name}
                  </td>
                  <td className="py-2.5 pr-4 text-gray-600 dark:text-gray-300 max-w-[220px] truncate">
                    {item.reason ?? <span className="text-gray-400">—</span>}
                  </td>
                  <td className="py-2.5 pr-4 text-gray-600 dark:text-gray-300">
                    {item.staff_name ?? <span className="text-gray-400">排队中</span>}
                  </td>
                  <td className="py-2.5 pr-4 text-gray-500 dark:text-gray-400">{item.channel ?? '—'}</td>
                  <td className="py-2.5">
                    {item.status === 'assigned' ? (
                      <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
                        已分配
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
                        排队中
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 分页 */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-end gap-2 mt-3 text-sm">
          <button
            onClick={() => handlePage(page - 1)}
            disabled={page <= 1}
            className="px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40 transition-colors"
          >
            上一页
          </button>
          <span className="text-xs text-gray-400 tabular-nums">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => handlePage(page + 1)}
            disabled={page >= totalPages}
            className="px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40 transition-colors"
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
};
