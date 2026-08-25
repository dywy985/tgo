import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '@/components/ui/Icon';
import {
  ticketsApiService,
  type TicketRoute,
  type TicketSettings,
} from '@/services/ticketsApi';

interface RouteFormState {
  group_key: string;
  staff_name: string;
  wecom_userid: string;
  priority: number;
}

const EMPTY_ROUTE_FORM: RouteFormState = {
  group_key: '',
  staff_name: '',
  wecom_userid: '',
  priority: 10,
};

const TicketSettingsPage: React.FC = () => {
  const { t } = useTranslation();

  const [settings, setSettings] = useState<TicketSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [categoriesText, setCategoriesText] = useState('');

  const [routes, setRoutes] = useState<TicketRoute[]>([]);
  const [routeForm, setRouteForm] = useState<RouteFormState>(EMPTY_ROUTE_FORM);
  const [routeError, setRouteError] = useState('');
  const [routeSaving, setRouteSaving] = useState(false);

  const loadSettings = useCallback(async () => {
    try {
      const s = await ticketsApiService.getSettings();
      setSettings(s);
      setCategoriesText((s.categories || []).join(', '));
    } catch {
      /* 忽略 */
    }
  }, []);

  const loadRoutes = useCallback(async () => {
    try {
      setRoutes(await ticketsApiService.listRoutes());
    } catch {
      /* 忽略 */
    }
  }, []);

  useEffect(() => {
    loadSettings();
    loadRoutes();
  }, [loadSettings, loadRoutes]);

  const set = <K extends keyof TicketSettings>(key: K, value: TicketSettings[K]) => {
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const handleSaveSettings = async () => {
    if (!settings) return;
    setSaving(true);
    setSavedMsg('');
    try {
      const categories = categoriesText
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);
      const updated = await ticketsApiService.updateSettings({
        ...settings,
        categories,
      });
      setSettings(updated);
      setCategoriesText((updated.categories || []).join(', '));
      setSavedMsg('已保存');
      setTimeout(() => setSavedMsg(''), 2000);
    } catch (err) {
      setSavedMsg(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleAddRoute = async () => {
    setRouteError('');
    if (!routeForm.staff_name.trim()) {
      setRouteError('请填写客服姓名');
      return;
    }
    setRouteSaving(true);
    try {
      await ticketsApiService.createRoute({
        group_key: routeForm.group_key.trim() || undefined,
        staff_name: routeForm.staff_name.trim(),
        wecom_userid: routeForm.wecom_userid.trim() || undefined,
        priority: routeForm.priority,
      });
      setRouteForm(EMPTY_ROUTE_FORM);
      loadRoutes();
    } catch (err) {
      setRouteError(err instanceof Error ? err.message : '添加失败');
    } finally {
      setRouteSaving(false);
    }
  };

  const handleDeleteRoute = async (route: TicketRoute) => {
    if (!window.confirm(`确认删除路由：${route.staff_name}${route.group_key ? `（${route.group_key}）` : '（默认）'}？`)) return;
    try {
      await ticketsApiService.deleteRoute(route.id);
      loadRoutes();
    } catch (err) {
      setRouteError(err instanceof Error ? err.message : '删除失败');
    }
  };

  const inputCls =
    'px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 w-full';
  const labelCls = 'block text-xs text-gray-500 dark:text-gray-400 mb-1';
  const sectionCls = 'bg-white dark:bg-gray-800 rounded-xl shadow-sm p-5';

  return (
    <div className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400">
            <Icon name="Settings2" size={20} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">
              {t('ticket.settings.title', '工单设置')}
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">SLA / 建单策略 / 提醒 / 分类 / 客服路由</p>
          </div>
        </div>

        {/* SLA 与归档 */}
        {settings && (
          <div className={sectionCls}>
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4">SLA 与归档</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>未响应超时（分钟）</label>
                <input
                  type="number"
                  min={1}
                  value={settings.sla_timeout_minutes}
                  onChange={(e) => set('sla_timeout_minutes', Number(e.target.value))}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>已解决自动归档（小时，0=手动）</label>
                <input
                  type="number"
                  min={0}
                  value={settings.auto_archive_hours}
                  onChange={(e) => set('auto_archive_hours', Number(e.target.value))}
                  className={inputCls}
                />
              </div>
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={settings.auto_archive_enabled}
                    onChange={(e) => set('auto_archive_enabled', e.target.checked)}
                  />
                  启用自动归档
                </label>
              </div>
            </div>
          </div>
        )}

        {/* 建单策略 */}
        {settings && (
          <div className={sectionCls}>
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4">建单策略（结果驱动，非白名单）</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                { key: 'create_ticket_on_unresolved', label: 'AI 判定未解决即建单' },
                { key: 'create_ticket_on_handoff', label: '转人工即建单' },
                { key: 'create_ticket_on_negative', label: '负面情绪/投诉即建单' },
                { key: 'ignore_ack_words', label: '排除纯应答词/表情（防噪音）' },
              ].map((item) => (
                <label
                  key={item.key}
                  className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"
                >
                  <input
                    type="checkbox"
                    checked={Boolean(settings[item.key as keyof TicketSettings])}
                    onChange={(e) => set(item.key as keyof TicketSettings, e.target.checked)}
                  />
                  {item.label}
                </label>
              ))}
            </div>
          </div>
        )}

        {/* 提醒 */}
        {settings && (
          <div className={sectionCls}>
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4">提醒</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={settings.reminder_enabled}
                  onChange={(e) => set('reminder_enabled', e.target.checked)}
                />
                提醒总开关
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={settings.urgent_notify_all}
                  onChange={(e) => set('urgent_notify_all', e.target.checked)}
                />
                urgent 通知全部坐席
              </label>
              <div>
                <label className={labelCls}>AI 回复后无追问自动解决（分钟）</label>
                <input
                  type="number"
                  min={1}
                  value={settings.auto_resolve_minutes}
                  onChange={(e) => set('auto_resolve_minutes', Number(e.target.value))}
                  className={inputCls}
                />
              </div>
            </div>
          </div>
        )}

        {/* 分类 */}
        {settings && (
          <div className={sectionCls}>
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4">客服分类</h2>
            <input
              value={categoriesText}
              onChange={(e) => setCategoriesText(e.target.value)}
              placeholder="逗号分隔，如：K6客服, K8客服, K9客服, 其他"
              className={inputCls}
            />
            <p className="text-xs text-gray-400 mt-1">工单列表的"分类"筛选与统计分组依据</p>
          </div>
        )}

        {/* 客服路由 */}
        <div className={sectionCls}>
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1">客服路由（群 → 客服个人）</h2>
          <p className="text-xs text-gray-400 mb-4">
            工单产生时按群匹配负责客服，用于归属分类与企微提醒推送。群标识留空 = 该平台/项目默认路由。
          </p>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-3">
            <div>
              <label className={labelCls}>群标识（chatid）</label>
              <input
                value={routeForm.group_key}
                onChange={(e) => setRouteForm({ ...routeForm, group_key: e.target.value })}
                placeholder="留空=默认"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>客服姓名</label>
              <input
                value={routeForm.staff_name}
                onChange={(e) => setRouteForm({ ...routeForm, staff_name: e.target.value })}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>企微 userid</label>
              <input
                value={routeForm.wecom_userid}
                onChange={(e) => setRouteForm({ ...routeForm, wecom_userid: e.target.value })}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>优先级</label>
              <input
                type="number"
                min={1}
                max={100}
                value={routeForm.priority}
                onChange={(e) => setRouteForm({ ...routeForm, priority: Number(e.target.value) })}
                className={inputCls}
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={handleAddRoute}
                disabled={routeSaving}
                className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg w-full disabled:opacity-50"
              >
                添加路由
              </button>
            </div>
          </div>

          {routeError && <p className="text-xs text-red-500 mb-2">{routeError}</p>}

          <table className="w-full text-sm">
            <thead className="text-gray-400 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left py-2 font-semibold">群标识</th>
                <th className="text-left py-2 font-semibold">客服</th>
                <th className="text-left py-2 font-semibold">企微 userid</th>
                <th className="text-left py-2 font-semibold">优先级</th>
                <th className="text-right py-2 font-semibold">操作</th>
              </tr>
            </thead>
            <tbody>
              {routes.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-gray-400 text-xs">
                    暂无路由，请添加（工单将归属"未分配"）
                  </td>
                </tr>
              ) : (
                routes.map((r) => (
                  <tr key={r.id} className="border-t border-gray-100 dark:border-gray-700">
                    <td className="py-2 font-mono text-xs text-gray-500">{r.group_key || '（默认）'}</td>
                    <td className="py-2 text-gray-800 dark:text-gray-200">{r.staff_name}</td>
                    <td className="py-2 font-mono text-xs text-gray-500">{r.wecom_userid || '—'}</td>
                    <td className="py-2 text-gray-600 dark:text-gray-400">{r.priority}</td>
                    <td className="py-2 text-right">
                      <button
                        onClick={() => handleDeleteRoute(r)}
                        className="text-xs text-red-500 hover:text-red-600"
                      >
                        删除
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* 保存 */}
        {settings && (
          <div className="flex items-center gap-3">
            <button
              onClick={handleSaveSettings}
              disabled={saving}
              className="px-5 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50"
            >
              {saving ? '保存中...' : '保存设置'}
            </button>
            {savedMsg && <span className="text-sm text-gray-600 dark:text-gray-300">{savedMsg}</span>}
          </div>
        )}
      </div>
    </div>
  );
};

export default TicketSettingsPage;
