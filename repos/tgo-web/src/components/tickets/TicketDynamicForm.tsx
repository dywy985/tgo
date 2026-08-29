/**
 * TicketDynamicForm — 按 form_schema 渲染的工单动态表单
 * 详情页编辑 / 手动建单弹窗共用
 */
import React from 'react';
import type { TicketFormField } from '@/services/ticketsApi';

export interface DynamicFormValues {
  [key: string]: unknown;
}

interface Props {
  fields: TicketFormField[];
  values: DynamicFormValues;
  onChange: (key: string, value: unknown) => void;
  readOnly?: boolean;
}

const inputCls =
  'w-full px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 disabled:opacity-60';
const labelCls = 'block text-xs text-gray-500 dark:text-gray-400 mb-1';

const TicketDynamicForm: React.FC<Props> = ({ fields, values, onChange, readOnly }) => {
  return (
    <div className="space-y-4">
      {fields.map((f) => {
        const key = f.key;
        const val = values[key];
        const disabled = readOnly || f.editable === false;
        const isCustom = !['title', 'description', 'category', 'priority', 'assignee_id', 'visitor_id', 'group_key'].includes(key);

        let control: React.ReactNode = null;
        switch (f.type) {
          case 'textarea':
            control = (
              <textarea
                value={String(val ?? '')}
                disabled={disabled}
                onChange={(e) => onChange(key, e.target.value)}
                placeholder={f.placeholder}
                rows={4}
                className={`${inputCls} resize-y`}
              />
            );
            break;
          case 'select':
            control = (
              <select
                value={String(val ?? '')}
                disabled={disabled}
                onChange={(e) => onChange(key, e.target.value)}
                className={inputCls}
              >
                <option value="">请选择</option>
                {(f.options || []).map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            );
            break;
          case 'multi_select': {
            const arr = Array.isArray(val) ? (val as string[]) : [];
            control = (
              <div className="flex flex-wrap gap-2">
                {(f.options || []).map((opt) => (
                  <label key={opt} className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300">
                    <input
                      type="checkbox"
                      disabled={disabled}
                      checked={arr.includes(opt)}
                      onChange={(e) => {
                        const next = e.target.checked ? [...arr, opt] : arr.filter((x) => x !== opt);
                        onChange(key, next);
                      }}
                    />
                    {opt}
                  </label>
                ))}
              </div>
            );
            break;
          }
          case 'number':
            control = (
              <input
                type="number"
                value={val === undefined || val === null ? '' : String(val)}
                disabled={disabled}
                onChange={(e) => onChange(key, e.target.value === '' ? null : Number(e.target.value))}
                placeholder={f.placeholder}
                className={inputCls}
              />
            );
            break;
          case 'date':
            control = (
              <input
                type="date"
                value={String(val ?? '')}
                disabled={disabled}
                onChange={(e) => onChange(key, e.target.value)}
                className={inputCls}
              />
            );
            break;
          case 'boolean':
            control = (
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  disabled={disabled}
                  checked={Boolean(val)}
                  onChange={(e) => onChange(key, e.target.checked)}
                />
                {f.placeholder || '是/否'}
              </label>
            );
            break;
          case 'staff':
          case 'visitor':
            control = (
              <input
                value={String(val ?? '')}
                disabled
                className={inputCls}
                placeholder={f.type === 'staff' ? '由分配操作设置' : '系统自动关联'}
              />
            );
            break;
          default:
            control = (
              <input
                value={String(val ?? '')}
                disabled={disabled}
                onChange={(e) => onChange(key, e.target.value)}
                placeholder={f.placeholder}
                className={inputCls}
              />
            );
        }

        return (
          <div key={key}>
            <label className={labelCls}>
              {f.label}
              {f.required && <span className="text-red-500 ml-0.5">*</span>}
              {isCustom && !readOnly && (
                <span className="ml-2 text-[10px] text-gray-400">自定义字段</span>
              )}
            </label>
            {control}
          </div>
        );
      })}
    </div>
  );
};

export default TicketDynamicForm;
