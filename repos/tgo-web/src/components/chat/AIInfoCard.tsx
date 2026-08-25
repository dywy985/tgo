import React from 'react';
import type { MessageAIInfo } from '@/types';

interface AIInfoCardProps {
  aiInfo?: MessageAIInfo;
}

/**
 * AI Information Card component for displaying order info, suggestions, etc.
 */
const AIInfoCard: React.FC<AIInfoCardProps> = ({ aiInfo }) => {
  if (!aiInfo) return null;

  const getDetailLabel = (key: string): string => {
    switch (key) {
      case 'status':
        return '状态: ';
      case 'product':
        return '商品: ';
      case 'tracking':
        return '物流: ';
      default:
        return '';
    }
  };

  const getDetailValueClass = (key: string): string => {
    return key === 'status' ? 'text-blue-700 dark:text-blue-400' : 'text-gray-800 dark:text-gray-200';
  };

  return (
    <div className="mt-2 ml-10 pl-0">
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 shadow-sm max-w-md">
        <div className="flex justify-between items-center mb-2">
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">{aiInfo.title}</h4>
          <span className="text-xs text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-1.5 py-0.5 rounded-full">
            {aiInfo.status}
          </span>
        </div>
        
        {aiInfo.details && (
          <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1 mb-3">
            {Object.entries(aiInfo.details).map(([key, value]) => (
              <p key={key}>
                {getDetailLabel(key)}
                <span className={`font-medium ${getDetailValueClass(key)}`}>
                  {String(value)}
                </span>
              </p>
            ))}
          </div>
        )}
        
        {aiInfo.actions && aiInfo.actions.length > 0 && (
          <div className="flex gap-2">
            {aiInfo.actions.map((action, index) => (
              <button
                key={index}
                className={`text-xs px-2 py-1 rounded-md transition-colors ${
                  action.type === 'primary'
                    ? 'bg-blue-500 dark:bg-blue-600 hover:bg-blue-600 dark:hover:bg-blue-700 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600'
                }`}
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AIInfoCard;
