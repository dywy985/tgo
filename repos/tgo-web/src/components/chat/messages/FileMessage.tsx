import React from 'react';
import { useTranslation } from 'react-i18next';
import type { Message } from '@/types';
import { MessagePayloadType } from '@/types';
import { uploadChatFileWithProgress } from '@/services/chatUploadApi';
import { toAbsoluteApiUrl } from '@/utils/url';
import { useWuKongIMWebSocket } from '@/hooks/useWuKongIMWebSocket';
import { useChatStore } from '@/stores/chatStore';
import { useToast } from '@/hooks/useToast';
import { showApiError } from '@/utils/toastHelpers';
import { getFileIcon } from '@/utils/fileIcons';
import { formatBytes } from '@/utils/format';

/**
 * FileMessage renders file/document messages with upload progress and retry.
 */
export interface MessageComponentProps {
  message: Message;
  isStaff: boolean;
}

const FileMessage: React.FC<MessageComponentProps> = ({ message, isStaff }) => {
  const { t } = useTranslation();
  const typedPayload = message.payload as any | undefined;

  const fileUrl = ((typedPayload?.type === MessagePayloadType.FILE && (typedPayload as any)?.url) || (message.metadata as any)?.file_url || '') as string;
  const fileName = ((typedPayload?.type === MessagePayloadType.FILE && (typedPayload as any)?.name) || (message.metadata as any)?.file_name || '[文件]') as string;
  const fileSize = ((typedPayload?.type === MessagePayloadType.FILE && (typedPayload as any)?.size) || (message.metadata as any)?.file_size) as number | undefined;

  const fileUploading = message.metadata?.upload_status === 'uploading';
  const fileUploadProgress = typeof message.metadata?.upload_progress === 'number' ? (message.metadata!.upload_progress as number) : undefined;
  const fileUploadError = message.metadata?.upload_status === 'error';

  const updateMessageByClientMsgNo = useChatStore(state => state.updateMessageByClientMsgNo);
  const { sendMessage: sendWsMessage, isConnected } = useWuKongIMWebSocket();
  const { showToast } = useToast();

  const retryFileUpload = React.useCallback(async () => {
    const f: File | undefined = (message.metadata as any)?.file;
    if (!f || !message.channelId || typeof message.channelType !== 'number') return;
    const clientKey = message.clientMsgNo || message.id;

    // mark uploading
    updateMessageByClientMsgNo(clientKey, { metadata: { upload_status: 'uploading', upload_progress: 0 } });
    try {
      await uploadChatFileWithProgress(f, message.channelId, message.channelType, {
        onProgress: (p) => {
          updateMessageByClientMsgNo(clientKey, { metadata: { upload_progress: p.progress, upload_status: p.status } });
        }
      }).then(async (res) => {
        const url = toAbsoluteApiUrl(res.file_url);
        const name = (message.metadata as any)?.file_name || f.name;
        const size = (message.metadata as any)?.file_size || f.size;
        updateMessageByClientMsgNo(clientKey, { metadata: { file_url: url, upload_progress: 100, upload_status: 'completed' } });
        // try send via WS
        const payload: any = { type: MessagePayloadType.FILE, content: '[文件]', url, name, size, timestamp: Date.now() };
        try {
          if (!isConnected) throw new Error('WebSocket 未连接，无法发送文件消息');
          await sendWsMessage(message.channelId as string, message.channelType as number, payload, clientKey);
          updateMessageByClientMsgNo(clientKey, { metadata: { ws_sent: true, ws_send_error: false } });
        } catch (err) {
          updateMessageByClientMsgNo(clientKey, { metadata: { ws_send_error: true } });
          showApiError?.(showToast, err as any);
        }
      }).catch((err) => {
        updateMessageByClientMsgNo(clientKey, { metadata: { upload_status: 'error' } });
        showApiError?.(showToast, err);
      });
    } catch (e) {
      // no-op handled
    }
  }, [message.metadata, message.channelId, message.channelType, message.clientMsgNo, message.id, isConnected, sendWsMessage, updateMessageByClientMsgNo, showToast]);

  const wrapperClass = isStaff
    ? 'bg-white dark:bg-gray-700 p-3 rounded-lg rounded-tr-none shadow-sm border border-blue-200 dark:border-blue-700 w-[280px] max-w-xs cursor-pointer'
    : 'bg-white dark:bg-gray-800 p-3 rounded-lg rounded-tl-none shadow-sm border border-gray-100 dark:border-gray-700 w-[280px] max-w-xs cursor-pointer';

  return (
    <div
      className={wrapperClass}
      role="button"
      aria-label={t('chat.messages.file.aria', '文件')}
      onClick={() => {
        if (fileUploadError) {
          retryFileUpload();
        } else if (fileUrl && !fileUploading) {
          window.open(fileUrl, '_blank');
        }
      }}
    >
      <div className="flex items-center space-x-3">
        {getFileIcon(fileName, 'w-8 h-8', 32)}
        <div className="flex-1 min-w-0">
          <div className="text-sm text-gray-800 dark:text-gray-200 truncate">{fileName || t('chat.messages.file.placeholder', '[文件]')}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {fileUploadError ? t('chat.messages.file.uploadFailedRetry', '上传失败，点击重试') : (fileUploading ? t('chat.messages.file.uploadingWithPercent', '上传中 {{percent}}%', { percent: fileUploadProgress ?? 0 }) : formatBytes(fileSize))}
          </div>
        </div>
        {fileUrl && !fileUploading && !fileUploadError ? (
          <img src="https://unpkg.com/lucide-static@latest/icons/download.svg" alt={t('chat.messages.file.download', '下载')} className="w-5 h-5 opacity-70" />
        ) : null}
      </div>
    </div>
  );
};

export default FileMessage;

