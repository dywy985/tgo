import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Icon from '@/components/ui/Icon';
import {
  ticketsApiService,
  type Ticket,
  type TicketComment,
  type TicketHistory,
  TICKET_PRIORITY_COLORS,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_COLORS,
  TICKET_STATUS_LABELS,
} from '@/services/ticketsApi';

// 详情页可执行的常用流转
const ACTION_TRANSITIONS: Array<{ status: string; label: string; color: string; icon: string }> = [
  { status: 'processing', label: '开始处理', color: 'bg-purple-600 hover:bg-purple-700', icon: 'Play' },
  { status: 'pending_human', label: '转人工', color: 'bg-orange-600 hover:bg-orange-700', icon: 'UserPlus' },
  { status: 'waiting_customer', label: '等客户回复', color: 'bg-amber-600 hover:bg-amber-700', icon: 'Clock' },
  { status: 'resolved', label: '标记已解决', color: 'bg-green-600 hover:bg-green-700', icon: 'CheckCircle2' },
  { status: 'closed', label: '归档', color: 'bg-gray-600 hover:bg-gray-700', icon: 'Archive' },
  { status: 'open', label: '重新打开', color: 'bg-blue-600 hover:bg-blue-700', icon: 'RotateCcw' },
  { status: 'rejected', label: '拒绝/无需处理', color: 'bg-red-600 hover:bg-red-700', icon: 'XCircle' },
];

const TicketDetailPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [comments, setComments] = useState<TicketComment[]>([]);
  const [history, setHistory] = useState<TicketHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [commentText, setCommentText] = useState('');
  const [commentInternal, setCommentInternal] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

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
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

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

  const handleAddComment = async () => {
    if (!ticket || !commentText.trim()) return;
    try {
      await ticketsApiService.addComment(ticket.id, commentText.trim(), commentInternal);
      setCommentText('');
      // 重新加载（备注列表）
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
        {ticket.sla_due_at && ticket.status !== 'closed' && (
          <div className="text-right text-xs">
            <p className="text-gray-500 dark:text-gray-400">SLA 截止</p>
            <p className={`font-semibold ${new Date(ticket.sla_due_at) < new Date() ? 'text-red-500' : 'text-gray-700 dark:text-gray-300'}`}>
              {new Date(ticket.sla_due_at).toLocaleString('zh-CN', { hour12: false })}
            </p>
          </div>
        )}
      </div>

      {error && (
        <div className="m-4 px-4 py-2 text-sm text-red-600 bg-red-50 dark:bg-red-900/30 rounded-lg">{error}</div>
      )}

      <div className="flex-1 overflow-auto p-6 space-y-4">
        {/* 基本信息 */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">问题信息</h2>
          <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">{ticket.description}</p>
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
                {ticket.source === 'manual_service' ? '转人工' : ticket.source === 'staff_manual' ? '手动创建' : 'AI 判定'}
              </p>
            </div>
            <div>
              <p className="text-gray-400">访客</p>
              <p className="text-gray-700 dark:text-gray-300 font-medium">{ticket.visitor_name || '—'}</p>
            </div>
            {ticket.resolve_type && (
              <div>
                <p className="text-gray-400">解决方式</p>
                <p className="text-gray-700 dark:text-gray-300 font-medium">
                  {ticket.resolve_type === 'ai_resolved' ? 'AI 解决' : ticket.resolve_type === 'human_resolved' ? '人工解决' : ticket.resolve_type}
                </p>
              </div>
            )}
            {ticket.ai_summary?.reason && (
              <div className="col-span-2 md:col-span-4">
                <p className="text-gray-400">AI 判定</p>
                <p className="text-gray-700 dark:text-gray-300">{ticket.ai_summary.reason}</p>
              </div>
            )}
          </div>
        </div>

        {/* 状态操作 */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">状态操作</h2>
          <div className="flex flex-wrap gap-2 items-center">
            {ACTION_TRANSITIONS.map((action) => (
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
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="流转备注（可选）"
              className="flex-1 min-w-40 px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"
            />
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
