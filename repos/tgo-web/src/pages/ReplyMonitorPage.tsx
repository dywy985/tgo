import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  AlertCircle, ArrowRight, BarChart3, BellRing, CheckCircle2, ChevronDown, Clock3,
  DatabaseBackup, Filter, MessageSquareText, RefreshCw, Save, ShieldCheck, SlidersHorizontal, Trash2, Users,
  type LucideIcon,
} from 'lucide-react';
import {
  replyMonitorApi, type CustomerMember, type GroupOwnerAssignment, type PendingReply, type ReplyMonitorSettings, type ReplyMonitorStats,
  type HistoricalRebuildPreview, type KnowledgeSuggestionResult, type StaffReplyMetrics,
} from '@/services/replyMonitorApi';
import { staffApi } from '@/services/staffApi';
import { useAuthStore } from '@/stores/authStore';
import type { StaffResponse } from '@/services/api';
import platformsApiService, { type PlatformResponse } from '@/services/platformsApi';
import { PlatformType } from '@/types';
import { buildCustomerRoster, defaultGroupOwnerOptionLabel, filterAssignableStaff, makeManualCustomerMember, pendingReplyDestination, toggleRosterSelection } from '@/utils/replyMonitorRoster.js';

const weekDays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const surface = 'rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-700/70 dark:bg-slate-900';
const inputClass = 'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200';

const isoDay = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
const waitMinutes = (value: string) => Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
const formatWait = (value: string) => {
  const minutes = waitMinutes(value);
  if (minutes < 60) return `${minutes} 分钟`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分钟`;
  return `${Math.floor(minutes / 1440)} 天 ${Math.floor((minutes % 1440) / 60)} 小时`;
};
const formatMinutes = (value?: number) => {
  if (value === undefined || value === null) return '—';
  if (value < 60) return `${Math.round(value)} 分钟`;
  return `${(value / 60).toFixed(value >= 600 ? 0 : 1)} 小时`;
};
const formatPercent = (value?: number) => `${Math.round((value ?? 0) * 10) / 10}%`;
const calendarDuration = (metrics?: StaffReplyMetrics | ReplyMonitorStats['summary'], kind: 'avg' | 'p50' | 'p95' | 'max' = 'avg') => {
  const value = metrics?.[`${kind}_calendar_first_response_minutes` as keyof typeof metrics];
  return typeof value === 'number' ? value : undefined;
};
const workingDuration = (metrics?: StaffReplyMetrics | ReplyMonitorStats['summary'], kind: 'avg' | 'p50' | 'p95' | 'max' = 'avg') => {
  const value = metrics?.[`${kind}_working_first_response_minutes` as keyof typeof metrics];
  if (typeof value === 'number') return value;
  if (kind === 'max') return undefined;
  const legacy = metrics?.[`${kind}_first_response_minutes` as keyof typeof metrics];
  return typeof legacy === 'number' ? legacy : undefined;
};
const unprocessedTickets = (metrics: StaffReplyMetrics) => (
  metrics.unresolved_ticket_count ?? metrics.unprocessed_ticket_count ?? metrics.open_ticket_count ?? metrics.pending_ticket_count ?? 0
);

type MetricCardProps = {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  detail: React.ReactNode;
  tone: 'blue' | 'red' | 'green' | 'violet';
  progress?: number;
};
const tones = {
  blue: { icon: 'bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-300', bar: 'bg-blue-500' },
  red: { icon: 'bg-red-50 text-red-600 dark:bg-red-950/60 dark:text-red-300', bar: 'bg-red-500' },
  green: { icon: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-300', bar: 'bg-emerald-500' },
  violet: { icon: 'bg-violet-50 text-violet-600 dark:bg-violet-950/60 dark:text-violet-300', bar: 'bg-violet-500' },
};

const MetricCard = ({ icon: Icon, label, value, detail, tone, progress }: MetricCardProps) => (
  <article className={`${surface} relative overflow-hidden p-5`}>
    <div className="flex items-start justify-between gap-3">
      <div><p className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</p><div className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 tabular-nums dark:text-white">{value}</div></div>
      <span className={`rounded-xl p-2.5 ${tones[tone].icon}`}><Icon size={20} /></span>
    </div>
    <div className="mt-3 min-h-5 text-xs text-slate-500 dark:text-slate-400">{detail}</div>
    {progress !== undefined && <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className={`h-full rounded-full ${tones[tone].bar}`} style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} /></div>}
  </article>
);

const EmptyState = ({ icon: Icon, title, detail }: { icon: LucideIcon; title: string; detail: string }) => (
  <div className="flex min-h-48 flex-col items-center justify-center px-6 text-center">
    <span className="mb-3 rounded-full bg-slate-100 p-3 text-slate-400 dark:bg-slate-800"><Icon size={22} /></span>
    <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{title}</p><p className="mt-1 max-w-xs text-xs leading-5 text-slate-400">{detail}</p>
  </div>
);

export default function ReplyMonitorPage() {
  const navigate = useNavigate();
  const isAdmin = useAuthStore((state) => state.user?.role === 'admin');
  const [start, setStart] = useState(() => { const date = new Date(); date.setDate(date.getDate() - 6); return isoDay(date); });
  const [end, setEnd] = useState(() => isoDay(new Date()));
  const [staffFilter, setStaffFilter] = useState('');
  const [responderFilter, setResponderFilter] = useState('');
  const [conversationFilter, setConversationFilter] = useState('');
  const [platformFilter, setPlatformFilter] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [stats, setStats] = useState<ReplyMonitorStats | null>(null);
  const [pending, setPending] = useState<PendingReply[]>([]);
  const [settings, setSettings] = useState<ReplyMonitorSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [staffOptions, setStaffOptions] = useState<StaffResponse[]>([]);
  const [platformOptions, setPlatformOptions] = useState<PlatformResponse[]>([]);
  const [groupOwners, setGroupOwners] = useState<GroupOwnerAssignment[]>([]);
  const [ownerSaving, setOwnerSaving] = useState('');
  const [rosterSaving, setRosterSaving] = useState('');
  const [rosterDrafts, setRosterDrafts] = useState<Record<string, string[]>>({});
  const [rosterAddedMembers, setRosterAddedMembers] = useState<Record<string, CustomerMember[]>>({});
  const [rosterInputs, setRosterInputs] = useState<Record<string, string>>({});
  const [dispatchingBatch, setDispatchingBatch] = useState('');
  const [matchingBatch, setMatchingBatch] = useState('');
  const [dismissingBatch, setDismissingBatch] = useState('');
  const [suggestionLoading, setSuggestionLoading] = useState('');
  const [suggestionTarget, setSuggestionTarget] = useState('');
  const [suggestionPanel, setSuggestionPanel] = useState<{batchId: string; data: KnowledgeSuggestionResult} | null>(null);
  const [bindingSyncing, setBindingSyncing] = useState(false);
  const [rebuildPlatformId, setRebuildPlatformId] = useState('');
  const [rebuildPreview, setRebuildPreview] = useState<HistoricalRebuildPreview | null>(null);
  const [rebuildBusy, setRebuildBusy] = useState(false);
  const [rebuildJob, setRebuildJob] = useState<{job_id: string; status: string; result: Record<string, number>} | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [summary, pendingReplies, configuration, owners] = await Promise.all([
        replyMonitorApi.getStats({ start_date: start, end_date: end, staff_id: staffFilter || undefined, responder_id: responderFilter || undefined, conversation_key: conversationFilter || undefined, platform_id: platformFilter || undefined }),
        replyMonitorApi.getPending({ staff_id: staffFilter || undefined, conversation_key: conversationFilter || undefined, platform_id: platformFilter || undefined }), replyMonitorApi.getSettings(), replyMonitorApi.getGroupOwners(),
      ]);
      setStats(summary); setPending(pendingReplies); setSettings(configuration); setGroupOwners(owners);
      setSuggestionTarget((current) => pendingReplies.some((item) => item.batch_id === current) ? current : pendingReplies[0]?.batch_id || '');
      setRosterDrafts(Object.fromEntries(owners.map((item) => [
        `${item.platform_id}:${item.group_key}`,
        (item.customer_roster_configured ? item.customer_members : item.observed_members)
          .map((member) => `${member.identity_type}:${member.identity_value}`),
      ])));
      setRosterAddedMembers({});
    } catch (reason) { setError(reason instanceof Error ? reason.message : '监控数据加载失败'); }
    finally { setLoading(false); }
  }, [start, end, staffFilter, responderFilter, conversationFilter, platformFilter]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    void staffApi.listStaff({ limit: 100 }).then((response) => {
      setStaffOptions(filterAssignableStaff(response.data));
    }).catch(() => setStaffOptions([]));
  }, []);
  useEffect(() => {
    void platformsApiService.listPlatforms({ type: PlatformType.WORKTOOL, is_active: true, limit: 100 }).then(async (response) => {
      setPlatformOptions(response.data);
      setRebuildPlatformId((current) => current || response.data[0]?.id || '');
    }).catch(() => setPlatformOptions([]));
  }, []);
  const setRange = (days: number) => { const last = new Date(); const first = new Date(); first.setDate(last.getDate() - days + 1); setStart(isoDay(first)); setEnd(isoDay(last)); setRebuildPreview(null); };
  const update = <K extends keyof ReplyMonitorSettings>(key: K, value: ReplyMonitorSettings[K]) => setSettings((current) => current ? { ...current, [key]: value } : current);
  const save = async () => {
    if (!settings) return;
    const payload = { ...settings }; delete (payload as Partial<ReplyMonitorSettings>).ai_reply_frozen;
    setSettings(await replyMonitorApi.updateSettings(payload)); setSaved('设置已保存'); window.setTimeout(() => setSaved(''), 2000);
  };
  const dispatchToWeCom = async (item: PendingReply) => {
    setDispatchingBatch(item.batch_id); setError(''); setSaved('');
    try {
      const response = await replyMonitorApi.dispatchToWeCom(item.platform_id, item.conversation_key);
      if (response.jump_url) window.location.assign(response.jump_url);
      else setSaved('精准入口已发送到你的企业微信私聊');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '企业微信精准入口发送失败');
    } finally {
      setDispatchingBatch('');
    }
  };
  const dismissPending = async (item: PendingReply) => {
    if (!window.confirm(`确定从待回复队列删除「${item.conversation_name || item.conversation_key}」的这条提醒吗？后续将停止提醒；原始消息和已有工单会保留。`)) return;
    setDismissingBatch(item.batch_id); setError(''); setSaved('');
    try {
      await replyMonitorApi.dismissPending(item.batch_id);
      await load();
      setSaved('待回复提醒已删除');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '删除待回复提醒失败');
    } finally {
      setDismissingBatch('');
    }
  };
  const resolveReplyMatch = async (batchId: string, eventId: string) => {
    setMatchingBatch(batchId); setError('');
    try {
      await replyMonitorApi.resolveReplyMatch(batchId, eventId);
      setSaved('回复对象已人工确认');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '回复对象确认失败');
    } finally { setMatchingBatch(''); }
  };
  const loadKnowledgeSuggestions = async (batchId: string) => {
    if (suggestionPanel?.batchId === batchId) { setSuggestionPanel(null); return; }
    setSuggestionLoading(batchId); setError('');
    try {
      setSuggestionPanel({ batchId, data: await replyMonitorApi.getKnowledgeSuggestions(batchId) });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '知识库建议加载失败');
    } finally { setSuggestionLoading(''); }
  };
  const copySuggestion = async (value: string) => {
    await navigator.clipboard.writeText(value);
    setSaved('建议内容已复制，请人工核对后回复客户');
    window.setTimeout(() => setSaved(''), 2500);
  };
  const syncWeComBindings = async () => {
    setBindingSyncing(true); setError('');
    try {
      const result = await replyMonitorApi.syncWeComBindings();
      setSaved(`企微群绑定已同步：可跳转 ${result.counts.available || 0} 个，冲突 ${result.counts.ambiguous || 0} 个`);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '企微群绑定同步失败');
    } finally { setBindingSyncing(false); }
  };
  const updateSchedule = (day: string, enabled: boolean, field?: 'start' | 'end', value?: string) => {
    if (!settings) return;
    const current = settings.weekly_schedule[day]?.[0] || { start: '09:00', end: '18:00' };
    update('weekly_schedule', { ...settings.weekly_schedule, [day]: enabled ? [{ ...current, ...(field ? { [field]: value } : {}) }] : [] });
  };
  const changeGroupOwner = async (item: GroupOwnerAssignment, staffId: string) => {
    const key = `${item.platform_id}:${item.group_key}`; setOwnerSaving(key); setError('');
    try {
      const result = staffId
        ? await replyMonitorApi.setGroupOwner(item.platform_id, item.group_key, staffId)
        : await replyMonitorApi.clearGroupOwner(item.platform_id, item.group_key);
      setSaved(result.message); setGroupOwners(await replyMonitorApi.getGroupOwners());
      window.setTimeout(() => setSaved(''), 3000);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '负责人保存失败'); }
    finally { setOwnerSaving(''); }
  };
  const toggleCustomerMember = (item: GroupOwnerAssignment, identityKey: string) => {
    const groupKey = `${item.platform_id}:${item.group_key}`;
    const current = rosterDrafts[groupKey] ?? (item.customer_roster_configured ? item.customer_members : item.observed_members).map((member) => `${member.identity_type}:${member.identity_value}`);
    setRosterDrafts((drafts) => ({ ...drafts, [groupKey]: toggleRosterSelection(current, identityKey) }));
  };
  const addCustomerMember = (item: GroupOwnerAssignment) => {
    const groupKey = `${item.platform_id}:${item.group_key}`;
    const member = makeManualCustomerMember(rosterInputs[groupKey]);
    if (!member) return;
    const identityKey = `${member.identity_type}:${member.identity_value}`;
    setRosterAddedMembers((members) => ({
      ...members,
      [groupKey]: [...(members[groupKey] || []).filter((row) => `${row.identity_type}:${row.identity_value}` !== identityKey), member],
    }));
    setRosterDrafts((drafts) => ({
      ...drafts,
      [groupKey]: [...new Set([...(drafts[groupKey] || []), identityKey])],
    }));
    setRosterInputs((inputs) => ({ ...inputs, [groupKey]: '' }));
  };
  const saveCustomerRoster = async (item: GroupOwnerAssignment) => {
    const groupKey = `${item.platform_id}:${item.group_key}`;
    const selected = rosterDrafts[groupKey] ?? [];
    const candidates = [...item.observed_members, ...item.customer_members.map((member) => ({ ...member })), ...(rosterAddedMembers[groupKey] || [])];
    const customerMembers = buildCustomerRoster(candidates, selected);
    setRosterSaving(groupKey); setError('');
    try {
      const result = await replyMonitorApi.setGroupCustomers(item.platform_id, item.group_key, customerMembers);
      setSaved(result.message); setGroupOwners(await replyMonitorApi.getGroupOwners());
      window.setTimeout(() => setSaved(''), 3000);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '客户成员名单保存失败'); }
    finally { setRosterSaving(''); }
  };
  const rebuildWindow = () => {
    const startAt = new Date(`${start}T00:00:00+08:00`).toISOString();
    const today = isoDay(new Date());
    if (end === today) return { startAt, endAt: new Date().toISOString() };
    const nextDay = new Date(`${end}T00:00:00+08:00`);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    return { startAt, endAt: nextDay.toISOString() };
  };
  const previewHistoryRebuild = async () => {
    if (!rebuildPlatformId) { setError('请先选择 WorkTool 平台'); return; }
    setRebuildBusy(true); setError(''); setRebuildJob(null);
    try {
      const { startAt, endAt } = rebuildWindow();
      setRebuildPreview(await replyMonitorApi.previewHistoricalRebuild(rebuildPlatformId, startAt, endAt));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '历史回补预览生成失败');
    } finally { setRebuildBusy(false); }
  };
  const submitHistoryRebuild = async () => {
    if (!rebuildPreview || !rebuildPlatformId) return;
    setRebuildBusy(true); setError('');
    try {
      const { startAt, endAt } = rebuildWindow();
      const job = await replyMonitorApi.submitHistoricalRebuild(rebuildPlatformId, startAt, endAt, rebuildPreview.preview_token);
      setRebuildJob(job); setRebuildPreview(null); setSaved('历史派生数据已原子重建；原始事件未改动');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '历史回补执行失败，请重新生成预览');
    } finally { setRebuildBusy(false); }
  };

  const summary = stats?.summary;
  const answeredRate = summary?.response_rate ?? 0;
  const activeFilterCount = [staffFilter, responderFilter, conversationFilter, platformFilter].filter(Boolean).length;
  const slaMinutes = settings?.first_reminder_minutes ?? 30;
  const urgentCount = useMemo(() => pending.filter((item) => (item.pending_working_minutes ?? 0) >= slaMinutes).length, [pending, slaMinutes]);
  const trendData = useMemo(() => (stats?.daily || []).map((item) => ({ ...item, displayDate: item.date.slice(5).replace('-', '/') })), [stats]);

  return (
    <main className="min-h-full min-w-0 flex-1 overflow-y-auto bg-slate-50/70 px-4 py-5 dark:bg-slate-950/50 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-[1800px] space-y-5">
        <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white"><ShieldCheck className="text-blue-600" size={25} />人工回复监控</h1>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />人工监控运行中</span>
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${settings?.reminders_enabled !== false ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/60 dark:text-blue-300' : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-300'}`}><span className={`h-1.5 w-1.5 rounded-full ${settings?.reminders_enabled !== false ? 'bg-blue-500' : 'bg-amber-500'}`} />提醒{settings?.reminders_enabled !== false ? '已开启' : '已关闭'}</span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-200/70 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">AI 回复已冻结</span>
            </div>
            <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">优先处理超时风险，追踪真实客服的首响效率与每日问题流量。</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-700 dark:bg-slate-900">{[{ label: '近7天', days: 7 }, { label: '近30天', days: 30 }].map((range) => <button key={range.days} onClick={() => setRange(range.days)} className="rounded-md px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">{range.label}</button>)}</div>
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 shadow-sm dark:border-slate-700 dark:bg-slate-900"><input aria-label="开始日期" type="date" value={start} onChange={(event) => { setStart(event.target.value); setRebuildPreview(null); }} className="h-10 bg-transparent text-sm text-slate-700 outline-none dark:text-slate-200" /><span className="text-xs text-slate-400">至</span><input aria-label="结束日期" type="date" value={end} onChange={(event) => { setEnd(event.target.value); setRebuildPreview(null); }} className="h-10 bg-transparent text-sm text-slate-700 outline-none dark:text-slate-200" /></div>
            <button aria-label="刷新监控数据" onClick={() => void load()} disabled={loading} className="inline-flex h-11 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"><RefreshCw className={loading ? 'animate-spin' : ''} size={17} />刷新</button>
          </div>
        </header>

        <section className={`${surface} overflow-hidden`}>
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
            <div><h2 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white"><DatabaseBackup size={18} className="text-cyan-600" />历史识别回补</h2><p className="mt-1 text-xs text-slate-400">先生成只读预览；确认后只重建派生批次和统计，保留原始收件箱、事件与媒体。</p></div>
            <div className="flex flex-wrap items-center gap-2"><select aria-label="历史回补平台" value={rebuildPlatformId} onChange={(event) => { setRebuildPlatformId(event.target.value); setRebuildPreview(null); }} className={`${inputClass} w-56`}><option value="">选择 WorkTool 平台</option>{platformOptions.map((platform) => <option key={platform.id} value={platform.id}>{platform.name}</option>)}</select><button type="button" disabled={rebuildBusy || !rebuildPlatformId} onClick={() => void previewHistoryRebuild()} className="rounded-lg border border-cyan-300 px-3 py-2 text-xs font-medium text-cyan-700 disabled:opacity-40">{rebuildBusy ? '处理中' : '生成当前日期范围预览'}</button></div>
          </div>
          {rebuildPreview && <div className="border-b border-slate-100 p-5 dark:border-slate-800"><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-slate-600 dark:text-slate-300">共 {rebuildPreview.event_count} 条事件；令牌于 {new Date(rebuildPreview.expires_at).toLocaleString()} 失效。以下逐条列出身份、评分和引用歧义。</p><button type="button" disabled={rebuildBusy} onClick={() => void submitHistoryRebuild()} className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-40">确认预览并原子重建</button></div><div className="max-h-80 overflow-auto rounded-lg border border-slate-200 dark:border-slate-700"><table className="w-full min-w-[900px] text-xs"><thead className="sticky top-0 bg-slate-50 text-left dark:bg-slate-900"><tr><th className="p-2">时间</th><th className="p-2">会话 / 发送者</th><th className="p-2">身份变化</th><th className="p-2">评分变化</th><th className="p-2">命中原因</th><th className="p-2">引用审核</th></tr></thead><tbody>{rebuildPreview.items.map((item) => <tr key={item.event_id} className="border-t border-slate-100 dark:border-slate-800"><td className="p-2 whitespace-nowrap">{new Date(item.occurred_at).toLocaleString()}</td><td className="p-2"><span className="block max-w-52 truncate" title={item.conversation_key}>{item.conversation_key}</span><span className="text-slate-400">{item.sender_name || '未知成员'}</span></td><td className="p-2">{item.old_sender_kind} → {item.new_sender_kind}</td><td className="p-2">{item.old_problem_score ?? '—'} → {item.new_problem_score}</td><td className="p-2">{item.problem_reasons.join('、') || '—'}</td><td className={`p-2 ${item.requires_manual_quote_review ? 'text-amber-600' : 'text-slate-400'}`}>{item.requires_manual_quote_review ? '需人工确认' : '—'}</td></tr>)}</tbody></table></div><p className="mt-3 text-xs text-amber-600">历史未回复问题会进入审核且不补发过期提醒；确认后从确认时刻重新计算提醒。</p></div>}
          {rebuildJob && <div className="px-5 py-3 text-sm text-emerald-700 dark:text-emerald-300">任务 {rebuildJob.job_id}：{rebuildJob.status}；重建结果 {Object.entries(rebuildJob.result).map(([key, value]) => `${key}=${value}`).join('，') || '无派生变化'}</div>}
        </section>

        <section className={`${surface} overflow-hidden`}>
          <button onClick={() => setFiltersOpen((open) => !open)} className="flex w-full items-center justify-between px-4 py-3 text-left"><span className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200"><Filter size={16} />筛选范围{activeFilterCount > 0 && <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[11px] text-white">{activeFilterCount}</span>}</span><ChevronDown size={17} className={`text-slate-400 transition ${filtersOpen ? 'rotate-180' : ''}`} /></button>
          {filtersOpen && <div className="grid gap-3 border-t border-slate-100 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-950/30 md:grid-cols-2 xl:grid-cols-4"><label className="text-xs font-medium text-slate-500">问题负责人<select value={staffFilter} onChange={(event) => setStaffFilter(event.target.value)} className={`mt-1.5 ${inputClass}`}><option value="">全部负责人</option>{staffOptions.map((staff) => <option key={staff.id} value={staff.id}>{staff.nickname || staff.username}{staff.wecom_userid ? ` · ${staff.wecom_userid}` : ''}</option>)}</select></label><label className="text-xs font-medium text-slate-500">实际回复客服<select value={responderFilter} onChange={(event) => setResponderFilter(event.target.value)} className={`mt-1.5 ${inputClass}`}><option value="">全部回复人</option>{staffOptions.map((staff) => <option key={staff.id} value={staff.id}>{staff.nickname || staff.username}{staff.wecom_userid ? ` · ${staff.wecom_userid}` : ''}</option>)}</select></label><label className="text-xs font-medium text-slate-500">群聊 / 会话标识<input value={conversationFilter} onChange={(event) => setConversationFilter(event.target.value.trim())} placeholder="全部会话" className={`mt-1.5 ${inputClass}`} /></label><label className="text-xs font-medium text-slate-500">WorkTool 平台<select value={platformFilter} onChange={(event) => setPlatformFilter(event.target.value)} className={`mt-1.5 ${inputClass}`}><option value="">全部平台</option>{platformOptions.map((platform) => <option key={platform.id} value={platform.id}>{platform.display_name || platform.name}</option>)}</select></label></div>}
        </section>

        {error && <div role="alert" className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300"><AlertCircle size={17} />{error}</div>}

        <section aria-label="核心指标" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon={MessageSquareText} label="问题流量" value={summary?.batch_count ?? '—'} detail={<>{summary?.customer_message_count ?? '—'} 条客户原始消息</>} tone="blue" />
          <MetricCard icon={BellRing} label="当前未回复" value={pending.length} detail={<span className={urgentCount ? 'font-medium text-red-600 dark:text-red-400' : ''}>{urgentCount} 个会话已等待超过 {slaMinutes} 个工作分钟</span>} tone="red" />
          <MetricCard icon={CheckCircle2} label="回复率" value={summary ? `${answeredRate}%` : '—'} detail={<>{summary?.answered ?? '—'} 个问题已获得客服回复</>} tone="green" progress={answeredRate} />
          <MetricCard icon={Clock3} label="首响时长" value={formatMinutes(summary?.p50_first_response_minutes)} detail={<>平均 {formatMinutes(summary?.avg_first_response_minutes)} · P95 {formatMinutes(summary?.p95_first_response_minutes)}</>} tone="violet" />
        </section>

        <section aria-label="首响与自动化指标" className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <article className={`${surface} p-5`}>
            <div className="flex items-center justify-between"><p className="text-sm font-medium text-slate-500 dark:text-slate-400">自然首响时长</p><Clock3 size={18} className="text-blue-500" /></div>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-950 dark:text-white">{formatMinutes(calendarDuration(summary))}</p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-slate-500"><span>P50<br /><strong className="font-medium text-slate-700 dark:text-slate-200">{formatMinutes(calendarDuration(summary, 'p50'))}</strong></span><span>P95<br /><strong className="font-medium text-slate-700 dark:text-slate-200">{formatMinutes(calendarDuration(summary, 'p95'))}</strong></span><span>最大<br /><strong className="font-medium text-slate-700 dark:text-slate-200">{formatMinutes(calendarDuration(summary, 'max'))}</strong></span></div>
          </article>
          <article className={`${surface} p-5`}>
            <div className="flex items-center justify-between"><p className="text-sm font-medium text-slate-500 dark:text-slate-400">工作首响时长</p><ShieldCheck size={18} className="text-violet-500" /></div>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-950 dark:text-white">{formatMinutes(workingDuration(summary))}</p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-slate-500"><span>P50<br /><strong className="font-medium text-slate-700 dark:text-slate-200">{formatMinutes(workingDuration(summary, 'p50'))}</strong></span><span>P95<br /><strong className="font-medium text-slate-700 dark:text-slate-200">{formatMinutes(workingDuration(summary, 'p95'))}</strong></span><span>最大<br /><strong className="font-medium text-slate-700 dark:text-slate-200">{formatMinutes(workingDuration(summary, 'max'))}</strong></span></div>
          </article>
          <article className={`${surface} p-5`}>
            <div className="flex items-center justify-between"><p className="text-sm font-medium text-slate-500 dark:text-slate-400">{slaMinutes} 分钟内回复</p><CheckCircle2 size={18} className="text-emerald-500" /></div>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-950 dark:text-white">{formatPercent(summary?.within_sla_rate)}</p>
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{summary?.within_sla_count ?? 0} 个已回复问题达到工作时长 SLA</p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, Math.max(0, summary?.within_sla_rate ?? 0))}%` }} /></div>
          </article>
          <article className={`${surface} p-5`}>
            <div className="flex items-center justify-between"><p className="text-sm font-medium text-slate-500 dark:text-slate-400">提醒与自动工单</p><BellRing size={18} className="text-amber-500" /></div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center"><span><strong className="block text-xl font-semibold tabular-nums text-slate-900 dark:text-white">{summary?.avg_reminder_count ?? 0}</strong><small className="text-[11px] text-slate-400">平均提醒</small></span><span><strong className="block text-xl font-semibold tabular-nums text-slate-900 dark:text-white">{summary?.auto_ticket_count ?? 0}</strong><small className="text-[11px] text-slate-400">自动工单</small></span><span><strong className="block text-sm font-semibold tabular-nums text-slate-900 dark:text-white">{formatMinutes(summary?.longest_pending_minutes)}</strong><small className="text-[11px] text-slate-400">最长待回复</small></span></div>
          </article>
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(360px,1fr)]">
          <article className={`${surface} p-5`}>
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white"><BarChart3 size={18} className="text-blue-600" />问题与响应趋势</h2><p className="mt-1 text-xs text-slate-400">按问题发生日统计，折线展示客户消息量</p></div><div className="flex items-center gap-3 text-xs text-slate-500"><span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />已回复</span><span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-red-400" />未回复</span></div></div>
            {trendData.length === 0 ? <EmptyState icon={BarChart3} title="暂无趋势数据" detail="当前筛选范围内还没有客户问题。" /> : <div className="h-[310px]"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={trendData} margin={{ top: 5, right: 8, left: -18, bottom: 0 }}><CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#94a3b8" strokeOpacity={0.18} /><XAxis dataKey="displayDate" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} minTickGap={24} /><YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} allowDecimals={false} /><Tooltip contentStyle={{ borderRadius: 12, border: '1px solid rgba(148,163,184,.25)', boxShadow: '0 10px 30px rgba(15,23,42,.12)', fontSize: 12 }} /><Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} /><Bar dataKey="answered" name="已回复" stackId="questions" fill="#10b981" radius={[0, 0, 4, 4]} maxBarSize={28} /><Bar dataKey="unanswered" name="未回复" stackId="questions" fill="#f87171" radius={[4, 4, 0, 0]} maxBarSize={28} /><Line type="monotone" dataKey="customer_message_count" name="客户消息" stroke="#2563eb" strokeWidth={2.5} dot={{ r: 3, fill: '#fff', strokeWidth: 2 }} activeDot={{ r: 5 }} /></ComposedChart></ResponsiveContainer></div>}
          </article>

          <article className={`${surface} flex min-h-[390px] flex-col overflow-hidden`}>
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800"><div><h2 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white"><BellRing size={18} className="text-red-500" />待回复队列</h2><p className="mt-1 text-xs text-slate-400">最长等待优先</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${pending.length ? 'bg-red-50 text-red-600 dark:bg-red-950/60 dark:text-red-300' : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-300'}`}>{pending.length} 待处理</span></div>
            <div className="max-h-[326px] flex-1 overflow-y-auto">{pending.length === 0 ? <EmptyState icon={CheckCircle2} title="所有消息都已回复" detail="当前没有需要客服跟进的会话。" /> : pending.map((item) => {
              const minutes = item.pending_working_minutes ?? 0; const severity = minutes >= slaMinutes + 60 ? 'critical' : minutes >= slaMinutes ? 'warning' : 'normal';
              const waitTone = severity === 'critical' ? 'bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300' : severity === 'warning' ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300' : 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300';
              const destination = pendingReplyDestination(item);
              return <div key={item.batch_id} className="group flex w-full items-center gap-3 border-b border-slate-100 px-5 py-3.5 text-left transition last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"><span className={`h-9 w-1 shrink-0 rounded-full ${severity === 'critical' ? 'bg-red-500' : severity === 'warning' ? 'bg-amber-400' : 'bg-blue-400'}`} /><button type="button" onClick={() => navigate(destination)} className="min-w-0 flex flex-1 items-center gap-3 text-left"><span className="min-w-0 flex-1"><span className="flex items-center gap-2"><strong className="truncate text-sm text-slate-800 dark:text-slate-100">{item.conversation_name || item.conversation_key}</strong><small className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">{item.conversation_type === 'group' ? '群聊' : '私聊'}</small>{item.ticket_number && <small title={item.ticket_id || undefined} className="shrink-0 rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-600 dark:bg-violet-950/60 dark:text-violet-300">工单 {item.ticket_number}</small>}</span><span className="mt-1 block truncate text-xs text-slate-400">{item.customer_sender_name || '未知客户'} · {item.responsible_staff?.name || '未分配负责人'} · {item.customer_message_count} 条消息 · 已提醒 {item.reminder_count} 次</span>{item.ambiguous_reason && <span className="mt-1 block text-xs text-amber-600">{item.ambiguous_reason}</span>}</span><span className={`shrink-0 rounded-lg px-2 py-1 text-xs font-medium tabular-nums ${waitTone}`}>{formatWait(item.pending_reply_since)}</span><ArrowRight size={16} className="shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-blue-500" /></button>{item.reply_candidates?.map((candidate) => <button key={candidate.event_id} type="button" disabled={matchingBatch === item.batch_id} onClick={() => void resolveReplyMatch(item.batch_id, candidate.event_id)} className="shrink-0 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-700 disabled:opacity-50" title={candidate.content_summary || '客服回复'}>匹配 {candidate.sender_name || '客服'} 的回复</button>)}{item.can_dispatch_to_wecom && <button type="button" disabled={dispatchingBatch === item.batch_id} onClick={() => void dispatchToWeCom(item)} className="shrink-0 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300" title="精准打开该企业微信群">{dispatchingBatch === item.batch_id ? '发送中' : '前往企微'}</button>}{isAdmin && <button type="button" disabled={dismissingBatch === item.batch_id} onClick={() => void dismissPending(item)} className="shrink-0 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400" title="删除这条待回复提醒并停止后续提醒"><Trash2 size={14} className="inline-block align-[-2px]" /> {dismissingBatch === item.batch_id ? '删除中' : '删除'}</button>}</div>;
            })}</div>
            {pending.length > 0 && <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-3 dark:border-slate-800 dark:bg-slate-950/30">
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs font-medium text-slate-500">人工回复参考</label>
                <select aria-label="选择待回复问题" value={suggestionTarget} onChange={(event) => { setSuggestionTarget(event.target.value); setSuggestionPanel(null); }} className="h-8 min-w-[220px] flex-1 rounded-md border border-slate-200 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-900">
                  {pending.map((item) => <option key={item.batch_id} value={item.batch_id}>{item.conversation_name || item.conversation_key} · {item.customer_sender_name || '未知客户'}</option>)}
                </select>
                <button type="button" disabled={!suggestionTarget || suggestionLoading === suggestionTarget} onClick={() => void loadKnowledgeSuggestions(suggestionTarget)} className="rounded-md border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-700 disabled:opacity-50 dark:border-violet-900 dark:bg-violet-950/50 dark:text-violet-300">{suggestionLoading === suggestionTarget ? '检索中' : suggestionPanel?.batchId === suggestionTarget ? '收起知识库建议' : '获取知识库建议'}</button>
              </div>
              {suggestionPanel?.batchId === suggestionTarget && <div className="mt-3 space-y-2">
                {suggestionPanel.data.items.length === 0 ? <p className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900">{suggestionPanel.data.message || '知识库中暂未找到相关内容'}</p> : suggestionPanel.data.items.map((suggestion) => <div key={`${suggestion.collection_id}:${suggestion.document_id}:${suggestion.relevance_score}`} className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                  <div className="flex items-start justify-between gap-3"><span><strong className="block text-xs text-slate-700 dark:text-slate-200">{suggestion.title}</strong><small className="text-[10px] text-slate-400">{suggestion.collection_name} · 相关度 {Math.round(suggestion.relevance_score * 100)}%</small></span><button type="button" onClick={() => void copySuggestion(suggestion.suggested_reply)} className="shrink-0 rounded border border-blue-200 px-2 py-1 text-xs font-medium text-blue-700 dark:border-blue-900 dark:text-blue-300">复制</button></div>
                  <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-600 dark:text-slate-300">{suggestion.suggested_reply}</p>
                </div>)}
                <p className="text-[10px] text-slate-400">仅供人工参考，请核对后再回复；系统不会自动发送。</p>
              </div>}
            </div>}
          </article>
        </section>

        <section className="space-y-4">
          <article className={`${surface} overflow-hidden`}>
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
              <div><h2 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white"><Users size={18} className="text-blue-600" />客服负载与实际回复绩效</h2><p className="mt-1 text-xs text-slate-400">负载归问题负责人；实际回复、首响和跨客服协助归真实回复人</p></div>
              <span className="text-xs text-slate-400">首响单元格：自然时长 / 工作时长</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1420px] text-sm">
                <thead className="bg-slate-50/70 text-xs font-medium text-slate-400 dark:bg-slate-950/40">
                  <tr><th rowSpan={2} className="px-5 py-3 text-left">客服</th><th colSpan={6} className="border-l border-slate-200 px-3 py-2 text-center dark:border-slate-700">负责人负载</th><th colSpan={6} className="border-l border-slate-200 px-3 py-2 text-center dark:border-slate-700">实际回复绩效</th></tr>
                  <tr className="border-t border-slate-200 dark:border-slate-700"><th className="border-l border-slate-200 px-3 py-2 text-right dark:border-slate-700">分配问题</th><th className="px-3 py-2 text-right">已回复</th><th className="px-3 py-2 text-right">未回复</th><th className="px-3 py-2 text-right">负责回复率</th><th className="px-3 py-2 text-right">自动工单</th><th className="px-3 py-2 text-right">未处理工单</th><th className="border-l border-slate-200 px-3 py-2 text-right dark:border-slate-700">实际回复</th><th className="px-3 py-2 text-right">跨客服协助</th><th className="px-3 py-2 text-right">平均首响</th><th className="px-3 py-2 text-right">P50 首响</th><th className="px-3 py-2 text-right">P95 首响</th><th className="px-5 py-2 text-right">{slaMinutes}分钟达标</th></tr>
                </thead>
                <tbody>{stats?.staff_breakdown.length ? stats.staff_breakdown.map((item) => {
                  const assignedQuestions = item.assigned_questions ?? item.batch_count;
                  const assignedAnswered = item.assigned_answered ?? item.answered;
                  const assignedUnanswered = item.assigned_unanswered ?? item.unanswered;
                  const assignedRate = item.assigned_response_rate ?? item.response_rate;
                  const replyMetrics = item.actual_response_metrics;
                  const durationCell = (kind: 'avg' | 'p50' | 'p95') => <span className="block whitespace-nowrap text-xs tabular-nums"><strong className="font-medium text-slate-700 dark:text-slate-200">{formatMinutes(calendarDuration(replyMetrics, kind))}</strong><small className="mt-0.5 block text-[10px] text-slate-400">工作 {formatMinutes(workingDuration(replyMetrics, kind))}</small></span>;
                  return <tr key={item.staff_id} className="border-t border-slate-100 text-slate-600 dark:border-slate-800 dark:text-slate-300"><td className="whitespace-nowrap px-5 py-3.5 font-medium text-slate-800 dark:text-slate-100">{item.staff_name || '未分配'}</td><td className="border-l border-slate-100 px-3 py-3.5 text-right tabular-nums dark:border-slate-800">{assignedQuestions}</td><td className="px-3 py-3.5 text-right tabular-nums text-emerald-600">{assignedAnswered}</td><td className="px-3 py-3.5 text-right tabular-nums text-red-500">{assignedUnanswered}</td><td className="px-3 py-3.5 text-right tabular-nums">{formatPercent(assignedRate)}</td><td className="px-3 py-3.5 text-right tabular-nums">{item.auto_ticket_count ?? 0}</td><td className="px-3 py-3.5 text-right tabular-nums">{unprocessedTickets(item)}</td><td className="border-l border-slate-100 px-3 py-3.5 text-right font-medium tabular-nums text-blue-600 dark:border-slate-800 dark:text-blue-300">{item.actual_replies ?? '—'}</td><td className="px-3 py-3.5 text-right tabular-nums">{item.cross_assist_count ?? '—'}</td><td className="px-3 py-3.5 text-right">{durationCell('avg')}</td><td className="px-3 py-3.5 text-right">{durationCell('p50')}</td><td className="px-3 py-3.5 text-right">{durationCell('p95')}</td><td className="px-5 py-3.5 text-right tabular-nums"><strong className="font-medium text-emerald-600">{replyMetrics ? formatPercent(replyMetrics.within_sla_rate) : '—'}</strong><small className="mt-0.5 block text-[10px] text-slate-400">{replyMetrics?.within_sla_count ?? '—'} 个</small></td></tr>;
                }) : <tr><td colSpan={13}><EmptyState icon={Users} title="暂无客服数据" detail="有客户问题后，这里会显示负责人负载和实际回复绩效。" /></td></tr>}</tbody>
              </table>
            </div>
          </article>

          <article className={`${surface} overflow-hidden`}><div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800"><h2 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white"><MessageSquareText size={18} className="text-violet-600" />群聊表现</h2><p className="mt-1 text-xs text-slate-400">定位高流量和高延迟客户群</p></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead><tr className="bg-slate-50/70 text-left text-xs font-medium text-slate-400 dark:bg-slate-950/40"><th className="px-5 py-3">群聊</th><th className="px-3 py-3 text-right">问题</th><th className="px-3 py-3 text-right">消息</th><th className="px-3 py-3 text-right">未回复</th><th className="px-3 py-3 text-right">自然 P95</th><th className="px-5 py-3 text-right">工作 P95</th></tr></thead><tbody>{stats?.group_breakdown.length ? stats.group_breakdown.map((item) => <tr key={item.conversation_key} className="border-t border-slate-100 text-slate-600 dark:border-slate-800 dark:text-slate-300"><td className="max-w-[320px] truncate px-5 py-3.5 font-medium text-slate-800 dark:text-slate-100">{item.conversation_name || item.conversation_key}</td><td className="px-3 py-3.5 text-right tabular-nums">{item.batch_count}</td><td className="px-3 py-3.5 text-right tabular-nums">{item.customer_message_count}</td><td className={`px-3 py-3.5 text-right tabular-nums ${item.unanswered ? 'font-medium text-red-500' : 'text-emerald-600'}`}>{item.unanswered}</td><td className="px-3 py-3.5 text-right tabular-nums">{formatMinutes(calendarDuration(item, 'p95'))}</td><td className="px-5 py-3.5 text-right tabular-nums">{formatMinutes(workingDuration(item, 'p95'))}</td></tr>) : <tr><td colSpan={6}><EmptyState icon={MessageSquareText} title="暂无群聊数据" detail="收到客户群消息后，这里会形成群聊维度明细。" /></td></tr>}</tbody></table></div></article>
        </section>

        {settings && <details className={`${surface} group overflow-hidden`}><summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 [&::-webkit-details-marker]:hidden"><div><h2 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white"><SlidersHorizontal size={18} className="text-slate-500" />提醒策略设置</h2><p className="mt-1 text-xs text-slate-400">当前：提醒{settings.reminders_enabled ? '开启' : '关闭'}，{settings.first_reminder_minutes} 分钟首次提醒，每 {settings.repeat_reminder_minutes} 分钟重复，最多 {settings.max_reminders} 次</p></div><ChevronDown size={18} className="text-slate-400 transition group-open:rotate-180" /></summary><div className="border-t border-slate-100 p-5 dark:border-slate-800"><div className="flex justify-between gap-3"><p className="text-xs text-slate-400">仅累计配置的工作时段；关闭提醒不会停止消息监控和自动建单。</p><span className="text-sm text-emerald-600">{saved}</span></div><label className="mt-4 flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-700 dark:bg-slate-950/40"><span><strong className="block text-sm font-medium text-slate-800 dark:text-slate-100">提醒功能</strong><small className="mt-1 block text-xs text-slate-400">控制站内通知和企微私信的统一发送开关</small></span><input aria-label="提醒功能开关" type="checkbox" checked={settings.reminders_enabled} onChange={(event) => update('reminders_enabled', event.target.checked)} className="h-5 w-5 accent-blue-600" /></label><div className="mt-4 grid gap-3 md:grid-cols-4 xl:grid-cols-6"><label className="text-xs font-medium text-slate-500">首次提醒（分钟）<input type="number" min={1} value={settings.first_reminder_minutes} onChange={(event) => update('first_reminder_minutes', Number(event.target.value))} className={`mt-1.5 ${inputClass}`} /></label><label className="text-xs font-medium text-slate-500">重复间隔（分钟）<input type="number" min={1} value={settings.repeat_reminder_minutes} onChange={(event) => update('repeat_reminder_minutes', Number(event.target.value))} className={`mt-1.5 ${inputClass}`} /></label><label className="text-xs font-medium text-slate-500">最多提醒次数<input type="number" min={1} value={settings.max_reminders} onChange={(event) => update('max_reminders', Number(event.target.value))} className={`mt-1.5 ${inputClass}`} /></label><label className="text-xs font-medium text-slate-500">时区<input value={settings.timezone} onChange={(event) => update('timezone', event.target.value)} className={`mt-1.5 ${inputClass}`} /></label><label className="mt-5 flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300"><input type="checkbox" checked={Boolean(settings.notification_channels.in_app)} onChange={(event) => update('notification_channels', { ...settings.notification_channels, in_app: event.target.checked })} />站内通知</label><label className="mt-5 flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300"><input type="checkbox" checked={Boolean(settings.notification_channels.wecom_app)} onChange={(event) => update('notification_channels', { ...settings.notification_channels, wecom_app: event.target.checked })} />企微私信</label></div><div className="mt-5 grid gap-2 md:grid-cols-2 xl:grid-cols-4">{weekDays.map((label, index) => { const range = settings.weekly_schedule[String(index)]?.[0]; return <div key={label} className={`flex items-center gap-2 rounded-lg border p-2 text-sm ${range ? 'border-blue-200 bg-blue-50/40 dark:border-blue-900 dark:bg-blue-950/20' : 'border-slate-200 dark:border-slate-700'}`}><label className="flex min-w-14 items-center gap-1.5 font-medium text-slate-600 dark:text-slate-300"><input type="checkbox" checked={Boolean(range)} onChange={(event) => updateSchedule(String(index), event.target.checked)} />{label}</label><input aria-label={`${label}开始时间`} type="time" disabled={!range} value={range?.start || '09:00'} onChange={(event) => updateSchedule(String(index), true, 'start', event.target.value)} className="min-w-0 flex-1 rounded border border-slate-200 bg-white p-1 text-xs disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900" /><span className="text-slate-300">—</span><input aria-label={`${label}结束时间`} type="time" disabled={!range} value={range?.end || '18:00'} onChange={(event) => updateSchedule(String(index), true, 'end', event.target.value)} className="min-w-0 flex-1 rounded border border-slate-200 bg-white p-1 text-xs disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900" /></div>; })}</div><button onClick={() => void save()} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700"><Save size={16} />保存提醒策略</button></div></details>}
        <section className={`${surface} overflow-hidden`}>
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
            <div><h2 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white"><Users size={18} className="text-indigo-500" />群聊负责人和客户成员</h2><p className="mt-1 text-xs text-slate-400">群主和人工座席识别为客服，其余已观察成员默认识别为客户；客户成员可直接新增、取消或保存修改</p></div>
            <div className="flex flex-wrap items-center gap-2"><button type="button" onClick={() => navigate('/settings/staff')} className="rounded-lg border border-indigo-200 px-3 py-2 text-xs font-medium text-indigo-700 dark:border-indigo-900 dark:text-indigo-300">添加人工座席</button><button type="button" disabled={bindingSyncing} onClick={() => void syncWeComBindings()} className="rounded-lg border border-emerald-200 px-3 py-2 text-xs font-medium text-emerald-700 disabled:opacity-50 dark:border-emerald-900 dark:text-emerald-300">{bindingSyncing ? '同步中' : '同步企微精准群绑定'}</button></div>
          </div>
          {settings && <div className="grid gap-3 border-b border-slate-100 bg-slate-50/40 px-5 py-4 dark:border-slate-800 dark:bg-slate-950/20 md:grid-cols-2">
            <label className="text-xs font-medium text-slate-500">企微聚合窗口（分钟）<input type="number" min={1} max={30} value={settings.wecom_digest_minutes} onChange={(event) => update('wecom_digest_minutes', Number(event.target.value))} className={`mt-1.5 ${inputClass}`} /></label>
            <label className="text-xs font-medium text-slate-500">每条最多群聊数<input type="number" min={1} max={20} value={settings.wecom_digest_max_items} onChange={(event) => update('wecom_digest_max_items', Number(event.target.value))} className={`mt-1.5 ${inputClass}`} /></label>
            <p className="text-xs text-slate-400 md:col-span-2">以上设置随“保存提醒策略”统一保存；各问题仍独立计算提醒次数。</p>
          </div>}
          <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-sm">
            <thead><tr className="bg-slate-50/70 text-left text-xs font-medium text-slate-400 dark:bg-slate-950/40"><th className="px-5 py-3">群聊</th><th className="px-3 py-3">群 ID / 平台</th><th className="px-3 py-3">客户成员</th><th className="px-5 py-3">群聊负责人（默认群主）</th></tr></thead>
            <tbody>{groupOwners.length ? groupOwners.map((item) => {
              const key = `${item.platform_id}:${item.group_key}`;
              const availableMembers = [...new Map(
                [...item.observed_members, ...item.customer_members, ...(rosterAddedMembers[key] || [])]
                  .map((member) => [`${member.identity_type}:${member.identity_value}`, member]),
              ).values()];
              const selected = new Set(rosterDrafts[key] ?? (item.customer_roster_configured ? item.customer_members : item.observed_members).map((member) => `${member.identity_type}:${member.identity_value}`));
              return <tr key={key} className="border-t border-slate-100 text-slate-600 dark:border-slate-800 dark:text-slate-300">
                <td className="px-5 py-3.5 font-medium text-slate-800 dark:text-slate-100">{item.group_name || item.group_key}</td>
                <td className="px-3 py-3.5"><span className="block max-w-[220px] truncate text-xs" title={item.group_key}>{item.group_key}</span><small className="text-slate-400">{item.platform_name || item.platform_id}</small></td>
                <td className="max-w-[390px] px-3 py-3.5">
                  <div className="flex flex-wrap gap-1.5">{availableMembers.length ? availableMembers.map((member) => {
                    const identityKey = `${member.identity_type}:${member.identity_value}`;
                    const checked = selected.has(identityKey);
                    return <button key={identityKey} type="button" disabled={rosterSaving === key} onClick={() => toggleCustomerMember(item, identityKey)} className={`rounded-full border px-2 py-1 text-xs transition disabled:opacity-50 ${checked ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/60 dark:text-blue-300' : 'border-slate-200 text-slate-500 line-through dark:border-slate-700 dark:text-slate-400'}`} aria-pressed={checked} title={checked ? '点击后从客户成员中删除' : '点击后重新加入客户成员'}>{checked ? '✓ ' : ''}{member.display_name}</button>;
                  }) : <span className="text-xs text-slate-400">尚未观察到客户，可在下方手动新增</span>}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input aria-label={`${item.group_name || item.group_key}新增客户成员`} value={rosterInputs[key] || ''} onChange={(event) => setRosterInputs((inputs) => ({ ...inputs, [key]: event.target.value }))} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addCustomerMember(item); } }} placeholder="输入客户姓名" className="h-8 min-w-[150px] flex-1 rounded-md border border-slate-200 bg-white px-2 text-xs outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950" />
                    <button type="button" disabled={rosterSaving === key || !String(rosterInputs[key] || '').trim()} onClick={() => addCustomerMember(item)} className="rounded-md border border-blue-200 px-2.5 py-1.5 text-xs font-medium text-blue-700 disabled:opacity-40 dark:border-blue-900 dark:text-blue-300">新增</button>
                    <button type="button" disabled={rosterSaving === key} onClick={() => void saveCustomerRoster(item)} className="rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-40">{rosterSaving === key ? '保存中' : '保存客户成员'}</button>
                    <small className="text-slate-400">{item.customer_roster_configured ? `已保存 · 版本 ${item.roster_version}` : `自动识别 ${selected.size} 人`}</small>
                  </div>
                </td>
                <td className="px-5 py-3.5">
                  <strong className="block font-medium text-slate-800 dark:text-slate-100">{item.assignment_source === 'manual_override' ? item.effective_staff_name : item.detected_owner_name || item.effective_staff_name || '群主尚未识别'}</strong>
                  <small className="mt-0.5 block text-slate-400">{item.assignment_source === 'manual_override' ? '已人工修改；选择默认项可恢复群主' : item.effective_staff_id ? '群主已关联人工座席' : item.detected_owner_name ? '群主尚未添加或匹配到人工座席' : '等待手机上报群主信息'}</small>
                  <select aria-label={`${item.group_name || item.group_key}负责人`} disabled={ownerSaving === key} value={item.assignment_source === 'manual_override' ? item.effective_staff_id || '' : ''} onChange={(event) => void changeGroupOwner(item, event.target.value)} className={`${inputClass} mt-2 min-w-[220px] disabled:opacity-50`}><option value="">{defaultGroupOwnerOptionLabel(item)}</option>{staffOptions.map((staff) => <option key={staff.id} value={staff.id}>{staff.name || staff.nickname || staff.username}{staff.wecom_userid ? '' : '（仅站内提醒）'}</option>)}</select>
                </td>
              </tr>;
            }) : <tr><td colSpan={4}><EmptyState icon={Users} title="暂无群聊" detail="收到群消息后，可在这里配置客户成员和负责人。" /></td></tr>}</tbody>
          </table></div>
        </section>
      </div>
    </main>
  );
}
