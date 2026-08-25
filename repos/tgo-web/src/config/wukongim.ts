/**
 * WuKongIM WebSocket Configuration
 */

export interface WuKongIMConfig {
  /** WebSocket server URL (env fallback only; primary comes from dynamic route) */
  wsUrl: string;
  /** Connection timeout in milliseconds */
  connectionTimeout: number;
  /** Maximum reconnection attempts */
  maxReconnectAttempts: number;
  /** Initial reconnection delay in milliseconds */
  reconnectDelay: number;
  /** Maximum reconnection delay in milliseconds */
  maxReconnectDelay: number;
}




