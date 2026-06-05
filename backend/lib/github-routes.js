/**
 * GitHub OAuth + API Routes for Clearspace
 * 
 * Provides:
 *   /api/auth/github/url          — Generate OAuth authorization URL
 *   /api/auth/github/status       — Check GitHub connection status + username
 *   /api/auth/github/disconnect   — Clear GitHub token cookie
 *   /auth/github/callback         — OAuth callback (exchanges code for token)
 *   /api/github/repos             — List authenticated user's repos
 *   /api/github/repos/:owner/:repo/tree  — Get full file tree for a repo
 *   /api/github/repos/:owner/:repo/file  — Fetch a single file's content
 */

import crypto from 'crypto';

// Octokit is imported dynamically to avoid adding it as a hard dependency
// until the user actually connects GitHub. This keeps cold starts fast.
let _Octokit;
async function getOctokit(token) {
  if (!_Octokit) {
    const mod = await import('@octokit/rest');
    _Octokit = mod.Octokit;
  }
  return new _Octokit({ auth: token });
}

// ── Cookie helpers ──────────────────────────────────────────────────────────
const isProd = process.env.NODE_ENV === 'production';

function getCookieOpts() {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    path: '/',
  };
}

function getClearCookieOpts() {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/',
  };
}

// ── Auth success popup HTML ────────────────────────────────────────────────
function renderAuthSuccess(title, triggerType) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background: #f5f5f7; margin: 0; color: #1d1d1f; -webkit-font-smoothing: antialiased; }
    main { text-align: center; padding: 2.5rem; background: #ffffff; border-radius: 12px; box-shadow: 0 4px 16px rgba(0,0,0,0.06); width: 90%; max-width: 400px; }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; font-weight: 600; letter-spacing: -0.015em; }
    p { color: #515154; line-height: 1.5; font-size: 0.95rem; margin: 0; }
  </style>
</head>
<body>
  <script>
    if (window.opener) { window.opener.postMessage({ type: '${triggerType}' }, '*'); window.close(); }
    else { window.location.href = '/'; }
  </script>
  <main role="main" aria-live="polite">
    <h1>${title}</h1>
    <p>Identity secured. This window will transition automatically.</p>
  </main>
</body>
</html>
`;
}

// ── Route mounting ─────────────────────────────────────────────────────────
export function mountGitHubRoutes(app) {
  const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
  const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;

  // ── OAuth: Generate auth URL ──────────────────────────────────────────
  app.get('/api/auth/github/url', (req, res) => {
    if (!GITHUB_CLIENT_ID) return res.status(500).json({ error: 'GITHUB_CLIENT_ID not configured' });

    const state = crypto.randomUUID();
    res.cookie('oauth_state_gh', state, { ...getCookieOpts(), maxAge: 600000 });

    const params = new URLSearchParams({
      client_id: GITHUB_CLIENT_ID,
      redirect_uri: `${getBaseUrl(req)}/auth/github/callback`,
      scope: 'repo',
      state,
    });
    res.json({ url: `https://github.com/login/oauth/authorize?${params.toString()}` });
  });

  // ── OAuth: Callback (exchanges code for token) ────────────────────────
  app.get(['/auth/github/callback', '/auth/github/callback/'], async (req, res) => {
    const { code, state } = req.query;

    if (!state || state !== req.cookies.oauth_state_gh) {
      console.warn('[GitHub] OAuth CSRF state mismatch');
      return res.status(403).send('Invalid verification state (CSRF rejection).');
    }
    res.clearCookie('oauth_state_gh', getClearCookieOpts());

    try {
      const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          client_id: GITHUB_CLIENT_ID,
          client_secret: GITHUB_CLIENT_SECRET,
          code,
        }),
      });
      const data = await tokenRes.json();

      if (!data.access_token) {
        console.error('[GitHub] Token exchange returned no token:', data.error_description || data.error);
        return res.status(500).send(`GitHub auth failed: ${data.error_description || data.error || 'No token returned'}`);
      }

      res.cookie('github_token', data.access_token, getCookieOpts());
      res.send(renderAuthSuccess('GitHub Connected', 'GITHUB_AUTH_SUCCESS'));
    } catch (err) {
      console.error('[GitHub] Token exchange failed:', err.message);
      res.status(500).send(`GitHub auth failed: ${err.message || 'Token exchange error'}`);
    }
  });

  // ── Auth Status ───────────────────────────────────────────────────────
  app.get('/api/auth/github/status', async (req, res) => {
    if (!req.cookies.github_token) {
      return res.json({ connected: false });
    }
    try {
      const octokit = await getOctokit(req.cookies.github_token);
      const { data } = await octokit.users.getAuthenticated();
      res.json({ connected: true, username: data.login });
    } catch {
      console.warn('[GitHub] Token validation failed — marking disconnected');
      res.json({ connected: false });
    }
  });

  // ── Disconnect ────────────────────────────────────────────────────────
  app.post('/api/auth/github/disconnect', (req, res) => {
    res.clearCookie('github_token', getClearCookieOpts());
    res.json({ disconnected: true });
  });

  // ── List Repos ────────────────────────────────────────────────────────
  app.get('/api/github/repos', async (req, res) => {
    if (!req.cookies.github_token) return res.status(401).json({ error: 'Requires GitHub context' });
    try {
      const octokit = await getOctokit(req.cookies.github_token);
      const { data } = await octokit.repos.listForAuthenticatedUser({ sort: 'updated', per_page: 30 });
      res.json(data.map(r => ({ name: r.full_name, private: r.private, language: r.language, url: r.html_url })));
    } catch (err) {
      console.error('[GitHub] Failed to list repos:', err.message);
      res.status(500).json({ error: 'Failed to list repos' });
    }
  });

  // ── File Tree ─────────────────────────────────────────────────────────
  app.get('/api/github/repos/:owner/:repo/tree', async (req, res) => {
    if (!req.cookies.github_token) return res.status(401).json({ error: 'Requires GitHub context' });
    const { owner, repo } = req.params;

    try {
      const octokit = await getOctokit(req.cookies.github_token);
      let defaultBranch = 'main';
      try { defaultBranch = (await octokit.repos.get({ owner, repo })).data.default_branch; } catch { /* fallback */ }

      const { data } = await octokit.git.getTree({ owner, repo, tree_sha: defaultBranch, recursive: 'true' });

      // Filter out binary/build artifacts
      const skipped = ['node_modules', 'dist', 'build', '.next', '.git', 'venv', '__pycache__', 'coverage', '.cache'];
      const entries = data.tree
        .filter(t => !skipped.some(dir => t.path?.includes(`${dir}/`) || t.path?.startsWith(`${dir}/`)))
        .map(t => ({ path: t.path, type: t.type, sha: t.sha, size: t.size }));

      res.json({ tree: entries, branch: defaultBranch, totalFiles: entries.length });
    } catch (err) {
      console.error('[GitHub] Failed to get tree:', err.message);
      res.status(500).json({ error: 'Failed to load file tree' });
    }
  });

  // ── Single File Content ───────────────────────────────────────────────
  app.get('/api/github/repos/:owner/:repo/file', async (req, res) => {
    if (!req.cookies.github_token) return res.status(401).json({ error: 'Requires GitHub context' });
    const { owner, repo } = req.params;
    const { path: filePath, sha } = req.query;

    if (!filePath) return res.status(400).json({ error: 'path query parameter required' });

    try {
      const octokit = await getOctokit(req.cookies.github_token);
      if (sha) {
        const { data: blob } = await octokit.git.getBlob({ owner, repo, file_sha: sha });
        const content = Buffer.from(blob.content, 'base64').toString('utf-8');
        return res.json({ path: filePath, content });
      }
      const { data } = await octokit.repos.getContent({ owner, repo, path: filePath });
      if ('content' in data) {
        const content = Buffer.from(data.content, 'base64').toString('utf-8');
        return res.json({ path: filePath, content });
      }
      res.status(400).json({ error: 'Path is a directory, not a file' });
    } catch (err) {
      console.error('[GitHub] File fetch failed:', err.message);
      res.status(404).json({ error: `File not found: ${filePath}` });
    }
  });
}

// ── Utility ─────────────────────────────────────────────────────────────────
function getBaseUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  return `${proto}://${req.get('host')}`;
}
