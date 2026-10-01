/**
 * Coalesce concurrent access-token refresh attempts into a single request.
 *
 * @param {{
 *   refreshAccessToken: () => Promise<string>,
 *   onTokenRefreshed: (token: string) => void,
 *   onRefreshFailed: () => void,
 * }} options
 * @returns {() => Promise<string>}
 */
export function createRefreshCoordinator(options) {
  /** @type {Promise<string> | null} */
  let pendingRefresh = null;

  return async function refresh() {
    if (!pendingRefresh) {
      pendingRefresh = (async () => {
        try {
          const token = await options.refreshAccessToken();
          options.onTokenRefreshed(token);
          return token;
        } catch (error) {
          options.onRefreshFailed();
          throw error;
        } finally {
          pendingRefresh = null;
        }
      })();
    }
    return pendingRefresh;
  };
}
