import React, { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import platformsApiService, { PlatformConnectionStatus } from '@/services/platformsApi';

type Item = PlatformConnectionStatus & { name: string };

const ConnectionHealthBanner: React.FC = () => {
  const [items, setItems] = useState<Item[]>([]);
  useEffect(() => {
    let mounted = true;
    const poll = async () => {
      try {
        const page = await platformsApiService.listPlatforms({ is_active: true, limit: 100 });
        const managed = page.data.filter(p => p.type === 'worktool' || p.type === 'wecom_bot');
        const results = await Promise.all(managed.map(async p => ({ ...(await platformsApiService.getConnectionStatus(p.id)), name: p.display_name || p.name })));
        if (mounted) setItems(results);
      } catch { /* 页面局部故障不阻塞主界面 */ }
    };
    void poll(); const timer = window.setInterval(poll, 15000);
    return () => { mounted = false; window.clearInterval(timer); };
  }, []);
  const worktool = items.filter(i => i.type === 'worktool' && i.severity === 'critical');
  const bots = items.filter(i => i.type === 'wecom_bot' && i.severity !== 'ok');
  if (!worktool.length && !bots.length) return null;
  const critical = worktool.length > 0;
  return <div role="alert" className={`fixed left-1/2 top-3 z-[70] flex max-w-3xl -translate-x-1/2 items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white shadow-xl ${critical ? 'bg-red-600' : 'bg-amber-500'}`}>
    <AlertTriangle size={18} />{critical ? `消息通路异常：${worktool.map(i => i.name).join('、')} 离线，统计完整性已中断；缺失时段不会显示为零。` : `内部提醒降级：${bots.map(i => i.name).join('、')} 未连接，不影响客服消息统计。`}
  </div>;
};

export default ConnectionHealthBanner;
