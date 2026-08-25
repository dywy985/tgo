import React from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * LoadingMessage renders a loading indicator for streaming messages (type=100)
 * Displayed when AI is starting to generate a response
 */
export interface LoadingMessageProps {
  isStaff: boolean; // true for staff (right), false for visitor (left)
}

const LoadingMessage: React.FC<LoadingMessageProps> = ({ isStaff }) => {
  const { t } = useTranslation();

  if (isStaff) {
    return (
      <div className="bg-blue-500 dark:bg-blue-600 text-white p-3 rounded-lg rounded-tr-none shadow-sm overflow-hidden max-w-full">
        <div className="flex items-center space-x-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">{t('chat.messages.aiThinking', 'AI 正在思考...')}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-700 p-3 rounded-lg rounded-tl-none shadow-sm border border-gray-100 dark:border-gray-600 overflow-hidden max-w-full">
      <div className="flex items-center space-x-2 text-gray-600 dark:text-gray-300">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">{t('chat.messages.aiThinking', 'AI 正在思考...')}</span>
      </div>
    </div>
  );
};

export default LoadingMessage;

