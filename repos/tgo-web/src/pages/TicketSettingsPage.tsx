import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '@/components/ui/Icon';
import {
  ticketsApiService,
  type TicketFormField,
  type TicketFormFieldType,
  type TicketSettings,
} from '@/services/ticketsApi';

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

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

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
            <p className="text-xs text-gray-500 dark:text-gray-400">SLA / 建单策略 / 提醒 / 分类</p>
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
