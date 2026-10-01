const timestampSeconds = (chat) => {
  if (typeof chat.lastTimestampSec === 'number') return chat.lastTimestampSec;
  if (!chat.timestamp) return 0;
  const milliseconds = new Date(chat.timestamp).getTime();
  return Number.isFinite(milliseconds) ? Math.floor(milliseconds / 1000) : 0;
};

export const sortChatsByAttention = (chats) => {
  return [...chats].sort((a, b) => {
    const unansweredOrder = Number(Boolean(b.isUnanswered)) - Number(Boolean(a.isUnanswered));
    if (unansweredOrder !== 0) return unansweredOrder;
    if (a.isUnanswered && b.isUnanswered) {
      const aPending = new Date(a.pendingReplySince || 0).getTime();
      const bPending = new Date(b.pendingReplySince || 0).getTime();
      if (aPending !== bPending) return aPending - bPending;
    }
    return timestampSeconds(b) - timestampSeconds(a);
  });
};

export const attachUnansweredState = (chats, channels = []) => {
  const unansweredByChannel = new Map(
    channels.map((channel) => [
      `${channel.channel_id}:${channel.channel_type}`,
      Boolean(channel.extra?.is_last_message_from_visitor),
    ])
  );
  return chats.map((chat) => ({
    ...chat,
    isUnanswered: unansweredByChannel.get(`${chat.channelId}:${chat.channelType}`)
      ?? Boolean(chat.isUnanswered),
  }));
};

export const attachReplyMonitorState = (chats, pending = []) => {
  const index = new Map();
  pending.forEach((item) => {
    if (item.conversation_key) index.set(String(item.conversation_key), item);
    if (item.channel_open_id) index.set(String(item.channel_open_id), item);
  });
  return chats.map((chat) => {
    const extra = chat.channelInfo?.extra || {};
    const keys = [chat.channelId, chat.id, extra.platform_open_id, extra.conversation_key].filter(Boolean).map(String);
    const item = keys.map((key) => index.get(key)).find(Boolean);
    return item ? {...chat, isUnanswered: true, pendingReplySince: item.pending_reply_since,
      replyMonitorResponsibleStaff: item.responsible_staff, replyMonitorReminderCount: item.reminder_count} : chat;
  });
};
