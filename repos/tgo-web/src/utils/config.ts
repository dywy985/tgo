/**
 * Runtime Configuration Utilities
 * 
 * Provides unified access to environment configuration with priority:
 * 1. Runtime configuration (window.ENV, set by docker-entrypoint.sh)
 * 2. Build-time environment variables (import.meta.env.VITE_*)
 * 3. Default values
 * 
 * This allows configuration changes without rebuilding the application.
 */

// Extend Window interface for TypeScript
declare global {
  interface Window {
    ENV?: {
      VITE_API_BASE_URL?: string;
      VITE_DEBUG_MODE?: boolean;
      VITE_WIDGET_PREVIEW_URL?: string;
      VITE_DISABLE_WEBSOCKET_AUTO_CONNECT?: string;
      [key: string]: string | boolean | undefined;
    };
  }
}

/**
 * Get a configuration value with runtime priority
 * @param key - The configuration key (without VITE_ prefix for window.ENV)
 * @param defaultValue - Default value if not found
 */
export function getConfig(key: string, defaultValue: string = ''): string {
  // 1. Try runtime configuration (window.ENV)
  if (typeof window !== 'undefined' && window.ENV) {
    const runtimeValue = window.ENV[key];
    if (runtimeValue !== undefined && runtimeValue !== null) {
      return String(runtimeValue);
    }
  }

  // 2. Try build-time environment variable
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    const buildValue = import.meta.env[key];
    if (buildValue !== undefined && buildValue !== null) {
      return String(buildValue);
    }
  }

  // 3. Return default value
  return defaultValue;
}

/**
 * Get boolean configuration value
 */
export function getBooleanConfig(key: string, defaultValue: boolean = false): boolean {
  const value = getConfig(key, String(defaultValue));
  return value === 'true' || value === '1';
}

/**
 * Get API base URL with proper defaults
 */
export function getApiBaseUrl(): string {
  return getConfig('VITE_API_BASE_URL', '/api');
}

/**
 * Get Widget preview URL with proper defaults
 */
export function getWidgetPreviewUrl(): string {
  return getConfig('VITE_WIDGET_PREVIEW_URL', '/widget');
}

/**
 * Check if debug mode is enabled
 */
export function isDebugMode(): boolean {
  return getBooleanConfig('VITE_DEBUG_MODE', false);
}

/**
 * Check if WebSocket auto-connect is disabled
 */
export function isWebSocketAutoConnectDisabled(): boolean {
  return getBooleanConfig('VITE_DISABLE_WEBSOCKET_AUTO_CONNECT', false);
}

/**
 * Convert a relative URL to an absolute URL using current origin
 * @param url - The URL to convert (may be relative or absolute)
 * @returns Absolute URL
 */
export function toAbsoluteUrl(url: string): string {
  if (!url) return url;
  // If already absolute (has scheme), return as-is
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(url)) {
    return url;
  }
  // Relative URL - prepend current origin
  return `${window.location.origin}${url.startsWith('/') ? '' : '/'}${url}`;
}

// Export commonly used config values for convenience
export const config = {
  get apiBaseUrl() {
    return getApiBaseUrl();
  },
  get widgetPreviewUrl() {
    return getWidgetPreviewUrl();
  },
  get debugMode() {
    return isDebugMode();
  },
  get disableWebSocketAutoConnect() {
    return isWebSocketAutoConnectDisabled();
  },
} as const;

export default config;

