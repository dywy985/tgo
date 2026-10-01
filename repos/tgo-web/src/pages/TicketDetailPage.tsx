import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Icon from '@/components/ui/Icon';
import TicketDynamicForm, { type DynamicFormValues } from '@/components/tickets/TicketDynamicForm';
import { useAuthStore } from '@/stores/authStore';
import {
  ticketsApiService,
  type Ticket,
  type TicketComment,
  type TicketHistory,
  type TicketFormField,
  type TicketStatus,
  type ReplyMonitorTicketContext,
  TICKET_PRIORITY_COLORS,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_COLORS,
  TICKET_STATUS_LABELS,
} from '@/services/ticketsApi';
import { replyMonitorApi } from '@/services/replyMonitorApi';

// 详情页可执行的常用流转
const ACTION_TRANSITIONS = {
  replied: { status: 'archived', label: '归档', color: 'bg-gray-600 hover:bg-gray-700', icon: 'Archive' },
  archived: { status: 'replied', label: '恢复为已回复', color: 'bg-green-600 hover:bg-green-700', icon: 'RotateCcw' },
} as const;

const BUILTIN_KEYS = ['title', 'description', 'category', 'priority', 'assignee_id', 'visitor_id', 'group_key'];

// 展平：ticket → 表单值（内置字段 + custom_fields 展开）
function flattenTicket(ticket: Ticket): DynamicFormValues {
  const vals: DynamicFormValues = {
    title: ticket.title,
    description: ticket.description,
    category: ticket.category,
    priority: ticket.priority,
    assignee_id: ticket.assignee_id || '',
    visitor_id: ticket.visitor_name || ticket.visitor_id || '',
    group_key: ticket.group_key || '',
  };
  const cf = ticket.custom_fields || {};
  for (const [k, v] of Object.entries(cf)) {
    vals[k] = v;
  }
  return vals;
}

// 拆分：表单值 → { 内置字段, custom_fields }
function splitValues(values: DynamicFormValues): {
  builtin: Record<string, unknown>;
  custom_fields: Record<string, unknown>;
} {
  const builtin: Record<string, unknown> = {};
  const custom_fields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    if (BUILTIN_KEYS.includes(k)) {
      if (v === '' || v === null || v === undefined) continue;
      builtin[k] = v;
    } else {
      if (v === '' || v === null || v === undefined) continue;
      custom_fields[k] = v;
    }
  }
  return { builtin, custom_fields };
}

const TicketDetailPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isAdmin = useAuthStore((state) => state.user?.role === 'admin');

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [comments, setComments] = useState<TicketComment[]>([]);
  const [history, setHistory] = useState<TicketHistory[]>([]);
  const [monitorContext, setMonitorContext] = useState<ReplyMonitorTicketContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [commentText, setCommentText] = useState('');
  const [commentInternal, setCommentInternal] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [attachmentUrls, setAttachmentUrls] = useState<Record<string, string>>({});
  const [monitorMediaUrls, setMonitorMediaUrls] = useState<Record<string, string>>({});
  const [wecomDispatching, setWecomDispatching] = useState(false);

  // 编辑模式
  const [editing, setEditing] = useState(false);
  const [formSchema, setFormSchema] = useState<TicketFormField[]>([]);
  const [formValues, setFormValues] = useState<DynamicFormValues>({});
  const [savingEdit, setSavingEdit] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  const loadData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const [tk, cmts, hist] = await Promise.all([
        ticketsApiService.getTicket(id),
        ticketsApiService.getComments(id),
        ticketsApiService.getHistory(id),
      ]);
      setTicket(tk);
      setComments(cmts);
      setHistory(hist);
      if (tk.source === 'reply_monitor') {
        setMonitorContext(await ticketsApiService.getMonitorContext(id));
      } else {
        setMonitorContext(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    let active = true;
    const createdUrls: string[] = [];
    const loadAttachments = async () => {
      const entries = await Promise.all(
        (ticket?.attachments || []).map(async (attachment) => {
          try {
            const blob = await ticketsApiService.getAttachmentBlob(attachment.url);
            const objectUrl = URL.createObjectURL(blob);
            createdUrls.push(objectUrl);
            return [attachment.id, objectUrl] as const;
          } catch {
            return [attachment.id, ''] as const;
          }
        }),
      );
      if (active) setAttachmentUrls(Object.fromEntries(entries));
    };
    loadAttachments();
    return () => {
      active = false;
      createdUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [ticket?.id, ticket?.attachments]);

  useEffect(() => {
    let active = true;
    const createdUrls: string[] = [];
    const media = (monitorContext?.timeline || []).flatMap((event) => event.media || []);
    const loadMonitorMedia = async () => {
      const entries = await Promise.all(media.map(async (item) => {
        if (item.status !== 'ready') return [item.id, ''] as const;
        try {
          const blob = await ticketsApiService.getAttachmentBlob(item.url);
          const objectUrl = URL.createObjectURL(blob);
          createdUrls.push(objectUrl);
          return [item.id, objectUrl] as const;
        } catch {
          return [item.id, ''] as const;
        }
      }));
      if (active) setMonitorMediaUrls(Object.fromEntries(entries));
    };
    loadMonitorMedia();
    return () => {
      active = false;
      createdUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [monitorContext]);

  // 支持列表页 ?edit=1 进入后自动打开编辑模式
  const [searchParams] = useSearchParams();
  const autoEditTriggered = useRef(false);
  useEffect(() => {
    if (searchParams.get('edit') === '1' && ticket && !autoEditTriggered.current) {
      autoEditTriggered.current = true;
      startEdit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket, searchParams]);

  // 加载表单模板（进入编辑时）
  const loadFormSchema = useCallback(async () => {
    try {
      const s = await ticketsApiService.getSettings();
      setFormSchema(s.form_schema || []);
    } catch {
      /* 忽略：默认内置字段 */
    }
  }, []);

  const startEdit = () => {
    if (!ticket) return;
    loadFormSchema();
    setFormValues(flattenTicket(ticket));
    setSaveMsg('');
    setEditing(true);
  };

  const openInWeCom = async () => {
    if (!monitorContext?.can_dispatch_to_wecom) return;
    setWecomDispatching(true);
    setSaveMsg('');
    try {
      const result = await replyMonitorApi.dispatchToWeCom(
        monitorContext.batch.platform_id,
        monitorContext.batch.conversation_key,
      );
      if (result.jump_url) {
        window.location.assign(result.jump_url);
      } else if (result.dispatched) {
        setSaveMsg('精准跳转卡片已发送到你的企业微信私聊');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '企业微信跳转暂不可用');
    } finally {
      setWecomDispatching(false);
    }
  };

  const cancelEdit = () => {
    setEditing(false);
    setSaveMsg('');
  };

  const saveEdit = async () => {
    if (!ticket) return;
    setSavingEdit(true);
    setSaveMsg('');
    try {
      const { builtin, custom_fields } = splitValues(formValues);
      // 内置字段（null 表示不传，空串已过滤）
      const payload: {
        title?: string;
        description?: string;
        category?: string;
        priority?: string;
        assignee_id?: string | null;
        group_key?: string;
        custom_fields?: Record<string, unknown>;
      } = {};
      if (builtin.title !== undefined) payload.title = String(builtin.title);
      if (builtin.description !== undefined) payload.description = String(builtin.description);
      if (builtin.category !== undefined) payload.category = String(builtin.category);
      if (builtin.priority !== undefined) payload.priority = String(builtin.priority);
      if (builtin.group_key !== undefined) payload.group_key = String(builtin.group_key);
      // assignee 编辑通过分配操作，不在表单里提交
      if (Object.keys(custom_fields).length > 0) payload.custom_fields = custom_fields;

      const updated = await ticketsApiService.updateTicketFields(ticket.id, payload);
      setTicket(updated);
      setEditing(false);
      setSaveMsg('已保存');
      setTimeout(() => setSaveMsg(''), 2000);
      loadData();
    } catch (err) {
      setSaveMsg(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleAction = async (status: string) => {
    if (!ticket) return;
    setActionLoading(true);
    try {
      const updated = await ticketsApiService.changeStatus(ticket.id, status, note || undefined);
      setTicket(updated);
      setNote('');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!ticket || !window.confirm(`确定删除工单 ${ticket.number} 吗？删除后将返回工单列表。`)) return;
    setActionLoading(true);
    setError('');
    try {
      await ticketsApiService.deleteTicket(ticket.id);
      navigate('/tickets');
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
      setActionLoading(false);
    }
  };

  const handleAddComment = async () => {
    if (!ticket || !commentText.trim()) return;
    try {
      await ticketsApiService.addComment(ticket.id, commentText.trim(), commentInternal);
      setCommentText('');
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : '备注失败');
    }
  };

  if (loading && !ticket) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-900 text-gray-400">
        加载中...
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 text-gray-400 gap-3">
        {error || '工单不存在'}
        <button onClick={() => navigate('/tickets')} className="text-blue-600 text-sm">
          返回工单列表
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-gray-50 dark:bg-gray-900 overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate('/tickets')}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
          >
            <Icon name="ArrowLeft" size={18} />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100 truncate">
                {ticket.number}
              </h1>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TICKET_STATUS_COLORS[ticket.status]}`}>
                {TICKET_STATUS_LABELS[ticket.status]}
              </span>
              <span className={`text-xs font-medium ${TICKET_PRIORITY_COLORS[ticket.priority]}`}>
                {TICKET_PRIORITY_LABELS[ticket.priority]}优先级
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{ticket.title}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {ticket.sla_due_at && ticket.status === 'pending_reply' && (
            <div className="text-right text-xs">
              <p className="text-gray-500 dark:text-gray-400">SLA 截止</p>
              <p className={`font-semibold ${new Date(ticket.sla_due_at) < new Date() ? 'text-red-500' : 'text-gray-700 dark:text-gray-300'}`}>
                {new Date(ticket.sla_due_at).toLocaleString('zh-CN', { hour12: false })}
              </p>
            </div>
          )}
          {editing ? (
            <>
              <button
                onClick={cancelEdit}
                className="px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg"
              >
                取消
              </button>
              <button
                onClick={saveEdit}
                disabled={savingEdit}
                className="px-4 py-2 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg disabled:opacity-50"
              >
                {savingEdit ? '保存中...' : '保存'}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={startEdit}
                className="px-3 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
              >
                编辑
              </button>
              {isAdmin && (
                <button
                  onClick={handleDelete}
                  disabled={actionLoading}
                  className="px-3 py-2 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50"
                >
                  删除
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="m-4 px-4 py-2 text-sm text-red-600 bg-red-50 dark:bg-red-900/30 rounded-lg">{error}</div>
      )}
      {saveMsg && (
        <div className="mx-4 mt-2 px-4 py-2 text-sm text-green-600 bg-green-50 dark:bg-green-900/30 rounded-lg">{saveMsg}</div>
      )}

      <div className="flex-1 overflow-auto p-6 space-y-4">
        {/* 基本信息 / 编辑表单 */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">
            {editing ? '编辑工单' : '问题信息'}
          </h2>
          {editing ? (
            <TicketDynamicForm
              fields={formSchema.length > 0 ? formSchema : [
                { key: 'title', label: '标题', type: 'text', required: true, editable: true },
                { key: 'description', label: '问题描述', type: 'textarea', required: true, editable: true },
                { key: 'category', label: '分类', type: 'text', editable: true },
                { key: 'priority', label: '优先级', type: 'select', options: ['low', 'normal', 'high', 'urgent'], editable: true },
                { key: 'group_key', label: '群标识', type: 'text', editable: true },
              ]}
              values={formValues}
              onChange={(key, value) => setFormValues((prev) => ({ ...prev, [key]: value }))}
            />
          ) : (
            <>
              {!monitorContext && <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">{ticket.description}</p>}
              {monitorContext && (
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  问题内容已按原始消息结构展示在下方时间线中，图片不会再用占位符代替。
                </p>
              )}
              <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div>
                  <p className="text-gray-400">分类</p>
                  <p className="text-gray-700 dark:text-gray-300 font-medium">{ticket.category}</p>
                </div>
                <div>
                  <p className="text-gray-400">负责客服</p>
                  <p className="text-gray-700 dark:text-gray-300 font-medium">{ticket.assignee_name || '未分配'}</p>
                </div>
                <div>
                  <p className="text-gray-400">来源</p>
                  <p className="text-gray-700 dark:text-gray-300 font-medium">
                    未回复监控
                  </p>
                </div>
                <div>
                  <p className="text-gray-400">访客</p>
                  <p className="text-gray-700 dark:text-gray-300 font-medium">{ticket.visitor_name || '—'}</p>
                </div>
                {ticket.contact_name && (
                  <div>
                    <p className="text-gray-400">联系人</p>
                    <p className="text-gray-700 dark:text-gray-300 font-medium">{ticket.contact_name}</p>
                  </div>
                )}
                {ticket.contact_phone && (
                  <div>
                    <p className="text-gray-400">联系电话</p>
                    <p className="text-gray-700 dark:text-gray-300 font-medium">{ticket.contact_phone}</p>
                  </div>
                )}
                {ticket.ai_summary?.reason && (
                  <div className="col-span-2 md:col-span-4">
                    <p className="text-gray-400">AI 判定</p>
                    <p className="text-gray-700 dark:text-gray-300">{ticket.ai_summary.reason}</p>
                  </div>
                )}
              </div>
              {ticket.attachments && ticket.attachments.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                  <p className="text-xs text-gray-400 mb-2">客户图片</p>
                  <div className="flex flex-wrap gap-3">
                    {ticket.attachments.map((attachment) => (
                      attachmentUrls[attachment.id] ? (
                        <a key={attachment.id} href={attachmentUrls[attachment.id]} target="_blank" rel="noreferrer" title={attachment.original_name}>
                          <img
                            src={attachmentUrls[attachment.id]}
                            alt={attachment.original_name}
                            className="h-28 w-28 rounded-lg border border-gray-200 dark:border-gray-700 object-cover"
                          />
                        </a>
                      ) : (
                        <div key={attachment.id} className="h-28 w-28 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-xs text-gray-400">
                          加载中
                        </div>
                      )
                    ))}
                  </div>
                </div>
              )}
              {/* 自定义字段展示 */}
              {ticket.custom_fields && Object.keys(ticket.custom_fields).length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  {Object.entries(ticket.custom_fields).map(([k, v]) => (
                    <div key={k}>
                      <p className="text-gray-400">{k}</p>
                      <p className="text-gray-700 dark:text-gray-300 font-medium">{String(v ?? '—')}</p>
                    </div>
                  ))}
                </div>
              )}
              {/* 自动填写来源 */}
              {ticket.ai_summary?.autofill && Object.keys(ticket.ai_summary.autofill).length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                  <p className="text-gray-400 mb-2">自动填写来源</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(ticket.ai_summary.autofill).map(([k, v]) => (
                      <span key={k} className="px-2 py-0.5 rounded text-[10px] bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                        {k} ← {v.source}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {monitorContext && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">客户消息时间线</h2>
                <p className="mt-1 text-xs text-gray-400">
                  {monitorContext.batch.conversation_name || monitorContext.batch.conversation_key}
                  {' · '}{monitorContext.batch.conversation_type === 'group' ? '群聊' : '私聊'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {monitorContext.can_dispatch_to_wecom && (
                  <button type="button" onClick={openInWeCom} disabled={wecomDispatching}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
                    {wecomDispatching ? '正在处理…' : '前往企业微信'}
                  </button>
                )}
                <span className="rounded-full bg-orange-50 px-2.5 py-1 text-xs font-medium text-orange-600 dark:bg-orange-900/30 dark:text-orange-300">
                  已提醒 {monitorContext.batch.reminder_count} 次
                </span>
              </div>
            </div>
            <div className="space-y-3">
              {monitorContext.timeline.map((event) => (
                <div key={event.id} className="flex gap-3">
                  <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${event.sender_kind === 'staff' ? 'bg-emerald-500' : event.sender_kind === 'customer' ? 'bg-blue-500' : 'bg-gray-400'}`} />
                  <div className="min-w-0 flex-1 rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-700/40">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-400">
                      <span>{event.sender_name || (event.sender_kind === 'staff' ? '客服' : '客户')} · {event.message_type}</span>
                      <span>{new Date(event.occurred_at).toLocaleString('zh-CN', { hour12: false })}</span>
                    </div>
                    {event.message_type !== 'image' && (
                      <p className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-700 dark:text-gray-200">{event.content_summary || `[${event.message_type}]`}</p>
                    )}
                    {event.media?.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {event.media.map((item) => monitorMediaUrls[item.id] ? (
                          <a key={item.id} href={monitorMediaUrls[item.id]} target="_blank" rel="noreferrer" title={`${item.width}×${item.height} · ${Math.ceil(item.file_size / 1024)}KB`}>
                            <img
                              src={monitorMediaUrls[item.id]}
                              alt="客户消息图片"
                              className="h-24 w-24 rounded-lg border border-gray-200 object-cover dark:border-gray-600"
                            />
                          </a>
                        ) : (
                          <div key={item.id} className="flex h-24 w-24 items-center justify-center rounded-lg bg-gray-100 text-xs text-gray-400 dark:bg-gray-700">
                            {item.status === 'deleted' ? '已按策略删除' : '图片加载失败'}
                          </div>
                        ))}
                      </div>
                    )}
                    {event.message_type === 'image' && event.media_status === 'recovering' && (
                      <div className="mt-2 flex h-24 w-36 items-center justify-center rounded-lg bg-amber-50 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">历史图片恢复中</div>
                    )}
                    {event.message_type === 'image' && event.media_status === 'missing' && (
                      <div className="mt-2 flex h-24 w-36 items-center justify-center rounded-lg bg-gray-100 text-xs text-gray-500 dark:bg-gray-700 dark:text-gray-300">历史图片未留存</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 状态操作 */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">状态操作</h2>
          <div className="flex flex-wrap gap-2 items-center">
            {isAdmin ? (
              <select
                aria-label="管理员设置工单状态"
                value={ticket.status}
                disabled={actionLoading}
                onChange={(e) => handleAction(e.target.value as TicketStatus)}
                className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 disabled:opacity-50"
              >
                <option value="pending_reply">待回复</option>
                <option value="replied">已回复</option>
                <option value="archived">已归档</option>
              </select>
            ) : ticket.status === 'pending_reply' ? (
              <p className="text-xs text-gray-500 dark:text-gray-400">客服真实回复后，系统会自动标记为“已回复”。</p>
            ) : ([ACTION_TRANSITIONS[ticket.status]]).map((action) => (
              <button
                key={action.status}
                disabled={actionLoading}
                onClick={() => handleAction(action.status)}
                className={`px-3 py-1.5 text-xs font-medium text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5 ${action.color}`}
              >
                <Icon name={action.icon} size={14} />
                {action.label}
              </button>
            ))}
            {(isAdmin || ticket.status !== 'pending_reply') && <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="流转备注（可选）"
              className="flex-1 min-w-40 px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"
            />}
          </div>
        </div>

        {/* 备注 */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">备注</h2>
          <div className="flex gap-2 mb-3">
            <input
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddComment()}
              placeholder="添加备注..."
              className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"
            />
            <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
              <input
                type="checkbox"
                checked={commentInternal}
                onChange={(e) => setCommentInternal(e.target.checked)}
              />
              仅内部
            </label>
            <button
              onClick={handleAddComment}
              className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
            >
              添加
            </button>
          </div>
          <div className="space-y-2">
            {comments.length === 0 ? (
              <p className="text-xs text-gray-400">暂无备注</p>
            ) : (
              comments.map((c) => (
                <div key={c.id} className="text-sm bg-gray-50 dark:bg-gray-700/40 rounded-lg px-3 py-2">
                  <div className="flex justify-between text-xs text-gray-400 mb-1">
                    <span>{c.staff_name || '客服'} {c.is_internal ? '· 内部' : ''}</span>
                    <span>{new Date(c.created_at).toLocaleString('zh-CN', { hour12: false })}</span>
                  </div>
                  <p className="text-gray-700 dark:text-gray-300">{c.content}</p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 状态历史 */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">状态流转历史</h2>
          <div className="space-y-2">
            {history.map((h) => (
              <div key={h.id} className="flex items-center gap-2 text-sm">
                <span className="text-xs text-gray-400 whitespace-nowrap">
                  {new Date(h.created_at).toLocaleString('zh-CN', { hour12: false })}
                </span>
                {h.from_status && (
                  <>
                    <span className="px-1.5 py-0.5 rounded text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                      {TICKET_STATUS_LABELS[h.from_status as keyof typeof TICKET_STATUS_LABELS] || h.from_status}
                    </span>
                    <Icon name="ArrowRight" size={14} className="text-gray-400" />
                  </>
                )}
                <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                  TICKET_STATUS_COLORS[h.to_status as keyof typeof TICKET_STATUS_COLORS]
                }`}>
                  {TICKET_STATUS_LABELS[h.to_status as keyof typeof TICKET_STATUS_LABELS] || h.to_status}
                </span>
                <span className="text-xs text-gray-400">{h.operator_type === 'ai' ? 'AI' : '人工'}</span>
                {h.note && <span className="text-xs text-gray-500 dark:text-gray-400">· {h.note}</span>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TicketDetailPage;
