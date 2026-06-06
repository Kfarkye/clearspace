import express from 'express';
import { getAccessToken, getRequestHeaders, extractParams } from '../lib/proxy-utils.js';
import { API_CLIENT_MAP } from '../lib/proxy-clients.js';
import { sessionManager } from '../middleware/auth.js';
import * as sportsDAL from '../lib/sports-dal.js';

export const proxyRouter = express.Router();

const PROXY_HEADER = process?.env?.PROXY_HEADER;

// Note: In Phase 2, we apply express.json() specifically to this proxy route
// to prevent the global body parser from consuming streams for other proxies.
proxyRouter.post('/', express.json({limit: process?.env?.API_PAYLOAD_MAX_SIZE || "7mb"}), async (req, res) => {
  console.log(`[Node Proxy] Received request to /api-proxy. Headers:`, req.headers);

  // Check for session cookie OR proxy header (dev fallback)
  const sessionCookie = req.cookies?.__session;
  let isAuthed = false;

  if (sessionCookie) {
    try {
      const decoded = sessionManager.verifySession(sessionCookie);
      req.userEmail = decoded.email;
      isAuthed = true;
    } catch (err) { /* expired or invalid */ }
  }

  if (!isAuthed && process.env.NODE_ENV !== 'production' && req.headers['x-app-proxy'] === PROXY_HEADER) {
    isAuthed = true;
  }

  if (!isAuthed) {
    return res.status(401).send('Unauthorized: Session required.');
  }

  const { originalUrl, method, headers, body } = req.body;
  if (!originalUrl) {
    return res.status(400).send('Bad Request: originalUrl is required.');
  }

  // 1. Find the matching API client
  const apiClient = API_CLIENT_MAP.find(p => {
    req.extractedParams = extractParams(p.patternInfo, originalUrl);
    return req.extractedParams !== null;
  });

  if (!apiClient) {
    console.error(`[Node Proxy] No API client handler found for URL: ${originalUrl}`);
    return res.status(404).json({ error: `No proxy handler found for URL: ${originalUrl}` });
  }

  const extractedParams = req.extractedParams;
  console.log(`[Node Proxy] Matched API client: ${apiClient.name}`);
  try {
    // 2. Get authenticated access token
    const accessToken = await getAccessToken(res);
    if (!accessToken) return;

    // 3. Build the actual API URL
    const apiUrl = apiClient.getVertexUrl(extractedParams);
    console.log(`[Node Proxy] Proxying to: ${apiUrl}`);

    // ... Note: the rest of the proxy router logic should be moved here ...
    // Since this is a massive block, we will do it incrementally or as requested.
  } catch (error) {
    console.error(`[Node Proxy] Error proxying request for ${apiClient.name}`);
    res.status(500).json({ error: error.message || 'Internal Proxy Error' });
  }
});
