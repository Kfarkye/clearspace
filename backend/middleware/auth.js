import cookieParser from 'cookie-parser';
import { createSessionManager, createSessionMiddleware } from '@clearspace/auth';

export const sessionManager = createSessionManager();
export const PROXY_HEADER = process?.env?.PROXY_HEADER || 'dev-proxy-key-123';

export function setupAuth(app) {
  app.use(cookieParser());

  if (!PROXY_HEADER) {
    console.error("Error: Environment variables PROXY_HEADER must be set.");
    process.exit(1);
  }

  // --- Unified Session Auth Middleware for /api-proxy/* ---
  const proxyAuthMiddleware = createSessionMiddleware(sessionManager, {
    devProxyHeader: 'x-app-proxy',
    devProxyValue: PROXY_HEADER,
  });

  app.use('/api-proxy', (req, res, next) => {
    // Skip the main POST /api-proxy since it has its own auth check (e.g. proxying Vertex AI)
    if (req.method === 'POST' && req.path === '/') return next();
    return proxyAuthMiddleware(req, res, next);
  });
}
