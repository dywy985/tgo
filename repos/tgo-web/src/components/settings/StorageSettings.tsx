import React from 'react';
import { useTranslation } from 'react-i18next';
import { Database } from 'lucide-react';

const StorageSettings: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Database className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        <h2 className="text-lg font-medium text-gray-800 dark:text-gray-100">{t('settings.storage.title', '\u5b58\u50a8\u7ba1\u7406')}</h2>
      </div>
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 text-sm text-gray-600 dark:text-gray-300">
        {t('settings.storage.comingSoon', '\u7f13\u5b58\u7ba1\u7406\u3001\u5b58\u50a8\u4f7f\u7528\u7edf\u8ba1\u7b49\uff0c\u656c\u8bf7\u671f\u5f85\u2026')}
      </div>
    </div>
  );
};

export default StorageSettings;

