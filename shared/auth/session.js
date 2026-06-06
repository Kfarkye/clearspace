// ============================================================================
// Shared Auth: JWT Session Manager
// Handles JWT creation, verification, and cookie configuration
// Extracted from clearspace/backend/server.js
// ============================================================================

import jwt from 'jsonwebtoken';
import crypto from 'crypto';

/**
 * Session configuration defaults.
 * Can be overridden per-app via createSessionManager options.
 */
const DEFAULTS = Object.freeze({
  cookieName: '__session',
  prodTTL: '1h',
  devTTL: '24h',
  prodCookieMaxAge: 3600000,    // 1 hour
  devCookieMaxAge: 86400000,    // 24 hours
});

/**
 * Creates a session manager with the given JWT secret and options.
 *
 * @param {Object} options
 * @param {string} [options.jwtSecret] - JWT signing secret. Falls back to JWT_SECRET env var. Auto-generates in dev.
 * @param {string} [options.cookieName='__session'] - Cookie name for the session token
 * @param {boolean} [options.requireSecretInProd=true] - If true, crashes on missing secret in production
 * @returns {{ signSession, verifySession, getCookieConfig, cookieName }}
 */
export function createSessionManager(options = {}) {
  const isProduction = process.env.NODE_ENV === 'production';
  const cookieName = options.cookieName || DEFAULTS.cookieName;

  // Resolve JWT secret
  let jwtSecret = options.jwtSecret || process.env.JWT_SECRET || 'dev-secret-key-123';
  if (!jwtSecret) {
    if (isProduction && options.requireSecretInProd !== false) {
      console.error('FATAL: JWT_SECRET environment variable must be set in production.');
      process.exit(1);
    }
    // Dev fallback: generate a random secret (sessions won't survive restarts)
    jwtSecret = crypto.randomBytes(32).toString('hex');
    console.warn('[Auth] No JWT_SECRET set — using random secret (sessions reset on restart)');
  }

  const sessionTTL = isProduction ? DEFAULTS.prodTTL : DEFAULTS.devTTL;

  /**
   * Signs a JWT session token with the given payload.
   * @param {{ email: string, sub: string }} payload
   * @returns {string} Signed JWT
   */
  function signSession(payload) {
    return jwt.sign(payload, jwtSecret, { expiresIn: sessionTTL });
  }

  /**
   * Verifies a JWT session token.
   * @param {string} token
   * @returns {{ email: string, sub: string }} Decoded payload
   * @throws {Error} If token is invalid or expired
   */
  function verifySession(token) {
    return jwt.verify(token, jwtSecret);
  }

  /**
   * Returns cookie config for setting the session cookie.
   * @returns {Object} Cookie options for res.cookie()
   */
  function getCookieConfig() {
    return {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: isProduction ? DEFAULTS.prodCookieMaxAge : DEFAULTS.devCookieMaxAge,
      path: '/',
    };
  }

  return { signSession, verifySession, getCookieConfig, cookieName };
}
