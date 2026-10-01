import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, Link2, Loader2, RefreshCw, Search, ShieldAlert, Unlink, UserCheck } from 'lucide-react';
import { staffApi, type WecomIdentityOverview, type WecomIdentityStatus } from '@/services/staffApi';
import { useToast } from '@/hooks/useToast';

const inputClass = 'h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';
const fieldLabels = { name: '姓名', nickname: '昵称', username: '登录名' } as const;
const statusMeta: Record<WecomIdentityStatus, { label: string; tone: string }> = {
  auto_bound: { label: '自动绑定', tone: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' },
  manual_bound: { label: '人工绑定', tone: 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300' },
  unmatched: { label: '待匹配', tone: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300' },
  superseded: { label: '已被替换', tone: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  missing_name: { label: '缺少姓名', tone: 'bg-orange-50 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300' },
  ambiguous: { label: '重名冲突', tone: 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300' },
  conflict: { label: '绑定冲突', tone: 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300' },
  ignored: { label: '已忽略', tone: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400' },
};

const personName = (person: { nickname: string | null; name: string | null; username: string }) => person.nickname || person.name || person.username;
const formatTime = (value: string | null) => value ? new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(value)) : '尚未同步';

const WecomUserIdSettings: React.FC = () => {
  const { showToast } = useToast();
  const [data, setData] = useState<WecomIdentityOverview | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | WecomIdentityStatus>('all');
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [manualDrafts, setManualDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('load');
  const [settingsDirty, setSettingsDirty] = useState(false);

  const load = useCallback(async () => {
    setBusy('load');
    try { const next = await staffApi.getWecomIdentityOverview(); setData(next); setManualDrafts(Object.fromEntries(next.staff.map((person) => [person.id, person.wecom_userid || '']))); }
    catch (error) { showToast('error', error instanceof Error ? error.message : '加载企微身份设置失败'); }
    finally { setBusy(''); }
  }, [showToast]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (data) setManualDrafts(Object.fromEntries(data.staff.map((person) => [person.id, person.wecom_userid || ''])));
  }, [data]);

  const updateSetting = <K extends keyof WecomIdentityOverview['settings']>(key: K, value: WecomIdentityOverview['settings'][K]) => {
    setData((current) => current ? { ...current, settings: { ...current.settings, [key]: value } } : current);
    setSettingsDirty(true);
  };
  const saveSettings = async () => {
    if (!data) return;
    setBusy('settings');
    try {
      setData(await staffApi.updateWecomIdentitySettings({ platform_id: data.platform.id, auto_bind_enabled: data.settings.auto_bind_enabled, match_fields: data.settings.match_fields, existing_binding_policy: data.settings.existing_binding_policy }));
      setSettingsDirty(false); showToast('success', '自动绑定设置已保存并重新匹配');
    } catch (error) { showToast('error', error instanceof Error ? error.message : '保存失败'); }
    finally { setBusy(''); }
  };
  const rematch = async () => {
    if (!data) return;
    setBusy('reconcile');
    try { const next = await staffApi.reconcileWecomIdentities(data.platform.id); setData(next); showToast(next.settings.last_sync_status === 'ok' ? 'success' : 'error', next.settings.last_sync_status === 'ok' ? '已同步机器人并重新匹配' : '机器人暂时不可达，已保留历史配置'); }
    catch (error) { showToast('error', error instanceof Error ? error.message : '重新匹配失败'); }
    finally { setBusy(''); }
  };
  const act = async (id: string, action: 'bind' | 'unbind' | 'ignore' | 'resume') => {
    setBusy(id);
    try { setData(await staffApi.handleWecomIdentity(id, action, assignments[id])); showToast('success', '处理结果已保存'); }
    catch (error) { showToast('error', error instanceof Error ? error.message : '操作失败'); }
    finally { setBusy(''); }
  };
  const saveManual = async (staffId: string) => {
    setBusy(`staff:${staffId}`);
    try {
      await staffApi.updateStaff(staffId, { wecom_userid: (manualDrafts[staffId] || '').trim() || null });
      const next = await staffApi.getWecomIdentityOverview(); setData(next);
      setManualDrafts(Object.fromEntries(next.staff.map((person) => [person.id, person.wecom_userid || ''])));
      showToast('success', '客服 UserID 已保存');
    } catch (error) { showToast('error', error instanceof Error ? error.message : '保存失败'); }
    finally { setBusy(''); }
  };

  const rows = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return (data?.identities || []).filter((item) => (status === 'all' || item.status === status) && (!needle || [item.userid, item.display_name || '', item.bound_staff ? personName(item.bound_staff) : '', item.reason || ''].some((value) => value.toLocaleLowerCase().includes(needle))));
  }, [data, query, status]);

  if (!data && busy === 'load') return <div className="flex min-h-[420px] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-blue-600" /></div>;
  if (!data) return <div className="p-8 text-sm text-slate-500">暂无可管理的企业微信长连接机器人。</div>;
  const connected = data.platform.connection_state === 'active' && data.settings.last_sync_status === 'ok';
  const summaryCards = [
    { label: '已绑定', value: String(data.counts.bound), Icon: UserCheck, tone: 'text-emerald-600' },
    { label: '待匹配', value: String(data.counts.pending), Icon: Clock3, tone: 'text-amber-600' },
    { label: '重名或占用冲突', value: String(data.counts.conflict), Icon: ShieldAlert, tone: 'text-red-600' },
    { label: '缺少姓名', value: String(data.counts.missing_name), Icon: AlertTriangle, tone: 'text-orange-600' },
    { label: '机器人连接', value: connected ? '正常' : '需检查', Icon: connected ? CheckCircle2 : AlertTriangle, tone: connected ? 'text-emerald-600' : 'text-amber-600' },
  ];

  return <main className="mx-auto w-full max-w-[1500px] p-4 sm:p-6 lg:p-8">
    <header className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
      <div><div className="mb-2 flex items-center gap-2 text-sm font-medium text-blue-600"><Link2 size={16} />提醒身份映射</div><h1 className="text-2xl font-semibold text-slate-950 dark:text-white">企业微信 UserID</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">客服首次私聊机器人后，系统仅同步身份元数据并按姓名、昵称或登录名做唯一精确匹配，不保存消息正文。</p></div>
      <button type="button" onClick={() => void rematch()} disabled={Boolean(busy)} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"><RefreshCw size={16} className={busy === 'reconcile' ? 'animate-spin' : ''} />立即重新匹配</button>
    </header>

    <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {summaryCards.map(({ label, value, Icon, tone }) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"><div className="flex items-center justify-between text-sm text-slate-500"><span>{label}</span><Icon size={18} className={tone} /></div><strong className="mt-2 block text-xl text-slate-950 dark:text-white">{value}</strong></div>)}
    </section>

    <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold text-slate-900 dark:text-white">自动绑定设置</h2><p className="mt-1 text-sm text-slate-500">{data.platform.name || '启用中的企微机器人'} · 最近同步 {formatTime(data.settings.last_sync_at)} · {data.settings.last_sync_status}</p></div><button type="button" onClick={() => void saveSettings()} disabled={!settingsDirty || Boolean(busy)} className="h-9 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white disabled:opacity-35 dark:bg-white dark:text-slate-900">保存设置</button></div>
      {data.settings.last_sync_error && <div className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">机器人暂时不可达，以下仍为 PostgreSQL 中的历史配置。错误：{data.settings.last_sync_error}</div>}
      <div className="grid gap-5 lg:grid-cols-3">
        <label className="flex items-center justify-between rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700"><span><strong className="block text-slate-800 dark:text-slate-100">自动绑定</strong><span className="text-xs text-slate-500">默认开启，仅唯一精确命中生效</span></span><input type="checkbox" checked={data.settings.auto_bind_enabled} onChange={(event) => updateSetting('auto_bind_enabled', event.target.checked)} className="h-5 w-5 accent-blue-600" /></label>
        <fieldset><legend className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-200">参与匹配字段</legend><div className="flex flex-wrap gap-2">{(Object.keys(fieldLabels) as Array<keyof typeof fieldLabels>).map((field) => { const checked = data.settings.match_fields.includes(field); return <label key={field} className={`cursor-pointer rounded-lg border px-3 py-2 text-sm ${checked ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300' : 'border-slate-200 text-slate-500 dark:border-slate-700'}`}><input type="checkbox" className="sr-only" checked={checked} onChange={() => { const next = checked ? data.settings.match_fields.filter((item) => item !== field) : [...data.settings.match_fields, field]; if (next.length) updateSetting('match_fields', next); }} />{fieldLabels[field]}</label>; })}</div></fieldset>
        <label className="text-sm font-medium text-slate-700 dark:text-slate-200">客服已有旧 UserID<select value={data.settings.existing_binding_policy} onChange={(event) => updateSetting('existing_binding_policy', event.target.value as 'replace' | 'preserve')} className={`${inputClass} mt-2 w-full`}><option value="replace">唯一匹配时自动替换（推荐）</option><option value="preserve">保留旧绑定，转人工处理</option></select></label>
      </div>
    </section>

    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-3 border-b border-slate-100 p-5 dark:border-slate-800 lg:flex-row lg:items-center lg:justify-between"><div><h2 className="font-semibold text-slate-900 dark:text-white">身份发现记录</h2><p className="mt-1 text-sm text-slate-500">冲突不会抢占其他客服的绑定；忽略记录可随时恢复。</p></div><div className="flex gap-2"><label className="relative flex-1"><Search size={16} className="absolute left-3 top-3 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索姓名、UserID、原因" className={`${inputClass} w-full pl-9 lg:w-72`} /></label><select value={status} onChange={(event) => setStatus(event.target.value as typeof status)} className={inputClass}><option value="all">全部状态</option>{Object.entries(statusMeta).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}</select></div></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[1040px] text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500 dark:bg-slate-950/40"><tr><th className="px-5 py-3">企微身份</th><th className="px-4 py-3">发现时间</th><th className="px-4 py-3">结果</th><th className="px-4 py-3">绑定客服 / 原因</th><th className="px-5 py-3 text-right">人工处理</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">
        {rows.map((item) => { const bound = item.status === 'auto_bound' || item.status === 'manual_bound'; return <tr key={item.id} className="text-slate-700 dark:text-slate-300"><td className="px-5 py-4"><strong className="block text-slate-900 dark:text-white">{item.display_name || '未提供显示姓名'}</strong><span className="mt-1 block font-mono text-xs text-slate-500">{item.userid}</span></td><td className="px-4 py-4 text-xs text-slate-500"><span className="block">首次 {formatTime(item.first_seen)}</span><span className="mt-1 block">最近 {formatTime(item.last_seen)}</span></td><td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusMeta[item.status].tone}`}>{statusMeta[item.status].label}</span>{item.match_field && item.match_field !== 'manual' && <span className="ml-2 text-xs text-slate-400">按 {fieldLabels[item.match_field as keyof typeof fieldLabels] || item.match_field}</span>}</td><td className="max-w-xs px-4 py-4"><strong className="block font-medium text-slate-800 dark:text-slate-200">{item.bound_staff ? personName(item.bound_staff) : '未绑定'}</strong><span className="mt-1 block text-xs leading-5 text-slate-500">{item.reason || '—'}</span></td><td className="px-5 py-4"><div className="flex items-center justify-end gap-2">{bound ? <button type="button" onClick={() => void act(item.id, 'unbind')} disabled={busy === item.id} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs hover:text-red-600 dark:border-slate-700"><Unlink size={14} />解绑</button> : item.status === 'ignored' ? <button type="button" onClick={() => void act(item.id, 'resume')} disabled={busy === item.id} className="h-9 rounded-lg border border-slate-200 px-3 text-xs dark:border-slate-700">恢复</button> : <><select aria-label={`为 ${item.display_name || item.userid} 选择客服`} value={assignments[item.id] || ''} onChange={(event) => setAssignments((current) => ({ ...current, [item.id]: event.target.value }))} className={`${inputClass} w-44`}><option value="">选择客服</option>{data.staff.map((person) => <option key={person.id} value={person.id}>{personName(person)}{person.wecom_userid ? '（替换旧值）' : ''}</option>)}</select><button type="button" onClick={() => void act(item.id, 'bind')} disabled={!assignments[item.id] || busy === item.id} className="h-9 rounded-lg bg-blue-600 px-3 text-xs font-medium text-white disabled:opacity-40">纠正绑定</button><button type="button" onClick={() => void act(item.id, 'ignore')} disabled={busy === item.id} className="h-9 rounded-lg px-2 text-xs text-slate-500 hover:text-red-600">忽略</button></>}</div></td></tr>; })}
        {!rows.length && <tr><td colSpan={5} className="px-5 py-10 text-center text-sm text-slate-500">当前筛选条件下没有身份记录。客服需要先私聊机器人一次。</td></tr>}
      </tbody></table></div>
    </section>

    <section className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="border-b border-slate-100 p-5 dark:border-slate-800"><h2 className="font-semibold text-slate-900 dark:text-white">客服手工绑定</h2><p className="mt-1 text-sm text-slate-500">用于机器人未返回显示姓名等特殊情况。同一项目内 UserID 不区分大小写且只能绑定一名有效客服。</p></div>
      <div className="divide-y divide-slate-100 dark:divide-slate-800">{data.staff.map((person) => { const draft = manualDrafts[person.id] ?? ''; const dirty = draft.trim() !== (person.wecom_userid || ''); return <div key={person.id} className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(180px,1fr)_minmax(260px,2fr)_auto] md:items-center"><div><strong className="block text-sm text-slate-900 dark:text-white">{personName(person)}</strong><span className="text-xs text-slate-400">@{person.username}</span></div><input aria-label={`${personName(person)} 的企业微信 UserID`} value={draft} onChange={(event) => setManualDrafts((current) => ({ ...current, [person.id]: event.target.value }))} placeholder="输入 UserID，留空表示解绑" className={`${inputClass} w-full font-mono`} /><button type="button" onClick={() => void saveManual(person.id)} disabled={!dirty || Boolean(busy)} className="h-9 rounded-lg bg-slate-900 px-4 text-xs font-medium text-white disabled:opacity-35 dark:bg-white dark:text-slate-900">{busy === `staff:${person.id}` ? '保存中…' : '保存'}</button></div>; })}</div>
    </section>
  </main>;
};

export default WecomUserIdSettings;
