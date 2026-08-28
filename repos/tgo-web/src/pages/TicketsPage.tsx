import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import Icon from '@/components/ui/Icon';
import Pagination from '@/components/ui/Pagination';
import TicketDynamicForm, { type DynamicFormValues } from '@/components/tickets/TicketDynamicForm';
import { useAuthStore } from '@/stores/authStore';
import {
  ticketsApiService,
  type Ticket,
  type TicketFormField,
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
  { value: 'open', label: '未处理' },
  { value: 'pending_human', label: '待人工' },
  { value: 'processing', label: '处理中' },
  { value: 'resolved', label: '已解决' },
  { value: 'closed', label: '已归档' },
  { value: 'rejected', label: '已拒绝' },
];

const PRIORITY_OPTIONS: Array<{ value: TicketPriority | ''; label: string }> = [
  { value: '', label: '全部优先级' },
  { value: 'urgent', label: '紧急' },
  { value: 'high', label: '高' },
  { value: 'normal', label: '普通' },
  { value: 'low', label: '低' },
];

const PAGE_SIZE = 20;

const CREATE_BUILTIN_KEYS = ['title', 'description', 'category', 'priority', 'assignee_id', 'visitor_id', 'group_key'];

function splitCreateValues(values: DynamicFormValues): {
  builtin: Record<string, unknown>;
  custom_fields: Record<string, unknown>;
} {
  const builtin: Record<string, unknown> = {};
  const custom_fields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    if (v === '' || v === null || v === undefined) continue;
    if (CREATE_BUILTIN_KEYS.includes(k)) builtin[k] = v;
    else custom_fields[k] = v;
  }
  return { builtin, custom_fields };
}

const TicketsPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

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

  // 新建工单弹窗
  const [showCreate, setShowCreate] = useState(false);
  const [createSchema, setCreateSchema] = useState<TicketFormField[]>([]);
  const [createValues, setCreateValues] = useState<DynamicFormValues>({});
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);

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

  // 打开新建弹窗（加载表单模板）
  const openCreate = async () => {
    setCreateError('');
    setCreateValues({});
    try {
      const s = await ticketsApiService.getSettings();
      setCreateSchema(s.form_schema || []);
    } catch {
      setCreateSchema([]);
    }
    setShowCreate(true);
  };

  const submitCreate = async () => {
    setCreateError('');
    setCreating(true);
    try {
      const { builtin, custom_fields } = splitCreateValues(createValues);
      // 必填校验（前端简单版，后端兜底）
      const requiredMissing = (createSchema || [])
        .filter((f) => f.required)
        .some((f) => {
          const v = createValues[f.key];
          return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
        });
      if (requiredMissing) {
        setCreateError('存在必填字段未填写');
        setCreating(false);
        return;
      }
      await ticketsApiService.createTicketWithFields({
        title: String(builtin.title ?? ''),
        description: String(builtin.description ?? ''),
        category: String(builtin.category ?? 'other'),
        priority: String(builtin.priority ?? 'normal'),
        source: 'staff_manual',
        group_key: builtin.group_key ? String(builtin.group_key) : undefined,
        custom_fields: Object.keys(custom_fields).length > 0 ? custom_fields : undefined,
      });
      setShowCreate(false);
      setPage(0);
      fetchTickets();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : '创建失败');
    } finally {
      setCreating(false);
    }
  };

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
              {t('ticket.management.subtitle', '跟踪需要处理的问题：转人工 / 未解决 / 待提醒')}
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
            onClick={openCreate}
            className="px-3 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            新建工单
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
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TICKET_STATUS_COLORS[tk.status]}`}>
                      {TICKET_STATUS_LABELS[tk.status]}
                    </span>
                  </td>
                  <td className={`px-4 py-3 whitespace-nowrap ${TICKET_PRIORITY_COLORS[tk.priority]}`}>
                    {TICKET_PRIORITY_LABELS[tk.priority]}
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    {new Date(tk.created_at).toLocaleString('zh-CN', { hour12: false })}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <button
                      onClick={(e) => { e.stopPropagation(); navigate(`/tickets/${tk.id}?edit=1`); }}
                      className="px-2.5 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-md"
                    >
                      编辑
                    </button>
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

      {/* 新建工单弹窗 */}
      {showCreate && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-auto m-4">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">新建工单</h2>
              <button
                onClick={() => setShowCreate(false)}
                className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
              >
                <Icon name="X" size={18} />
              </button>
            </div>
            <div className="p-6">
              <TicketDynamicForm
                fields={
                  createSchema.length > 0
                    ? createSchema
                    : [
                        { key: 'title', label: '标题', type: 'text', required: true, editable: true },
                        { key: 'description', label: '问题描述', type: 'textarea', required: true, editable: true },
                        { key: 'category', label: '分类', type: 'text', editable: true },
                        {
                          key: 'priority',
                          label: '优先级',
                          type: 'select',
                          options: ['low', 'normal', 'high', 'urgent'],
                          editable: true,
                        },
                      ]
                }
                values={createValues}
                onChange={(key: string, value: unknown) => setCreateValues((prev: DynamicFormValues) => ({ ...prev, [key]: value }))}
              />
              {createError && (
                <p className="mt-3 text-xs text-red-600 bg-red-50 dark:bg-red-900/30 rounded-lg px-3 py-2">
                  {createError}
                </p>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                取消
              </button>
              <button
                onClick={submitCreate}
                disabled={creating}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50"
              >
                {creating ? '创建中...' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TicketsPage;
