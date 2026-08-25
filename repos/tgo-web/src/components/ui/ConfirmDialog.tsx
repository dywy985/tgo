import React from 'react';
import { AlertTriangle, X, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  confirmVariant?: 'danger' | 'primary';
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

/**
 * Confirm Dialog Component - Redesigned for Modern AI-Centric Style
 */
const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmText,
  cancelText,
  confirmVariant = 'primary',
  onConfirm,
  onCancel,
  isLoading = false
}) => {
  const { t } = useTranslation();
  
  if (!isOpen) return null;

  const isDanger = confirmVariant === 'danger';
  
  const confirmButtonClass = isDanger
    ? 'bg-red-600 hover:bg-red-700 shadow-red-200 dark:shadow-none'
    : 'bg-blue-600 hover:bg-blue-700 shadow-blue-200 dark:shadow-none';

  const iconBgClass = isDanger
    ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-100 dark:border-red-800/50'
    : 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-100 dark:border-blue-800/50';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm animate-in fade-in duration-300"
        onClick={!isLoading ? onCancel : undefined}
      />
      
      {/* Dialog */}
      <div className="relative bg-white dark:bg-gray-900 rounded-[2rem] shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-300 border border-gray-100 dark:border-gray-800">
        {/* Header */}
        <div className="px-8 pt-8 pb-0 flex items-start justify-between">
          <div className={`p-3 rounded-2xl border shadow-sm ${iconBgClass}`}>
            <AlertTriangle className="w-6 h-6" />
          </div>
          <button
            onClick={onCancel}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-xl transition-all active:scale-90"
            disabled={isLoading}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-8 pt-6 pb-8">
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2 tracking-tight">
            {title}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed font-medium">
            {message}
          </p>
        </div>

        {/* Footer */}
        <div className="px-8 py-6 bg-gray-50/50 dark:bg-gray-800/30 border-t border-gray-100 dark:border-gray-800 flex flex-col sm:flex-row gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-6 py-2.5 text-sm font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-all active:scale-95 disabled:opacity-50"
            disabled={isLoading}
          >
            {cancelText || t('common.cancel', '取消')}
          </button>
          <button
            onClick={onConfirm}
            className={`flex-[1.5] px-6 py-2.5 text-sm font-bold text-white rounded-xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 ${confirmButtonClass}`}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{t('common.processing', '处理中...')}</span>
              </>
            ) : (
              confirmText || t('common.confirm', '确认')
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
