import React from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard } from 'lucide-react';

const ShortcutsSettings: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Keyboard className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        <h2 className="text-lg font-medium text-gray-800 dark:text-gray-100">{t('settings.shortcuts.title', '\u5feb\u6377\u952e')}</h2>
      </div>
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 text-sm text-gray-600 dark:text-gray-300">
        {t('settings.shortcuts.comingSoon', '\u5feb\u6377\u952e\u5b9a\u5236\u3001\u9ed8\u8ba4\u7ec4\u5408\u952e\u7b49\uff0c\u656c\u8bf7\u671f\u5f85\u2026')}
      </div>
    </div>
  );
};

export default ShortcutsSettings;

