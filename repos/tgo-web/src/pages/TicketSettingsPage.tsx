import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '@/components/ui/Icon';
import {
  ticketsApiService,
  type TicketFormField,
  type TicketFormFieldType,
  type TicketRoute,
  type TicketSettings,
} from '@/services/ticketsApi';
import { visitorApiService, type VisitorResponse } from '@/services/visitorApi';

interface RouteFormState {
  group_key: string;
  visitor_key: string;
  visitor_name: string;
  staff_name: string;
  wecom_userid: string;
  priority: number;
}

const EMPTY_ROUTE_FORM: RouteFormState = {
  group_key: '',
  visitor_key: '',
  visitor_name: '',
  staff_name: '',
  wecom_userid: '',
  priority: 10,
};

const BUILTIN_FIELD_KEYS = ['title', 'description', 'category', 'priority', 'assignee_id', 'visitor_id', 'group_key'];

const FIELD_TYPE_OPTIONS: Array<{ value: TicketFormFieldType; label: string }> = [
  { value: 'text', label: '文本' },
  { value: 'textarea', label: '多行文本' },
  { value: 'select', label: '下拉选择' },
  { value: 'multi_select', label: '多选' },
  { value: 'number', label: '数字' },
  { value: 'date', label: '日期' },
  { value: 'boolean', label: '布尔' },
];

const AUTO_FILL_PRESETS = [
  { value: '', label: '不自动填写' },
  { value: 'ai_fields.title', label: 'AI 提取标题' },
  { value: 'ai_fields.description', label: 'AI 提取描述' },
  { value: 'ai_fields.category', label: 'AI 判定分类' },
  { value: 'ai_fields.priority', label: 'AI 判定优先级' },
  { value: 'ai_fields.group_key', label: '群标识' },
  { value: 'visitor.name', label: '访客姓名' },
  { value: 'visitor.nickname', label: '访客昵称' },
  { value: 'visitor.phone_number', label: '访客手机号' },
  { value: 'visitor.email', label: '访客邮箱' },
  { value: 'visitor.company', label: '访客公司' },
  { value: 'visitor.job_title', label: '访客职位' },
  { value: 'visitor.custom_attributes.', label: '访客自定义属性（需补key）' },
  { value: 'session.created_at', label: '会话时间' },
  { value: 'session.message_count', label: '会话消息数' },
  { value: 'platform.type', label: '渠道类型' },
  { value: 'platform.name', label: '渠道名称' },
  { value: 'last_ticket.category', label: '上次工单分类' },
];

const TicketSettingsPage: React.FC = () => {
  const { t } = useTranslation();

  const [settings, setSettings] = useState<TicketSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [categoriesText, setCategoriesText] = useState('');

  // 表单模板（本地编辑）
  const [formSchema, setFormSchema] = useState<TicketFormField[]>([]);
  // 分级 SLA（本地编辑）
  const [slaByPriority, setSlaByPriority] = useState<Record<string, number>>({
    low: 1440,
    normal: 15,
    high: 60,
    urgent: 30,
  });
  // 工单号格式
  const [numberFormat, setNumberFormat] = useState<{ prefix: string; date: boolean; seq_digits: number }>({
    prefix: 'TK-',
    date: true,
    seq_digits: 4,
  });

  const [routes, setRoutes] = useState<TicketRoute[]>([]);
  const [routeForm, setRouteForm] = useState<RouteFormState>(EMPTY_ROUTE_FORM);
  const [routeError, setRouteError] = useState('');
  const [routeSaving, setRouteSaving] = useState(false);
  const [visitorResults, setVisitorResults] = useState<VisitorResponse[]>([]);
  const [visitorSearching, setVisitorSearching] = useState(false);

  const loadSettings = useCallback(async () => {
    try {
      const s = await ticketsApiService.getSettings();
      setSettings(s);
      setCategoriesText((s.categories || []).join(', '));
      setFormSchema(s.form_schema || []);
      setSlaByPriority(s.sla_by_priority || { low: 1440, normal: 15, high: 60, urgent: 30 });
      setNumberFormat(s.number_format || { prefix: 'TK-', date: true, seq_digits: 4 });
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

  // ---- 表单模板编辑 ----
  const updateField = (index: number, patchData: Partial<TicketFormField>) => {
    setFormSchema((prev) => prev.map((f, i) => (i === index ? { ...f, ...patchData } : f)));
  };

  const addField = () => {
    const key = `custom_${Date.now().toString(36)}`;
    setFormSchema((prev) => [
      ...prev,
      {
        key,
        label: '新字段',
        type: 'text',
        required: false,
        editable: true,
        options: [],
        auto_fill: null,
      },
    ]);
  };

  const removeField = (index: number) => {
    setFormSchema((prev) => prev.filter((_, i) => i !== index));
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
      // 校验表单模板：内置字段 key 不可重复，自定义字段 key 不能为空
      const keys = formSchema.map((f) => f.key);
      if (new Set(keys).size !== keys.length) {
        setSavedMsg('表单模板存在重复字段 key');
        setSaving(false);
        return;
      }
      if (formSchema.some((f) => !f.key || !f.label)) {
        setSavedMsg('字段 key 与 label 均不能为空');
        setSaving(false);
        return;
      }
      // 分级 SLA：normal 同步回单一值（向后兼容）
      const updated = await ticketsApiService.updateSettings({
        ...settings,
        categories,
        form_schema: formSchema,
        sla_by_priority: slaByPriority,
        sla_timeout_minutes: Number(slaByPriority.normal) || settings.sla_timeout_minutes,
        number_format: numberFormat,
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
        visitor_key: routeForm.visitor_key.trim() || undefined,
        staff_name: routeForm.staff_name.trim(),
        wecom_userid: routeForm.wecom_userid.trim() || undefined,
        priority: routeForm.priority,
      });
      setRouteForm(EMPTY_ROUTE_FORM);
      setVisitorResults([]);
      loadRoutes();
    } catch (err) {
      setRouteError(err instanceof Error ? err.message : '添加失败');
    } finally {
      setRouteSaving(false);
    }
  };

  const handleSearchVisitors = async (kw: string) => {
    if (!kw.trim()) {
      setVisitorResults([]);
      return;
    }
    setVisitorSearching(true);
    try {
      const resp = await visitorApiService.listVisitors({ search: kw.trim(), limit: 8 });
      setVisitorResults(resp.data || []);
    } catch {
      setVisitorResults([]);
    } finally {
      setVisitorSearching(false);
    }
  };

  const handlePickVisitor = (v: VisitorResponse) => {
    setRouteForm((prev) => ({
      ...prev,
      visitor_key: v.platform_open_id || '',
      visitor_name: v.nickname || v.display_nickname || v.name || v.platform_open_id || '',
    }));
    setVisitorResults([]);
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
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              {(['urgent', 'high', 'normal', 'low'] as const).map((p) => (
                <div key={p}>
                  <label className={labelCls}>
                    {p === 'urgent' ? '紧急' : p === 'high' ? '高' : p === 'normal' ? '普通' : '低'}（分钟）
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={slaByPriority[p] ?? 15}
                    onChange={(e) =>
                      setSlaByPriority((prev) => ({ ...prev, [p]: Number(e.target.value) }))
                    }
                    className={inputCls}
                  />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
              <div>
                <label className={labelCls}>工单号格式</label>
                <div className="flex items-center gap-2">
                  <input
                    value={numberFormat.prefix}
                    onChange={(e) => setNumberFormat((prev) => ({ ...prev, prefix: e.target.value }))}
                    placeholder="TK-"
                    className={`${inputCls} w-24`}
                  />
                  <select
                    value={numberFormat.date ? 'date' : 'seq'}
                    onChange={(e) =>
                      setNumberFormat((prev) => ({ ...prev, date: e.target.value === 'date' }))
                    }
                    className={`${inputCls} w-28`}
                  >
                    <option value="date">含日期</option>
                    <option value="seq">纯序号</option>
                  </select>
                  <input
                    type="number"
                    min={1}
                    max={8}
                    value={numberFormat.seq_digits}
                    onChange={(e) =>
                      setNumberFormat((prev) => ({ ...prev, seq_digits: Number(e.target.value) }))
                    }
                    className={`${inputCls} w-20`}
                  />
                </div>
                <p className="text-[10px] text-gray-400 mt-1">
                  如 {numberFormat.prefix}{numberFormat.date ? '20260828-' : ''}{'0001'}
                </p>
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
                { key: 'scope_degrade_to_same_group', label: '路由客服不在线时降级给同群其他客服' },
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

        {/* 表单模板 */}
        <div className={sectionCls}>
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">表单模板（工单字段配置）</h2>
            <button
              onClick={addField}
              className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
            >
              + 添加字段
            </button>
          </div>
          <p className="text-xs text-gray-400 mb-4">
            定义工单表单的字段：内置字段 key 固定不可删（title/description/category/priority/assignee/visitor/group_key），
            自定义字段可增删。auto_fill 决定该字段自动填写的来源；editable=false 的字段在工单上只读。
          </p>

          <div className="space-y-3">
            {formSchema.length === 0 && (
              <p className="text-xs text-gray-400">暂无字段，点击"添加字段"创建</p>
            )}
            {formSchema.map((f, idx) => {
              const isBuiltin = BUILTIN_FIELD_KEYS.includes(f.key);
              const optionsText = Array.isArray(f.options) ? f.options.join(', ') : '';
              return (
                <div
                  key={`${f.key}-${idx}`}
                  className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 grid grid-cols-2 md:grid-cols-4 gap-3 items-start"
                >
                  <div>
                    <label className={labelCls}>字段 key{isBuiltin ? '（内置）' : ''}</label>
                    <input
                      value={f.key}
                      disabled={isBuiltin}
                      onChange={(e) => updateField(idx, { key: e.target.value })}
                      className={`${inputCls} font-mono text-xs`}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>显示名</label>
                    <input
                      value={f.label}
                      onChange={(e) => updateField(idx, { label: e.target.value })}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>类型</label>
                    <select
                      value={f.type}
                      onChange={(e) => updateField(idx, { type: e.target.value as TicketFormFieldType })}
                      className={inputCls}
                    >
                      {FIELD_TYPE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-3 pt-5">
                    <label className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300">
                      <input
                        type="checkbox"
                        checked={Boolean(f.required)}
                        onChange={(e) => updateField(idx, { required: e.target.checked })}
                      />
                      必填
                    </label>
                    <label className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300">
                      <input
                        type="checkbox"
                        checked={f.editable !== false}
                        onChange={(e) => updateField(idx, { editable: e.target.checked })}
                      />
                      可编辑
                    </label>
                    {!isBuiltin && (
                      <button
                        onClick={() => removeField(idx)}
                        className="text-xs text-red-500 hover:text-red-600"
                      >
                        删除
                      </button>
                    )}
                  </div>
                  {(f.type === 'select' || f.type === 'multi_select') && (
                    <div className="col-span-2">
                      <label className={labelCls}>选项（逗号分隔）</label>
                      <input
                        value={optionsText}
                        onChange={(e) =>
                          updateField(idx, {
                            options: e.target.value
                              .split(',')
                              .map((s) => s.trim())
                              .filter(Boolean),
                          })
                        }
                        placeholder="选项A, 选项B"
                        className={inputCls}
                      />
                    </div>
                  )}
                  <div className="col-span-2">
                    <label className={labelCls}>自动填写（auto_fill）</label>
                    <div className="flex gap-2">
                      <select
                        value={f.auto_fill?.source || ''}
                        onChange={(e) =>
                          updateField(idx, {
                            auto_fill: e.target.value
                              ? { source: e.target.value, fallback: f.auto_fill?.fallback }
                              : null,
                          })
                        }
                        className={inputCls}
                      >
                        {AUTO_FILL_PRESETS.map((p) => (
                          <option key={p.value} value={p.value}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                      <input
                        value={f.auto_fill?.fallback || ''}
                        onChange={(e) =>
                          updateField(idx, {
                            auto_fill: {
                              source: f.auto_fill?.source || '',
                              fallback: e.target.value,
                            },
                          })
                        }
                        placeholder="兜底值"
                        className={`${inputCls} w-32`}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 客服路由 */}
        <div className={sectionCls}>
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1">客服路由（客户/群 → 客服个人）</h2>
          <p className="text-xs text-gray-400 mb-4">
            工单产生与转人工时按「特定客户 &gt; 群 &gt; 平台默认」匹配负责客服：命中且客服在线 → 直接分配；客服不在线 → 记录工单等待，其上线后提醒。群标识留空 = 该平台/项目默认路由。
          </p>

          <div className="grid grid-cols-1 md:grid-cols-6 gap-3 mb-3">
            <div className="md:col-span-2">
              <label className={labelCls}>特定客户（访客选择或手填 external_userid）</label>
              <input
                value={routeForm.visitor_key}
                onChange={(e) => {
                  setRouteForm({ ...routeForm, visitor_key: e.target.value, visitor_name: '' });
                  handleSearchVisitors(e.target.value);
                }}
                placeholder="留空=群/默认匹配"
                className={inputCls}
              />
              {routeForm.visitor_name && (
                <p className="text-[11px] text-blue-600 dark:text-blue-400 mt-0.5">已选访客：{routeForm.visitor_name}</p>
              )}
              {visitorResults.length > 0 && (
                <ul className="mt-1 max-h-36 overflow-y-auto border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-xs shadow">
                  {visitorResults.map((v) => (
                    <li key={v.id}>
                      <button
                        type="button"
                        onClick={() => handlePickVisitor(v)}
                        className="w-full text-left px-2 py-1.5 hover:bg-blue-50 dark:hover:bg-gray-700 flex justify-between gap-2"
                      >
                        <span className="truncate">{v.nickname || v.display_nickname || v.name || '未命名访客'}</span>
                        <span className="font-mono text-gray-400 truncate">{v.platform_open_id}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {visitorSearching && <p className="text-[11px] text-gray-400 mt-0.5">搜索中…</p>}
            </div>
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
                <th className="text-left py-2 font-semibold">匹配范围</th>
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
                    <td className="py-2 font-mono text-xs text-gray-500">
                      {r.visitor_key ? `客户:${r.visitor_key}` : r.group_key ? `群:${r.group_key}` : '（默认）'}
                    </td>
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
