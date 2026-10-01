import assert from 'node:assert/strict';
import {
  buildCustomerRoster,
  defaultGroupOwnerOptionLabel,
  filterAssignableStaff,
  makeManualCustomerMember,
  pendingReplyDestination,
  toggleRosterSelection,
} from '../src/utils/replyMonitorRoster.js';

const candidates = [
  { sender_id: 'wx-user-1', sender_name: ' 客户 A ' },
  { sender_id: null, sender_name: '客户 B' },
];

assert.deepEqual(buildCustomerRoster(candidates, ['userid:wx-user-1', 'name:客户 B']), [
  { identity_type: 'userid', identity_value: 'wx-user-1', display_name: '客户 A' },
  { identity_type: 'name', identity_value: '客户 B', display_name: '客户 B' },
]);
assert.deepEqual(buildCustomerRoster(candidates, []), []);
assert.deepEqual(toggleRosterSelection(['userid:wx-user-1'], 'name:客户 B'), [
  'userid:wx-user-1', 'name:客户 B',
]);
assert.deepEqual(toggleRosterSelection(['userid:wx-user-1'], 'userid:wx-user-1'), []);
assert.deepEqual(makeManualCustomerMember('  新　客户  '), {
  identity_type: 'name', identity_value: '新 客户', display_name: '新 客户',
});
assert.equal(makeManualCustomerMember('  '), null);
assert.equal(defaultGroupOwnerOptionLabel({ detected_owner_name: '刘泓凡' }), '刘泓凡（群主，默认）');
assert.equal(defaultGroupOwnerOptionLabel({ detected_owner_name: '  ' }), '群主尚未识别');
assert.deepEqual(filterAssignableStaff([
  { id: 'active-user', role: 'user', is_active: true },
  { id: 'inactive-user', role: 'user', is_active: false },
  { id: 'agent', role: 'agent', is_active: true },
]), [{ id: 'active-user', role: 'user', is_active: true }]);

assert.equal(pendingReplyDestination({
  channel_id: 'visitor-channel', ticket_id: 'ticket-1',
}), '/chat/251/visitor-channel');
assert.equal(pendingReplyDestination({
  channel_id: null, ticket_id: 'ticket-1',
}), '/tickets/ticket-1');
assert.equal(pendingReplyDestination({}), '/chat');
