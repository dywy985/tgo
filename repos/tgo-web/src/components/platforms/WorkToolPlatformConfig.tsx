import React, { useEffect, useState } from 'react';
import { Smartphone } from 'lucide-react';
import { apiClient } from '@/services/api';

interface WorkToolConfig {
  robot_id: string;
  gateway_url: string;
}

/**
 * WorkTool 手机通道配置（自建网关 + 安卓 APK）
 * 存于平台 config.robot_id / config.gateway_url
 */
const WorkToolPlatformConfig: React.FC = () => {
  const [cfg, setCfg] = useState<WorkToolConfig>({ robot_id: '', gateway_url: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiClient.get<{ worktool: WorkToolConfig }>('/v1/debug/wecom/worktool-config')
      .then((d) => setCfg({ ...d.worktool }))
      .catch((e: any) => setError('加载失败: ' + (e?.getUserMessage?.() || e?.message || e)))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    setError('');
    try {
      await apiClient.put('/v1/debug/wecom/worktool-config', { worktool: cfg });
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
        <Smartphone className="w-4 h-4 text-teal-500" />
        WorkTool 手机通道
      </h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        安卓手机安装自建 APK + 登录企微，消息经自建网关收发（绕过第三方云）。
      </p>

      {loading ? (
        <div className="text-sm text-gray-400">加载中...</div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">
              手机机器码 (robot_id)
            </label>
            <input
              type="text"
              value={cfg.robot_id}
              onChange={(e) => setCfg({ ...cfg, robot_id: e.target.value })}
              placeholder="手机 APP 上显示的机器码，如 d485acb0..."
              className="w-full text-sm p-1.5 border border-gray-300/80 dark:border-gray-600/80 rounded-md bg-white/90 dark:bg-gray-700/50 dark:text-gray-200 font-mono"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              在手机上打开 WorkTool APP → 连接设置 → 复制机器码。
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">
              网关地址 (gateway_url)
            </label>
            <input
              type="text"
              value={cfg.gateway_url}
              onChange={(e) => setCfg({ ...cfg, gateway_url: e.target.value })}
              placeholder="http://172.26.192.1:8790 或 http://127.0.0.1:8790"
              className="w-full text-sm p-1.5 border border-gray-300/80 dark:border-gray-600/80 rounded-md bg-white/90 dark:bg-gray-700/50 dark:text-gray-200 font-mono"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              TGO 服务器访问 WorkTool 网关的地址（开发本机填 http://127.0.0.1:8790）。
            </p>
          </div>

          {error && <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-2 py-1.5 rounded-md">{error}</div>}

          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-1.5 text-sm rounded-md bg-teal-600 dark:bg-teal-500 text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存 WorkTool 配置'}
          </button>
          {saved && <span className="ml-2 text-xs text-teal-600 dark:text-teal-400">✓ 已保存</span>}
        </div>
      )}
    </div>
  );
};

export default WorkToolPlatformConfig;
