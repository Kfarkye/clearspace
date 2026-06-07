// ============================================================================
// Shared Auth: Express Session Middleware
// Authenticates requests via httpOnly session cookies
// Extracted from clearspace/backend/server.js
// ============================================================================

/**
 * Creates an Express middleware that authenticates requests via session cookies.
 * Attaches `req.userEmail` and `req.userSub` on success.
 *
 * @param {Object} sessionManager - A session manager from createSessionManager()
 * @param {Object} [options]
 * @param {string} [options.devProxyHeader] - Header name+value for dev fallback (e.g., 'x-app-proxy')
 * @param {string} [options.devProxyValue] - Expected value for the dev proxy header
 * @param {boolean} [options.allowUnauthenticated=false] - If true, sets req.userEmail to null instead of 401
 * @returns {Function} Express middleware
 */
export function createSessionMiddleware(sessionManager, options = {}) {
  const { cookieName, verifySession } = sessionManager;

  return (req, res, next) => {
    // Skip OPTIONS (CORS preflight)
    if (req.method === 'OPTIONS') return next();

    // Priority 1: httpOnly session cookie
    const sessionCookie = req.cookies?.[cookieName];
    if (sessionCookie) {
      try {
        const decoded = verifySession(sessionCookie);
        req.userEmail = decoded.email;
        req.userSub = decoded.sub;
        return next();
      } catch {
        // Expired or tampered — fall through
      }
    }

    // Priority 2: Bearer token (Firebase ID token or access_token)
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      // Pass through — the consuming app handles its own Bearer validation
      // This just means "not a cookie session, but has a token"
      req.authToken = authHeader.slice(7);
      return next();
    }

    // Priority 3: App proxy header for safe public data routes
    if (options.devProxyHeader && options.devProxyValue) {
      if (req.headers[options.devProxyHeader] === options.devProxyValue) {
        // Enforce strict route boundaries in production
        const isSafeProxyRoute = req.method === 'GET' && (
          req.originalUrl.startsWith('/api-proxy/espn') || 
          req.originalUrl.startsWith('/api-proxy/odds') ||
          req.originalUrl.startsWith('/api-proxy/youtube')
        );

        if (process.env.NODE_ENV !== 'production' || isSafeProxyRoute) {
          req.userEmail = 'proxy@truth.local';
          return next();
        }
      }
    }

    // Allow unauthenticated if configured (for endpoints that optionally use auth)
    if (options.allowUnauthenticated) {
      req.userEmail = null;
      return next();
    }

    return res.status(401).json({ error: 'Unauthorized: Session required. Please log in.' });
  };
}
