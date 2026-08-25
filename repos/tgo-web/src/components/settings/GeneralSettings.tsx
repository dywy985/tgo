import React from 'react';
import { useTranslation } from 'react-i18next';
import { Settings, Sun, Moon, Monitor } from 'lucide-react';

import LanguageSelector from '@/components/ui/LanguageSelector';
import { useAppSettingsStore, ThemeMode } from '@/stores/appSettingsStore';

const GeneralSettings: React.FC = () => {
  const { t } = useTranslation();
  const { themeMode, setThemeMode } = useAppSettingsStore();

  const themeOptions: Array<{ value: ThemeMode; label: string; icon: React.ReactNode }> = [
    { value: 'light', label: t('settings.theme.light', '浅色'), icon: <Sun className="w-4 h-4" /> },
    { value: 'dark', label: t('settings.theme.dark', '深色'), icon: <Moon className="w-4 h-4" /> },
    { value: 'system', label: t('settings.theme.system', '跟随系统'), icon: <Monitor className="w-4 h-4" /> },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Settings className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        <h2 className="text-lg font-medium text-gray-800 dark:text-gray-200">{t('settings.general.title', '通用')}</h2>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 space-y-6">
        {/* 主题设置 */}
        <div>
          <div className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-3">
            {t('settings.theme.title', '主题模式')}
          </div>
          <div className="space-y-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t('settings.theme.description', '选择您偏好的主题模式，更改将立即生效')}
            </p>
            <div className="flex gap-3">
              {themeOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setThemeMode(option.value)}
                  className={`
                    flex items-center gap-2 px-4 py-2.5 rounded-lg border transition-all
                    ${
                      themeMode === option.value
                        ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-500 text-blue-700 dark:text-blue-300'
                        : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-500'
                    }
                  `}
                >
                  {option.icon}
                  <span className="text-sm font-medium">{option.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 语言设置 */}
        <div className="pt-6 border-t border-gray-200 dark:border-gray-700">
          <div className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-3">{t('settings.language.title', '语言设置')}</div>
          <div className="flex items-center gap-4">
            <LanguageSelector variant="button" placement="bottom" usePortal />
            <div className="text-xs text-gray-500 dark:text-gray-400">{t('settings.language.persistence', '语言偏好将自动保存到本地')}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GeneralSettings;
