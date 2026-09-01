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
