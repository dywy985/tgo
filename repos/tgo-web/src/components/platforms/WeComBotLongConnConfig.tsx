import React, { useCallback, useEffect, useState } from 'react';
import { Bot, RefreshCw, ShieldCheck } from 'lucide-react';
import platformsApiService, { PlatformConnectionStatus } from '@/services/platformsApi';

interface Props { platformId: string; }

const WeComBotLongConnConfig: React.FC<Props> = ({ platformId }) => {
  const [botId, setBotId] = useState('');
  const [secret, setSecret] = useState('');
  const [secretSet, setSecretSet] = useState(false);
  const [secretLast4, setSecretLast4] = useState('');
  const [botName, setBotName] = useState('');
  const [wsUrl, setWsUrl] = useState('wss://openws.work.weixin.qq.com');
  const [enabled, setEnabled] = useState(true);
  const [status, setStatus] = useState<PlatformConnectionStatus | null>(null);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const connection = await platformsApiService.getConnectionConfig(platformId);
      const cfg = Object.keys(connection.draft || {}).length ? connection.draft : connection.active;
      setBotId(cfg.bot_id || ''); setBotName(cfg.bot_name || ''); setWsUrl(cfg.ws_url || 'wss://openws.work.weixin.qq.com');
      setEnabled(cfg.enabled !== false); setSecretSet(Boolean(cfg.secret_set)); setSecretLast4(cfg.secret_last4 || ''); setSecret('');
      setStatus(await platformsApiService.getConnectionStatus(platformId));
    } catch (e: any) { setError(e?.getUserMessage?.() || e?.message || '加载失败'); }
  }, [platformId]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const timer = window.setInterval(() => platformsApiService.getConnectionStatus(platformId).then(setStatus).catch(() => undefined), 15000); return () => window.clearInterval(timer); }, [platformId]);

  const save = async () => {
    setBusy('save'); setError(''); setNotice('');
    try { await platformsApiService.saveConnectionDraft(platformId, { bot_id: botId, bot_name: botName, ws_url: wsUrl, enabled, secret }); setNotice('机器人草稿已加密保存，当前连接未受影响。'); await load(); }
    catch (e: any) { setError(e?.getUserMessage?.() || e?.message || '保存失败'); } finally { setBusy(''); }
  };
  const run = async (action: 'test' | 'activate') => {
    setBusy(action); setError(''); setNotice('');
    try {
      if (action === 'test') { await platformsApiService.testConnection(platformId); setNotice('候选连接鉴权、订阅和心跳测试通过；当前连接未中断。'); }
      else { await platformsApiService.activateConnection(platformId); setNotice('新机器人连接已原子启用；机器人仅发送内部提醒，不参与消息统计。'); }
      await load();
    } catch (e: any) { setError(e?.getUserMessage?.() || e?.message || '操作失败'); } finally { setBusy(''); }
  };

  return <div className="w-full overflow-y-auto p-6"><section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
    <div className="flex items-start justify-between"><div><h3 className="flex items-center gap-2 font-semibold"><Bot size={18} className="text-purple-500" />企业微信智能机器人长连接</h3><p className="mt-1 text-xs text-gray-500">只用于按客服企微 UserID 私聊发送内部提醒，不接管客户消息，也不补统计缺口。</p></div><button onClick={() => void load()} className="rounded p-2 text-gray-500 hover:bg-gray-100"><RefreshCw size={16} /></button></div>
    <div className={`mt-4 rounded-lg px-3 py-2 text-sm ${status?.severity === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>连接状态：{status?.state || '读取中'} · 配置版本 {status?.version ?? 0}{status?.reason ? ` · ${status.reason}` : ''}</div>
    <div className="mt-4 grid gap-4 md:grid-cols-2"><label className="text-sm">Bot ID<input value={botId} onChange={e => setBotId(e.target.value.trim())} className="mt-1 w-full rounded border p-2 font-mono text-sm dark:bg-gray-900" /></label><label className="text-sm">机器人名称<input value={botName} onChange={e => setBotName(e.target.value)} className="mt-1 w-full rounded border p-2 text-sm dark:bg-gray-900" /></label><label className="text-sm">Secret<input type="password" value={secret} onChange={e => setSecret(e.target.value)} placeholder={secretSet ? `已配置 ····${secretLast4}（留空保持）` : 'Secret（至少16字符）'} className="mt-1 w-full rounded border p-2 font-mono text-sm dark:bg-gray-900" /></label><label className="text-sm">长连接地址（管理员高级项）<input value={wsUrl} onChange={e => setWsUrl(e.target.value.trim())} className="mt-1 w-full rounded border p-2 font-mono text-sm dark:bg-gray-900" /></label></div>
    <label className="mt-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />启用此机器人</label>
    {error && <div className="mt-4 rounded bg-red-50 p-3 text-sm text-red-700">{error}</div>}{notice && <div className="mt-4 rounded bg-blue-50 p-3 text-sm text-blue-700">{notice}</div>}
    <div className="mt-5 flex gap-2"><button disabled={!!busy} onClick={() => void save()} className="rounded bg-slate-700 px-4 py-2 text-sm text-white disabled:opacity-50">保存草稿</button><button disabled={!!busy} onClick={() => void run('test')} className="rounded bg-amber-500 px-4 py-2 text-sm text-white disabled:opacity-50">测试连接</button><button disabled={!!busy} onClick={() => void run('activate')} className="rounded bg-purple-600 px-4 py-2 text-sm text-white disabled:opacity-50"><ShieldCheck size={15} className="mr-1 inline" />启用连接</button></div>
  </section></div>;
};

export default WeComBotLongConnConfig;
