import test from 'node:test';
import assert from 'node:assert/strict';

import { attachReplyMonitorState, attachUnansweredState, sortChatsByAttention } from '../src/utils/chatSort.js';


test('unanswered group and direct chats are pinned before answered chats', () => {
  const result = sortChatsByAttention([
    { id: 'answered-new', isUnanswered: false, lastTimestampSec: 300 },
    { id: 'group-unanswered', isUnanswered: true, lastTimestampSec: 100 },
    { id: 'direct-unanswered', isUnanswered: true, lastTimestampSec: 200 },
  ]);

  assert.deepEqual(result.map((chat) => chat.id), [
    'direct-unanswered',
    'group-unanswered',
    'answered-new',
  ]);
});

test('sorting does not mutate the source list', () => {
  const source = [
    { id: 'older', isUnanswered: false, lastTimestampSec: 100 },
    { id: 'newer', isUnanswered: false, lastTimestampSec: 200 },
  ];

  sortChatsByAttention(source);

  assert.deepEqual(source.map((chat) => chat.id), ['older', 'newer']);
});

test('pending chats are ordered by longest wait first', () => {
  const result = sortChatsByAttention([
    { id: 'newer-pending', isUnanswered: true, pendingReplySince: '2026-09-02T02:00:00Z' },
    { id: 'older-pending', isUnanswered: true, pendingReplySince: '2026-09-02T01:00:00Z' },
  ]);
  assert.deepEqual(result.map((chat) => chat.id), ['older-pending', 'newer-pending']);
});

test('visitor response flag is attached to its group or direct conversation', () => {
  const chats = [{ id: 'chat', channelId: 'visitor-1', channelType: 251 }];
  const channels = [{
    channel_id: 'visitor-1',
    channel_type: 251,
    extra: { is_last_message_from_visitor: true },
  }];

  const result = attachUnansweredState(chats, channels);

  assert.equal(result[0].isUnanswered, true);
  assert.equal(chats[0].isUnanswered, undefined);
});

test('reply monitor pending state matches platform open id', () => {
  const chats = [{id:'c', channelInfo:{extra:{platform_open_id:'wt:r:g'}}}];
  const result = attachReplyMonitorState(chats, [{channel_open_id:'wt:r:g', pending_reply_since:'2026-09-02T01:00:00Z', reminder_count:1}]);
  assert.equal(result[0].isUnanswered, true);
  assert.equal(result[0].replyMonitorReminderCount, 1);
});
