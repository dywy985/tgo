import React, { useEffect, useState } from 'react';
import { Bot, Plus, Trash2 } from 'lucide-react';
import { apiClient } from '@/services/api';

interface AibotConfig {
  bot_id: string;
  secret_set: boolean;
  secret?: string;
  bot_name: string;
  default_chatid: string;
  conv_map: Record<string, string>;
}

/**
 * 企业微信机器人（长连接模式）配置
 * 走官方智能机器人 WebSocket 长连接（SDK），区别于群机器人 webhook（API 模式）。
 * 配置经 tgo-api 代理到 Windows 侧发送服务（aibot_send_service），热重连生效。
 */
const WeComBotLongConnConfig: React.FC = () => {
  const [cfg, setCfg] = useState<AibotConfig>({
    bot_id: '', secret_set: false, secret: '', bot_name: '', default_chatid: '', conv_map: {},
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiClient.get<{ aibot: AibotConfig }>('/v1/debug/wecom/aibot-config')
      .then((d) => setCfg({ ...d.aibot, secret: '' }))
      .catch((e: any) => setError('加载失败: ' + (e?.getUserMessage?.() || e?.message || e)))
      .finally(() => setLoading(false));
  }, []);

  const setConv = (idx: number, key: string, val: string) => {
    const entries = Object.entries(cfg.conv_map);
    if (idx >= entries.length) {
      entries.push([key, val]);
    } else {
      entries[idx] = [key, val];
    }
    setCfg({ ...cfg, conv_map: Object.fromEntries(entries.filter(([k]) => k.trim())) });
  };

  const addConv = () => {
    setCfg({ ...cfg, conv_map: { ...cfg.conv_map, '': '' } });
  };

  const removeConv = (idx: number) => {
    const entries = Object.entries(cfg.conv_map);
    entries.splice(idx, 1);
    setCfg({ ...cfg, conv_map: Object.fromEntries(entries) });
  };

  const save = async () => {
    setSaving(true);
    setSaved(false);
    setError('');
    try {
      const payload: Record<string, any> = {
        aibot: {
          bot_id: cfg.bot_id,
          bot_name: cfg.bot_name,
          default_chatid: cfg.default_chatid,
          conv_map: cfg.conv_map,
        },
      };
      if (cfg.secret?.trim()) payload.aibot.secret = cfg.secret.trim();
      await apiClient.put('/v1/debug/wecom/aibot-config', payload);
      setCfg({ ...cfg, secret: '' });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) {
      setError('保存失败: ' + (e?.getUserMessage?.() || e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-md p-5 rounded-lg shadow-sm border border-gray-200/60 dark:border-gray-700/60 w-full">
      <h3 className="text-md font-semibold text-gray-700 dark:text-gray-200 mb-1 flex items-center gap-2">
        <Bot className="w-4 h-4 text-purple-500" />
        企业微信机器人（长连接模式）
      </h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        使用官方智能机器人 WebSocket 长连接主动推送（非 webhook API 模式）。保存后发送服务热重连，约 10-25 秒生效。
      </p>

      {loading ? (
        <div className="text-sm text-gray-400">加载中...</div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">Bot ID</label>
            <input
              type="text"
              value={cfg.bot_id}
              onChange={(e) => setCfg({ ...cfg, bot_id: e.target.value })}
              placeholder="企微后台智能机器人的 Bot ID"
              className="w-full text-sm p-1.5 border border-gray-300/80 dark:border-gray-600/80 rounded-md bg-white/90 dark:bg-gray-700/50 dark:text-gray-200 font-mono"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">
              Secret {cfg.secret_set && <span className="text-xs text-teal-500 ml-1">✓ 已配置（留空则不修改）</span>}
            </label>
            <input
              type="password"
              value={cfg.secret}
              onChange={(e) => setCfg({ ...cfg, secret: e.target.value })}
              placeholder={cfg.secret_set ? '••••••••（留空保持不变）' : '企微后台智能机器人的 Secret'}
              className="w-full text-sm p-1.5 border border-gray-300/80 dark:border-gray-600/80 rounded-md bg-white/90 dark:bg-gray-700/50 dark:text-gray-200 font-mono"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">机器人名称（可选）</label>
            <input
              type="text"
              value={cfg.bot_name}
              onChange={(e) => setCfg({ ...cfg, bot_name: e.target.value })}
              placeholder="如：客服助手"
              className="w-full text-sm p-1.5 border border-gray-300/80 dark:border-gray-600/80 rounded-md bg-white/90 dark:bg-gray-700/50 dark:text-gray-200"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">
              默认群会话 chatid（可选，兜底发送目标）
            </label>
            <input
              type="text"
              value={cfg.default_chatid}
              onChange={(e) => setCfg({ ...cfg, default_chatid: e.target.value })}
              placeholder="wr_ 开头的群会话 ID"
              className="w-full text-sm p-1.5 border border-gray-300/80 dark:border-gray-600/80 rounded-md bg-white/90 dark:bg-gray-700/50 dark:text-gray-200 font-mono"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium text-gray-600 dark:text-gray-300">群会话映射（群标识 → chatid）</label>
              <button onClick={addConv} className="text-xs text-purple-600 dark:text-purple-400 flex items-center gap-1">
                <Plus className="w-3 h-3" /> 添加
              </button>
            </div>
            {Object.entries(cfg.conv_map).map(([k, v], idx) => (
              <div key={idx} className="flex items-center gap-2 mb-1.5">
                <input
                  type="text"
                  value={k}
                  onChange={(e) => setConv(idx, e.target.value, v)}
                  placeholder="群标识（如 R:83785736147799）"
                  className="flex-1 text-sm p-1.5 border border-gray-300/80 dark:border-gray-600/80 rounded-md bg-white/90 dark:bg-gray-700/50 dark:text-gray-200 font-mono"
                />
                <span className="text-gray-400">→</span>
                <input
                  type="text"
                  value={v}
                  onChange={(e) => setConv(idx, k, e.target.value)}
                  placeholder="chatid（wr_ 开头）"
                  className="flex-1 text-sm p-1.5 border border-gray-300/80 dark:border-gray-600/80 rounded-md bg-white/90 dark:bg-gray-700/50 dark:text-gray-200 font-mono"
                />
                <button onClick={() => removeConv(idx)} className="text-red-400 hover:text-red-600">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              将群标识映射到机器人的群会话 chatid，回复才能推送到对应群。群标识格式如 R:xxx（来自消息记录）。
            </p>
          </div>

          {error && <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-2 py-1.5 rounded-md">{error}</div>}

          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-1.5 text-sm rounded-md bg-purple-600 dark:bg-purple-500 text-white hover:bg-purple-700 disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存并重连长连接'}
          </button>
          {saved && <span className="ml-2 text-xs text-teal-600 dark:text-teal-400">✓ 已保存，正在重连</span>}
        </div>
      )}
    </div>
  );
};

export default WeComBotLongConnConfig;
