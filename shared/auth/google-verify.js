// ============================================================================
// Shared Auth: Google OAuth Token Verification
// Validates Google access_tokens via the userinfo endpoint
// Extracted from clearspace/backend/server.js
// ============================================================================

const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

/**
 * Verifies a Google OAuth access_token by calling the Google userinfo endpoint.
 * Returns the user's email and sub (subject ID) if valid.
 *
 * @param {string} accessToken - The Google OAuth access_token from the client
 * @returns {Promise<{ email: string, sub: string, name?: string, picture?: string }>}
 * @throws {Error} If the token is invalid or Google returns an error
 */
export async function verifyGoogleAccessToken(accessToken) {
  if (!accessToken || typeof accessToken !== 'string') {
    throw new Error('access_token is required');
  }

  const res = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Google token verification failed (${res.status}): ${body}`);
  }

  const userInfo = await res.json();

  if (!userInfo.email) {
    throw new Error('Could not determine user email from Google token');
  }

  return {
    email: userInfo.email,
    sub: userInfo.sub,
    name: userInfo.name || null,
    picture: userInfo.picture || null,
  };
}
