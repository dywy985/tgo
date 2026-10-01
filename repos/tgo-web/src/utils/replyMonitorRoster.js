/**
 * Convert selected observed-member keys into the API's stable roster payload.
 * UserID wins whenever one was observed; names remain a compatibility fallback.
 * @param {Array<{identity_type?: 'userid' | 'name', identity_value?: string, display_name?: string, sender_id?: string | null, sender_name?: string | null}>} candidates
 * @param {string[]} selectedKeys
 */
export function buildCustomerRoster(candidates, selectedKeys) {
  const selected = new Set(selectedKeys);
  return candidates.flatMap((candidate) => {
    const senderId = String(candidate.sender_id || '').trim();
    const senderName = String(candidate.sender_name || '').trim();
    const identityType = candidate.identity_type || (senderId ? 'userid' : 'name');
    const identityValue = String(candidate.identity_value || senderId || senderName).trim();
    const displayName = String(candidate.display_name || senderName || identityValue).trim();
    if (!identityValue || !selected.has(`${identityType}:${identityValue}`)) return [];
    return [{
      identity_type: identityType,
      identity_value: identityValue,
      display_name: displayName,
    }];
  });
}

/** Toggle one member in a local roster draft without persisting it. */
export function toggleRosterSelection(selectedKeys, identityKey) {
  const selected = new Set(selectedKeys);
  if (selected.has(identityKey)) selected.delete(identityKey);
  else selected.add(identityKey);
  return [...selected];
}

/**
 * Build one manually entered name identity for the editable customer roster.
 * @returns {{identity_type: 'name', identity_value: string, display_name: string} | null}
 */
export function makeManualCustomerMember(displayName) {
  const display = String(displayName || '').normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (!display) return null;
  return {
    identity_type: 'name',
    identity_value: display.toLocaleLowerCase(),
    display_name: display,
  };
}

/**
 * Make the default assignment concrete in the owner selector.
 * @param {{detected_owner_name?: string | null}} assignment
 */
export function defaultGroupOwnerOptionLabel(assignment) {
  const ownerName = String(assignment.detected_owner_name || '').trim();
  return ownerName ? `${ownerName}（群主，默认）` : '群主尚未识别';
}

/**
 * Only active human accounts can be selected as reply-monitor owners.
 * @template {{role?: string, is_active?: boolean}} T
 * @param {T[]} staff
 * @returns {T[]}
 */
export function filterAssignableStaff(staff) {
  return staff.filter((member) => member.role !== 'agent' && member.is_active === true);
}

/** Prefer the concrete chat over its derived ticket when opening a pending item. */
export function pendingReplyDestination(item) {
  if (item?.channel_id) return `/chat/251/${item.channel_id}`;
  if (item?.ticket_id) return `/tickets/${item.ticket_id}`;
  return '/chat';
}
