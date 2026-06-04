// ============================================================================
// Shared Auth: Express Auth Routes
// Session creation (POST /session) and logout (POST /logout)
// Extracted from clearspace/backend/server.js
// ============================================================================

import { verifyGoogleAccessToken } from './google-verify.js';

/**
 * Creates an Express Router with session auth endpoints:
 * - POST /session  — Validates Google access_token, creates httpOnly JWT session
 * - POST /logout   — Clears session cookie
 *
 * @param {Object} sessionManager - A session manager from createSessionManager()
 * @returns {Function} A function that takes express and returns a router
 */
export function createAuthRoutes(sessionManager, express) {
  const router = express.Router();
  const { signSession, getCookieConfig, cookieName } = sessionManager;

  // --- POST /session ---
  // Client sends { access_token } after Google OAuth login
  // Server validates with Google, creates JWT session cookie
  router.post('/session', async (req, res) => {
    try {
      const { access_token } = req.body;
      if (!access_token) {
        return res.status(400).json({ error: 'access_token is required.' });
      }

      const userInfo = await verifyGoogleAccessToken(access_token);
      const token = signSession({ email: userInfo.email, sub: userInfo.sub });

      res.cookie(cookieName, token, getCookieConfig());

      console.log(`[Auth] Session created for ${userInfo.email}`);
      res.json({ authenticated: true, email: userInfo.email, name: userInfo.name });

    } catch (err) {
      console.error('[Auth] Session creation failed:', err.message);
      res.status(401).json({ error: err.message || 'Session creation failed.' });
    }
  });

  // --- POST /logout ---
  router.post('/logout', (req, res) => {
    res.clearCookie(cookieName, { path: '/' });
    res.json({ authenticated: false });
  });

  // --- GET /me ---
  // Check if current session is valid
  router.get('/me', (req, res) => {
    const sessionCookie = req.cookies?.[cookieName];
    if (!sessionCookie) {
      return res.json({ authenticated: false });
    }

    try {
      const decoded = sessionManager.verifySession(sessionCookie);
      res.json({ authenticated: true, email: decoded.email });
    } catch {
      res.clearCookie(cookieName, { path: '/' });
      res.json({ authenticated: false });
    }
  });

  return router;
}
