import React from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '@/components/ui/Icon';

export interface SyncStatusProps {
  isSyncing: boolean;
  syncError: string | null;
  lastSyncTime: string | null;
  onRetry: () => void;
}

/**
 * Sync status indicator below the header.
 */
export const SyncStatus: React.FC<SyncStatusProps> = React.memo(({ isSyncing, syncError, lastSyncTime, onRetry }) => {
  const { t } = useTranslation();

  if (!isSyncing && !syncError && !lastSyncTime) return null;

  return (
    <div className="px-3 py-2 border-b border-gray-200">
      {isSyncing && (
        <div className="flex items-center gap-2 text-sm text-blue-600">
          <Icon name="RefreshCw" size={14} className="w-3.5 h-3.5 animate-spin" />
          {t('chat.sync.syncing')}
        </div>
      )}
      {syncError && (
        <div className="flex items-center justify-between text-sm text-red-600">
          <div className="flex items-center gap-2">
            <Icon name="AlertCircle" size={14} className="w-3.5 h-3.5" />
            {t('chat.sync.failed')}
          </div>
          <button onClick={onRetry} className="text-red-600 hover:text-red-700 underline">
            {t('chat.sync.retry')}
          </button>
        </div>
      )}
      {!isSyncing && !syncError && lastSyncTime && (
        <div className="text-xs text-gray-500">
          {t('chat.sync.lastSync', {
            time: new Date(lastSyncTime).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
          })}
        </div>
      )}
    </div>
  );
});

SyncStatus.displayName = 'SyncStatus';

