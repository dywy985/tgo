import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Plus, RefreshCw, ShieldCheck, Smartphone, Trash2 } from 'lucide-react';
import platformsApiService, { PlatformConnectionStatus, PlatformResetPreview } from '@/services/platformsApi';
import { staffApi } from '@/services/staffApi';
import { replyMonitorApi, type MediaRecoveryCandidate, type MediaRecoveryJob, type MediaRecoveryTarget } from '@/services/replyMonitorApi';
import { ticketsApiService } from '@/services/ticketsApi';

interface DeviceDraft {
  name: string; robot_id: string; device_mode: 'staff' | 'robot'; bound_staff_id: string; enabled: boolean;
  identity_confirmed?: boolean;
  secret?: string; secret_set?: boolean; secret_last4?: string;
}
interface Props { platformId: string; platformName: string; }
const blankDevice = (): DeviceDraft => ({ name: '', robot_id: '', device_mode: 'robot', bound_staff_id: '', enabled: true, identity_confirmed: false, secret: '' });

const RecoveryCandidateImage = ({ candidate }: { candidate: MediaRecoveryCandidate }) => {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let active = true; let objectUrl = '';
    void ticketsApiService.getAttachmentBlob(candidate.content_url).then((blob) => {
      objectUrl = URL.createObjectURL(blob); if (active) setUrl(objectUrl);
    }).catch(() => undefined);
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [candidate.content_url]);
  return url ? <img src={url} alt="待确认的历史图片" className="h-32 w-32 rounded border object-contain" /> : <div className="flex h-32 w-32 items-center justify-center rounded border text-xs text-gray-400">加载候选图</div>;
};

const WorkToolPlatformConfig: React.FC<Props> = ({ platformId, platformName }) => {
  const [gatewayUrl, setGatewayUrl] = useState('');
  const [offlineThreshold, setOfflineThreshold] = useState(60);
  const [devices, setDevices] = useState<DeviceDraft[]>([blankDevice()]);
  const [staff, setStaff] = useState<any[]>([]);
  const [status, setStatus] = useState<PlatformConnectionStatus | null>(null);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [resetPreview, setResetPreview] = useState<PlatformResetPreview | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [recoveryTargets, setRecoveryTargets] = useState<MediaRecoveryTarget[] | null>(null);
  const [recoveryJob, setRecoveryJob] = useState<MediaRecoveryJob | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const [connection, staffResult] = await Promise.all([
        platformsApiService.getConnectionConfig(platformId), staffApi.listStaff({ limit: 100 }),
      ]);
      const cfg = Object.keys(connection.draft || {}).length ? connection.draft : connection.active;
      setGatewayUrl(cfg.gateway_url || ''); setOfflineThreshold(cfg.offline_threshold_seconds || 60);
      setDevices(cfg.devices?.length ? cfg.devices.map((d: DeviceDraft) => ({ ...d, device_mode: d.device_mode || 'staff', secret: '' })) : [blankDevice()]);
      setStaff(staffResult.data || []); setStatus(await platformsApiService.getConnectionStatus(platformId));
    } catch (e: any) { setError(e?.getUserMessage?.() || e?.message || '加载失败'); }
  }, [platformId]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const timer = window.setInterval(() => { platformsApiService.getConnectionStatus(platformId).then(setStatus).catch(() => undefined); }, 15000); return () => window.clearInterval(timer); }, [platformId]);

  const updateDevice = (index: number, patch: Partial<DeviceDraft>) => setDevices(current => current.map((item, i) => i === index ? { ...item, ...patch } : item));
  const save = async () => {
    setBusy('save'); setError(''); setNotice('');
    try { await platformsApiService.saveConnectionDraft(platformId, { gateway_url: gatewayUrl, offline_threshold_seconds: offlineThreshold, devices }); setNotice('草稿已加密保存。测试设备不会进入正式统计。'); await load(); }
    catch (e: any) { setError(e?.getUserMessage?.() || e?.message || '保存失败'); } finally { setBusy(''); }
  };
  const runAction = async (action: 'test' | 'activate') => {
    setBusy(action); setError(''); setNotice('');
    try {
      if (action === 'test') { const result = await platformsApiService.testConnection(platformId); const online = (result.devices || []).filter((d: any) => d.online).length; setNotice(`候选配置已加载，当前在线 ${online}/${(result.devices || []).length} 台；测试消息不会计入统计。`); }
      else { await platformsApiService.activateConnection(platformId); setNotice('新配置已启用，WorkTool 是唯一统计消息源。'); }
      setStatus(await platformsApiService.getConnectionStatus(platformId));
    } catch (e: any) { setError(e?.getUserMessage?.() || e?.message || `${action} 失败`); } finally { setBusy(''); }
  };
  const onlineByRobot = useMemo(() => new Map((status?.devices || []).map((d: any) => [d.robot_id, d])), [status]);
  const previewReset = async () => { setBusy('preview'); setError(''); try { setResetPreview(await platformsApiService.previewDataReset(platformId)); } catch (e: any) { setError(e?.getUserMessage?.() || e?.message || '清理预览失败'); } finally { setBusy(''); } };
  const executeReset = async () => { if (!resetPreview) return; setBusy('reset'); setError(''); try { const queued = await platformsApiService.executeDataReset(platformId, resetPreview); const jobId = String(queued.job_id); setNotice('清理任务已进入队列。'); for (let i = 0; i < 240; i += 1) { await new Promise(resolve => window.setTimeout(resolve, 1000)); const job = await platformsApiService.getDataResetStatus(platformId, jobId); setNotice(`清理任务：${job.status}（${job.progress}%）`); if (job.status === 'completed') { setNotice('北京时间 2026-09-04 00:00:00 之前的历史数据已完成备份和清理。'); setResetPreview(null); setConfirmation(''); return; } if (job.status === 'failed') throw new Error(job.error || '清理任务失败'); } throw new Error('清理仍在后台运行，请稍后刷新查看'); } catch (e: any) { setError(e?.getUserMessage?.() || e?.message || '清理失败'); } finally { setBusy(''); } };
  const previewRecovery = async () => { setBusy('recovery-preview'); setError(''); try { const result = await replyMonitorApi.previewMediaRecovery(platformId); setRecoveryTargets(result.targets); } catch (e: any) { setError(e?.getUserMessage?.() || e?.message || '恢复预览失败'); } finally { setBusy(''); } };
  const startRecovery = async () => { if (!recoveryTargets?.length) return; setBusy('recovery-start'); setError(''); try { const result = await replyMonitorApi.startMediaRecovery(platformId, recoveryTargets.map(item => item.event_id)); setRecoveryJob(await replyMonitorApi.getMediaRecoveryJob(result.job_id)); setNotice('手机历史图片恢复已进入维护模式；候选图片必须人工确认。'); } catch (e: any) { setError(e?.getUserMessage?.() || e?.message || '恢复任务启动失败'); } finally { setBusy(''); } };
  const refreshRecovery = useCallback(async () => { if (!recoveryJob?.job_id) return; setRecoveryJob(await replyMonitorApi.getMediaRecoveryJob(recoveryJob.job_id)); }, [recoveryJob?.job_id]);
  useEffect(() => { if (!recoveryJob || ['completed', 'cancelled', 'failed'].includes(recoveryJob.status)) return undefined; const timer = window.setInterval(() => void refreshRecovery(), 2000); return () => window.clearInterval(timer); }, [recoveryJob, refreshRecovery]);
  const decideCandidate = async (candidateId: string, decision: 'confirm' | 'reject') => { setBusy(candidateId); try { await replyMonitorApi.decideMediaRecoveryCandidate(candidateId, decision); await refreshRecovery(); } catch (e: any) { setError(e?.getUserMessage?.() || e?.message || '候选图片处理失败'); } finally { setBusy(''); } };

  return <div className="w-full space-y-5 overflow-y-auto p-6">
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-start justify-between gap-3"><div><h3 className="flex items-center gap-2 font-semibold"><Smartphone size={18} className="text-teal-500" />WorkTool 多手机通道</h3><p className="mt-1 text-xs text-gray-500">保存草稿 → 测试设备 → 启用。只有启用设备的消息进入统计。</p></div><button onClick={() => void load()} className="rounded p-2 text-gray-500 hover:bg-gray-100" title="刷新"><RefreshCw size={16} /></button></div>
      <div className={`mt-4 rounded-lg px-3 py-2 text-sm ${status?.severity === 'critical' ? 'bg-red-50 text-red-700' : status?.severity === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>通路状态：{status?.state || '读取中'} · 配置版本 {status?.version ?? 0} {status?.cutover_at ? `· 统计起点 ${new Date(status.cutover_at).toLocaleString()}` : ''}</div>
      <div className="mt-4 grid gap-4 md:grid-cols-2"><label className="text-sm">网关地址<input value={gatewayUrl} onChange={e => setGatewayUrl(e.target.value)} placeholder="http://worktool-gateway:8790" className="mt-1 w-full rounded border p-2 font-mono text-sm dark:bg-gray-900" /></label><label className="text-sm">离线告警阈值（秒）<input type="number" min={20} max={3600} value={offlineThreshold} onChange={e => setOfflineThreshold(Number(e.target.value))} className="mt-1 w-full rounded border p-2 text-sm dark:bg-gray-900" /></label></div>
      <div className="mt-5 space-y-3">{devices.map((device, index) => { const live: any = onlineByRobot.get(device.robot_id); return <div key={`${device.robot_id}-${index}`} className="rounded-lg border p-4 dark:border-gray-700"><div className="mb-3 flex items-center justify-between"><strong className="text-sm">设备 {index + 1}</strong><div className="flex items-center gap-3"><span className={`text-xs ${live?.online ? 'text-emerald-600' : 'text-red-500'}`}>{live?.online ? '在线' : '离线/未测试'}</span><button onClick={() => setDevices(items => items.filter((_, i) => i !== index))} disabled={devices.length === 1} className="text-red-500 disabled:opacity-30"><Trash2 size={16} /></button></div></div><div className="grid gap-3 md:grid-cols-2"><input value={device.name} onChange={e => updateDevice(index, { name: e.target.value })} placeholder="设备名称" className="rounded border p-2 text-sm dark:bg-gray-900" /><input value={device.robot_id} onChange={e => updateDevice(index, { robot_id: e.target.value.trim() })} placeholder="robot_id" className="rounded border p-2 font-mono text-sm dark:bg-gray-900" /><select value={device.device_mode} onChange={e => updateDevice(index, { device_mode: e.target.value === "robot" ? "robot" : "staff", bound_staff_id: "", identity_confirmed: false })} className="rounded border p-2 text-sm dark:bg-gray-900"><option value="robot">机器人账号（不占座席）</option><option value="staff">人工客服账号</option></select>{device.device_mode === "staff" && <select value={device.bound_staff_id} onChange={e => updateDevice(index, { bound_staff_id: e.target.value })} className="rounded border p-2 text-sm dark:bg-gray-900"><option value="">选择绑定客服</option>{staff.filter(s => s.wecom_userid).map(s => <option key={s.id} value={s.id}>{s.nickname || s.name || s.username} · {s.wecom_userid}</option>)}</select>}<input type="password" value={device.secret || ''} onChange={e => updateDevice(index, { secret: e.target.value })} placeholder={device.secret_set ? `已配置 ····${device.secret_last4}（留空保持）` : '独立设备密钥（至少24字符）'} className="rounded border p-2 font-mono text-sm dark:bg-gray-900" /></div><label className="mt-3 flex items-center gap-2 text-xs"><input type="checkbox" checked={device.enabled} onChange={e => updateDevice(index, { enabled: e.target.checked })} />启用此设备</label></div>; })}<button onClick={() => setDevices(items => [...items, blankDevice()])} className="flex items-center gap-1 text-sm text-teal-600"><Plus size={15} />添加手机</button></div>
      {!!status?.devices?.length && <div className="mt-4 overflow-x-auto rounded-lg border dark:border-gray-700"><table className="w-full text-left text-xs"><thead className="bg-gray-50 dark:bg-gray-900"><tr><th className="p-2">设备</th><th className="p-2">最近心跳</th><th className="p-2">最后上行</th><th className="p-2">发送队列</th><th className="p-2">媒体队列</th><th className="p-2">最后图片</th><th className="p-2">采集来源</th><th className="p-2">最近错误</th></tr></thead><tbody>{status.devices.map((device) => <tr key={device.robot_id} className="border-t dark:border-gray-700"><td className="p-2 font-mono">{device.name || device.robot_id}</td><td className="p-2">{device.last_seen ? new Date(Number(device.last_seen) * 1000).toLocaleString() : '—'}</td><td className="p-2">{device.last_message_at ? new Date(Number(device.last_message_at) * 1000).toLocaleString() : '—'}</td><td className="p-2">{device.pending_sends ?? 0}</td><td className="p-2">{device.pending_media_uploads ?? 0}</td><td className="p-2">{device.last_media_upload_at ? new Date(Number(device.last_media_upload_at) * 1000).toLocaleString() : '—'}</td><td className="p-2">{device.last_capture_source || device.capture_mode || '—'}</td><td className="p-2 text-red-600">{device.last_error || '—'}</td></tr>)}</tbody></table></div>}
      <label className="mt-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={devices.filter(d => d.enabled).every(d => Boolean(d.identity_confirmed))} onChange={e => setDevices(items => items.map(item => item.enabled ? { ...item, identity_confirmed: e.target.checked } : item))} />已在手机逐台确认：真实登录账号与设备身份一致</label>
      {error && <div className="mt-4 rounded bg-red-50 p-3 text-sm text-red-700">{error}</div>}{notice && <div className="mt-4 rounded bg-blue-50 p-3 text-sm text-blue-700">{notice}</div>}
      <div className="mt-5 flex flex-wrap gap-2"><button onClick={() => void save()} disabled={!!busy} className="rounded bg-slate-700 px-4 py-2 text-sm text-white disabled:opacity-50">保存草稿</button><button onClick={() => void runAction('test')} disabled={!!busy} className="rounded bg-amber-500 px-4 py-2 text-sm text-white disabled:opacity-50">测试设备</button><button onClick={() => void runAction('activate')} disabled={!!busy} className="rounded bg-teal-600 px-4 py-2 text-sm text-white disabled:opacity-50"><ShieldCheck size={15} className="mr-1 inline" />启用配置</button></div>
    </section>
    <section className="rounded-xl border border-amber-200 bg-white p-5 dark:border-amber-900 dark:bg-gray-800">
      <h3 className="flex items-center gap-2 font-semibold text-amber-700"><RefreshCw size={18} />历史图片恢复</h3>
      <p className="mt-1 text-xs text-gray-500">只扫描清理后仍保留且没有媒体文件的图片事件。恢复时暂停手机主动操作；匹配不唯一不会生成候选。</p>
      {!recoveryTargets && <button onClick={() => void previewRecovery()} disabled={!!busy} className="mt-4 rounded border border-amber-300 px-4 py-2 text-sm text-amber-700 disabled:opacity-50">生成只读恢复清单</button>}
      {recoveryTargets && !recoveryJob && <div className="mt-4 space-y-3"><p className="text-sm">待恢复 {recoveryTargets.length} 张；请确认手机处于无人操作的维护窗口。</p><div className="max-h-40 overflow-y-auto rounded border text-xs">{recoveryTargets.map(item => <div key={item.event_id} className="border-b p-2 last:border-0"><strong>{item.conversation_name}</strong> · {new Date(item.occurred_at).toLocaleString()} · {item.sender_name}<span className="block text-gray-400">前文：{item.previous_text || '无'}｜后文：{item.next_text || '无'}</span></div>)}</div><button onClick={() => void startRecovery()} disabled={!recoveryTargets.length || !!busy} className="rounded bg-amber-600 px-4 py-2 text-sm text-white disabled:opacity-50">显式启动恢复</button></div>}
      {recoveryJob && <div className="mt-4 space-y-3"><div className="flex flex-wrap items-center gap-3 text-sm"><span>状态：{recoveryJob.status}（{recoveryJob.progress}%）· 候选 {recoveryJob.candidate_count}</span>{!['completed', 'cancelled', 'failed'].includes(recoveryJob.status) && <button onClick={() => void replyMonitorApi.cancelMediaRecovery(recoveryJob.job_id).then(refreshRecovery)} className="rounded border border-red-300 px-3 py-1 text-red-600">取消</button>}<button onClick={() => void refreshRecovery()} className="rounded border px-3 py-1">刷新</button></div>{recoveryJob.error && <p className="text-sm text-red-600">{recoveryJob.error}</p>}{recoveryJob.result_message && <p className={`rounded p-3 text-sm ${recoveryJob.candidate_count ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>{recoveryJob.result_message}</p>}<div className="flex flex-wrap gap-4">{recoveryJob.candidates.map(candidate => <div key={candidate.candidate_id} className="rounded border p-3"><RecoveryCandidateImage candidate={candidate} /><p className="mt-2 max-w-32 truncate text-xs" title={candidate.message_id}>{candidate.capture_source}</p>{candidate.status === 'pending' ? <div className="mt-2 flex gap-2"><button disabled={!!busy} onClick={() => void decideCandidate(candidate.candidate_id, 'confirm')} className="rounded bg-emerald-600 px-2 py-1 text-xs text-white">确认关联</button><button disabled={!!busy} onClick={() => void decideCandidate(candidate.candidate_id, 'reject')} className="rounded border border-red-300 px-2 py-1 text-xs text-red-600">拒绝</button></div> : <p className="mt-2 text-xs text-gray-500">{candidate.status}</p>}</div>)}</div></div>}
    </section>
    <section className="rounded-xl border border-red-200 bg-white p-5 dark:border-red-900 dark:bg-gray-800"><h3 className="flex items-center gap-2 font-semibold text-red-700"><AlertTriangle size={18} />截止时间历史数据清理</h3><p className="mt-1 text-xs text-gray-500">固定删除北京时间 2026-09-04 00:00:00 之前的数据；保留等于和晚于截止时间的数据、配置、账号、客服、客户名单与知识库。当前平台：{platformName}</p>{!resetPreview ? <button onClick={() => void previewReset()} disabled={!!busy} className="mt-4 rounded border border-red-300 px-4 py-2 text-sm text-red-700">生成一次性清理预览</button> : <div className="mt-4 space-y-3"><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{Object.entries(resetPreview.counts).map(([key, value]) => <div key={key} className="rounded bg-red-50 p-2 text-xs"><span className="block text-gray-500">{key}</span><strong className="text-base text-red-700">{value}</strong></div>)}</div><div className="text-xs text-gray-500">UTC 截止：{resetPreview.cutoff_utc} · 目标摘要 {resetPreview.target_id_summary.length} 项。执行前会再次校验快照；有变化即拒绝。</div><label className="block text-sm">输入“清理2026/9/4前历史”确认<input value={confirmation} onChange={e => setConfirmation(e.target.value)} className="mt-1 w-full rounded border p-2" /></label><button onClick={() => void executeReset()} disabled={confirmation !== '清理2026/9/4前历史' || !!busy} className="rounded bg-red-600 px-4 py-2 text-sm text-white disabled:opacity-40">备份并按截止时间清理</button></div>}</section>
  </div>;
};
export default WorkToolPlatformConfig;
