/**
 * API endpoint constants — single source of truth for all backend routes.
 * Prevents magic strings and makes endpoint changes a one-line fix.
 */
export const API_ENDPOINTS = {
  // Auth
  AUTH_SESSION: '/api/auth/session',
  AUTH_LOGOUT: '/api/auth/logout',
  AUTH_ME: '/api/auth/me',
  // Deploy
  DEPLOY_HTML: '/api-proxy/deploy-html',
  // Data Persistence
  DATA_CONVERSATIONS: '/api/data/conversations',
  DATA_PREFERENCES: '/api/data/preferences',
  DATA_ARTIFACTS: '/api/data/artifacts',
} as const;
