import test from 'node:test';
import assert from 'node:assert/strict';

import { createRefreshCoordinator } from '../src/services/authRefresh.js';


test('concurrent expired requests share one refresh operation', async () => {
  let refreshCalls = 0;
  const refreshedTokens = [];
  let releaseRefresh;
  const refreshGate = new Promise((resolve) => { releaseRefresh = resolve; });
  const refresh = createRefreshCoordinator({
    refreshAccessToken: async () => {
      refreshCalls += 1;
      await refreshGate;
      return 'new-access-token';
    },
    onTokenRefreshed: (token) => refreshedTokens.push(token),
    onRefreshFailed: () => assert.fail('refresh should not fail'),
  });

  const first = refresh();
  const second = refresh();
  releaseRefresh();

  assert.equal(await first, 'new-access-token');
  assert.equal(await second, 'new-access-token');
  assert.equal(refreshCalls, 1);
  assert.deepEqual(refreshedTokens, ['new-access-token']);
});


test('failed refresh logs out once and allows a later retry', async () => {
  let refreshCalls = 0;
  let failureCalls = 0;
  const refresh = createRefreshCoordinator({
    refreshAccessToken: async () => {
      refreshCalls += 1;
      throw new Error('expired refresh cookie');
    },
    onTokenRefreshed: () => assert.fail('token must not be updated'),
    onRefreshFailed: () => { failureCalls += 1; },
  });

  const results = await Promise.allSettled([refresh(), refresh()]);
  assert.deepEqual(results.map((result) => result.status), ['rejected', 'rejected']);
  assert.equal(refreshCalls, 1);
  assert.equal(failureCalls, 1);

  await assert.rejects(refresh());
  assert.equal(refreshCalls, 2);
  assert.equal(failureCalls, 2);
});
