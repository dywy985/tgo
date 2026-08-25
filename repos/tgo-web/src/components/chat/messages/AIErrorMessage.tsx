import React from 'react';
import { AlertCircle } from 'lucide-react';

/**
 * AIErrorMessage renders an error message when AI response generation fails
 * Displayed when streaming message ends with an error (end=1 and end_reason > 0)
 */
export interface AIErrorMessageProps {
  isStaff: boolean; // true for staff (right), false for visitor (left)
  errorText: string; // The error message to display
}

const AIErrorMessage: React.FC<AIErrorMessageProps> = ({ isStaff, errorText }) => {
  if (isStaff) {
    return (
      <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800/50 p-3 rounded-lg rounded-tr-none shadow-sm overflow-hidden max-w-full">
        <div className="flex items-start space-x-2 text-red-600 dark:text-red-400">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span className="text-sm">{errorText}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800/50 p-3 rounded-lg rounded-tl-none shadow-sm overflow-hidden max-w-full">
      <div className="flex items-start space-x-2 text-red-600 dark:text-red-400">
        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <span className="text-sm">{errorText}</span>
      </div>
    </div>
  );
};

export default AIErrorMessage;

