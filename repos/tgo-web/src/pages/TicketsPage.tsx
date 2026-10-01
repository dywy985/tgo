import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import Icon from '@/components/ui/Icon';
import Pagination from '@/components/ui/Pagination';
import { useAuthStore } from '@/stores/authStore';
import {
  ticketsApiService,
  type Ticket,
  type TicketListQuery,
  type TicketPriority,
  type TicketStatus,
  TICKET_PRIORITY_COLORS,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_COLORS,
  TICKET_STATUS_LABELS,
} from '@/services/ticketsApi';

const STATUS_OPTIONS: Array<{ value: TicketStatus | ''; label: string }> = [
  { value: '', label: '全部状态' },
  { value: 'pending_reply', label: '待回复' },
  { value: 'replied', label: '已回复' },
  { value: 'archived', label: '已归档' },
];

const PRIORITY_OPTIONS: Array<{ value: TicketPriority | ''; label: string }> = [
  { value: '', label: '全部优先级' },
  { value: 'urgent', label: '紧急' },
  { value: 'high', label: '高' },
  { value: 'normal', label: '普通' },
  { value: 'low', label: '低' },
];

const PAGE_SIZE = 20;

const TicketsPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isAdmin = useAuthStore((state) => state.user?.role === 'admin');

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [categories, setCategories] = useState<string[]>([]);

  const [status, setStatus] = useState<TicketStatus | ''>('');
  const [priority, setPriority] = useState<TicketPriority | ''>('');
  const [category, setCategory] = useState('');
  const [keyword, setKeyword] = useState('');
  const [myOnly, setMyOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [rowActionId, setRowActionId] = useState<string | null>(null);

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const query: TicketListQuery = {
        status,
        priority,
        category: category || undefined,
        keyword: keyword || undefined,
        assignee_id: myOnly ? (useAuthStore.getState().user?.id || undefined) : undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      };
      const resp = await ticketsApiService.listTickets(query);
      setTickets(resp.data);
      setTotal(resp.pagination.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [status, priority, category, keyword, myOnly, page]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  // 拉取分类列表（来自设置）
  useEffect(() => {
    ticketsApiService
      .getSettings()
      .then((s) => setCategories(s.categories || []))
      .catch(() => {
        /* 忽略：设置接口失败不影响列表 */
      });
  }, []);

  const handleSearch = () => {
    setPage(0);
    fetchTickets();
  };

  const handleReset = () => {
    setStatus('');
    setPriority('');
    setCategory('');
    setKeyword('');
    setPage(0);
  };

  const handleStatusChange = async (ticket: Ticket, nextStatus: TicketStatus) => {
    setRowActionId(ticket.id);
    setError('');
    try {
      await ticketsApiService.changeStatus(ticket.id, nextStatus, '管理员在工单列表手动调整');
      await fetchTickets();
    } catch (err) {
      setError(err instanceof Error ? err.message : '状态修改失败');
    } finally {
      setRowActionId(null);
    }
  };

  const handleDelete = async (ticket: Ticket) => {
    if (!window.confirm(`确定删除工单 ${ticket.number} 吗？删除后将不再显示。`)) return;
    setRowActionId(ticket.id);
    setError('');
    try {
      await ticketsApiService.deleteTicket(ticket.id);
      await fetchTickets();
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    } finally {
      setRowActionId(null);
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="flex-1 flex flex-col h-full bg-gray-50 dark:bg-gray-900 overflow-hidden relative">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400">
            <Icon name="Ticket" size={20} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">
              {t('ticket.management.title', '工单管理')}
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t('ticket.management.subtitle', '跟踪客户消息是否获得人工回复')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider font-semibold">
              {t('ticket.management.totalTickets', '工单总数')}
            </p>
            <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{total.toLocaleString()}</p>
          </div>
          <button
            onClick={fetchTickets}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
            title="刷新"
          >
            <Icon name="RefreshCw" size={18} />
          </button>
          <button
            onClick={() => navigate('/settings/tickets')}
            className="px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
          >
            工单设置
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex-shrink-0 px-6 py-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex flex-wrap items-center gap-3">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as TicketStatus | '')}
          className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as TicketPriority | '')}
          className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"
        >
          {PRIORITY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"
        >
          <option value="">全部分类</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="搜索标题/内容"
          className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 w-56"
        />

        <label className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300 select-none">
          <input
            type="checkbox"
            checked={myOnly}
            onChange={(e) => {
              setMyOnly(e.target.checked);
              setPage(0);
            }}
            className="accent-blue-600"
          />
          仅我的
        </label>

        <button
          onClick={handleSearch}
          className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
        >
          查询
        </button>
        <button
          onClick={handleReset}
          className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
        >
          重置
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {error && (
          <div className="m-4 px-4 py-3 text-sm text-red-600 bg-red-50 dark:bg-red-900/30 rounded-lg">{error}</div>
        )}

        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left px-6 py-3 font-semibold">工单号</th>
              <th className="text-left px-4 py-3 font-semibold">标题</th>
              <th className="text-left px-4 py-3 font-semibold">分类</th>
              <th className="text-left px-4 py-3 font-semibold">客服</th>
              <th className="text-left px-4 py-3 font-semibold">状态</th>
              <th className="text-left px-4 py-3 font-semibold">优先级</th>
              <th className="text-left px-4 py-3 font-semibold">创建时间</th>
              <th className="text-left px-4 py-3 font-semibold">操作</th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800">
            {loading && tickets.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-10 text-center text-gray-400">
                  加载中...
                </td>
              </tr>
            ) : tickets.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-10 text-center text-gray-400">
                  暂无工单
                </td>
              </tr>
            ) : (
              tickets.map((tk) => (
                <tr
                  key={tk.id}
                  onClick={() => navigate(`/tickets/${tk.id}`)}
                  className="border-t border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
                >
                  <td className="px-6 py-3 font-mono text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    {tk.number}
                  </td>
                  <td className="px-4 py-3 text-gray-800 dark:text-gray-200 max-w-xs truncate">{tk.title}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">{tk.category}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                    {tk.assignee_name || '—'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {isAdmin ? (
                      <select
                        aria-label={`设置工单 ${tk.number} 状态`}
                        value={tk.status}
                        disabled={rowActionId === tk.id}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => handleStatusChange(tk, e.target.value as TicketStatus)}
                        className={`rounded-md border-0 px-2 py-1 text-xs font-medium disabled:opacity-50 ${TICKET_STATUS_COLORS[tk.status]}`}
                      >
                        {STATUS_OPTIONS.filter((option) => option.value).map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    ) : (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TICKET_STATUS_COLORS[tk.status]}`}>
                        {TICKET_STATUS_LABELS[tk.status]}
                      </span>
                    )}
                  </td>
                  <td className={`px-4 py-3 whitespace-nowrap ${TICKET_PRIORITY_COLORS[tk.priority]}`}>
                    {TICKET_PRIORITY_LABELS[tk.priority]}
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    {new Date(tk.created_at).toLocaleString('zh-CN', { hour12: false })}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap space-x-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); navigate(`/tickets/${tk.id}?edit=1`); }}
                      className="px-2.5 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-md"
                    >
                      编辑
                    </button>
                    {isAdmin && (
                      <button
                        disabled={rowActionId === tk.id}
                        onClick={(e) => { e.stopPropagation(); void handleDelete(tk); }}
                        className="px-2.5 py-1 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-md disabled:opacity-50"
                      >
                        删除
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex-shrink-0 px-6 py-3 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
          <Pagination
            currentPage={page + 1}
            totalPages={totalPages}
            onPageChange={(p) => setPage(p - 1)}
          />
        </div>
      )}

    </div>
  );
};

export default TicketsPage;
