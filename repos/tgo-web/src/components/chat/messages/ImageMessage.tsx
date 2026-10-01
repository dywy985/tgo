import React from 'react';
import { MessagePayloadType, type Message } from '@/types';
import MonitorImage from './MonitorImage';

export interface MessageComponentProps {
  message: Message;
  isStaff: boolean;
}

const ImageMessage: React.FC<MessageComponentProps> = ({ message, isStaff }) => {
  const payload = message.payload as any | undefined;
  const payloadIsImage = payload?.type === MessagePayloadType.IMAGE;
  return <MonitorImage
    isStaff={isStaff}
    originalUrl={String((payloadIsImage && payload?.url) || message.metadata?.image_url || message.metadata?.image_preview_url || '')}
    monitorMessageId={String(message.metadata?.monitor_message_id || '')}
    width={(payloadIsImage && typeof payload?.width === 'number') ? payload.width : Number(message.metadata?.image_width) || 200}
    height={(payloadIsImage && typeof payload?.height === 'number') ? payload.height : Number(message.metadata?.image_height) || 200}
    mediaStatus={String(message.metadata?.media_status || '')}
    uploading={message.metadata?.upload_status === 'uploading'}
    uploadProgress={typeof message.metadata?.upload_progress === 'number' ? message.metadata.upload_progress as number : undefined}
    uploadError={message.metadata?.upload_status === 'error'}
  />;
};

export default ImageMessage;
