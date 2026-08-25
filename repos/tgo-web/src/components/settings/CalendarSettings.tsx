import React from 'react';
import { useTranslation } from 'react-i18next';
import { Calendar } from 'lucide-react';

const CalendarSettings: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Calendar className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        <h2 className="text-lg font-medium text-gray-800 dark:text-gray-100">{t('settings.calendar.title', '\u65e5\u7a0b')}</h2>
      </div>
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 text-sm text-gray-600 dark:text-gray-300">
        {t('settings.calendar.comingSoon', '\u65e5\u7a0b\u76f8\u5173\u8bbe\u7f6e\uff0c\u656c\u8bf7\u671f\u5f85\u2026')}
      </div>
    </div>
  );
};

export default CalendarSettings;

