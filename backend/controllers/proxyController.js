import { GoogleAuth } from 'google-auth-library';
import { classify, getDispatch, MODES } from '../lib/router.js';
import { sessionManager, PROXY_HEADER } from '../middleware/auth.js';
import { deployHtml as deployHtmlService } from '../services/cloudStorageService.js';
import { streamingResilientFetch } from '../lib/resilient-fetch.js';

const GOOGLE_CLOUD_LOCATION = process?.env?.GOOGLE_CLOUD_LOCATION;
const GOOGLE_CLOUD_PROJECT = process?.env?.GOOGLE_CLOUD_PROJECT;
const DEPLOY_BUCKET = process.env.DEPLOY_BUCKET || 'clearspace-artifacts';

export const auth = new GoogleAuth({
  scopes: [
    'https://www.googleapis.com/auth/cloud-platform',
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/tasks.readonly'
  ],
});

export async function getAccessToken(res) {
  try {
    const authClient = await auth.getClient();
    const token = await authClient.getAccessToken();
    return token.token;
  } catch (error) {
    console.error('[Node Proxy] Authentication error:', error);
    if (!res) return null;
    if (error.code === 'ERR_GCLOUD_NOT_LOGGED_IN' || (error.message && error.message.includes('Could not load the default credentials'))) {
      res.status(401).json({
        error: 'Authentication Required',
        message: 'Google Cloud Application Default Credentials not found or invalid. Please run "gcloud auth application-default login" and try again.',
      });
    } else {
      res.status(500).json({ error: `Authentication failed: ${error.message}` });
    }
    return null;
  }
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parsePattern(pattern) {
  const paramRegex = /\{\{(.*?)\}\}/g;
  const params = [];
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = paramRegex.exec(pattern)) !== null) {
    params.push(match[1]);
    const literalPart = pattern.substring(lastIndex, match.index);
    parts.push(escapeRegex(literalPart));
    parts.push(`(?<${match[1]}>[^/]+)`);
    lastIndex = paramRegex.lastIndex;
  }
  parts.push(escapeRegex(pattern.substring(lastIndex)));
  const regexString = parts.join('');

  return {regex: new RegExp(`^${regexString}$`), params};
}

function extractParams(patternInfo, url) {
  const match = url.match(patternInfo.regex);
  if (!match) return null;
  const params = {};
  patternInfo.params.forEach((paramName, index) => {
    params[paramName] = match[index + 1];
  });
  return params;
}

function getRequestHeaders(accessToken) {
  return {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
}

export const API_CLIENT_MAP = [
  {
    name: "VertexGenAi:generateContent",
    patternForProxy: "https://aiplatform.googleapis.com/{{version}}/publishers/google/models/{{model}}:generateContent",
    getApiEndpoint: (context, params) => {
      return `https://aiplatform.clients6.google.com/${params['version']}/projects/${context.projectId}/locations/${context.region}/publishers/google/models/${params['model']}:generateContent`;
    },
    isStreaming: false,
    transformFn: null,
  },
  {
    name: "VertexGenAi:predict",
    patternForProxy: "https://aiplatform.googleapis.com/{{version}}/publishers/google/models/{{model}}:predict",
    getApiEndpoint: (context, params) => {
      return `https://aiplatform.clients6.google.com/${params['version']}/projects/${context.projectId}/locations/${context.region}/publishers/google/models/${params['model']}:predict`;
    },
    isStreaming: false,
    transformFn: null,
  },
  {
    name: "VertexGenAi:streamGenerateContent",
    patternForProxy: "https://aiplatform.googleapis.com/{{version}}/publishers/google/models/{{model}}:streamGenerateContent",
    getApiEndpoint: (context, params) => {
      return `https://aiplatform.clients6.google.com/${params['version']}/projects/${context.projectId}/locations/${context.region}/publishers/google/models/${params['model']}:streamGenerateContent`;
    },
    isStreaming: true,
    transformFn: (response) => {
        let normalizedResponse = response.trim();
        while (normalizedResponse.startsWith(',') || normalizedResponse.startsWith('[')) {
          normalizedResponse = normalizedResponse.substring(1).trim();
        }
        while (normalizedResponse.endsWith(',') || normalizedResponse.endsWith(']')) {
          normalizedResponse = normalizedResponse.substring(0, normalizedResponse.length - 1).trim();
        }

        if (!normalizedResponse.length) {
          return {result: null, inProgress: false};
        }

        if (!normalizedResponse.endsWith('}')) {
          return {result: normalizedResponse, inProgress: true};
        }

        try {
          const parsedResponse = JSON.parse(`${normalizedResponse}`);
          const transformedResponse = `data: ${JSON.stringify(parsedResponse)}\n\n`;
          return {result: transformedResponse, inProgress: false};
        } catch (error) {
          return {result: normalizedResponse, inProgress: true};
        }
    },
  },
  {
    name: "ReasoningEngine:query",
    patternForProxy: "https://{{endpoint_location}}-aiplatform.googleapis.com/{{version}}/projects/{{project_id}}/locations/{{location_id}}/reasoningEngines/{{engine_id}}:query",
    getApiEndpoint: (context, params) => {
      return `https://${params['endpoint_location']}-aiplatform.clients6.google.com/v1beta1/projects/${params['project_id']}/locations/${params['location_id']}/reasoningEngines/${params['engine_id']}:query`;
    },
    isStreaming: false,
    transformFn: null,
  },
  {
    name: "ReasoningEngine:streamQuery",
    patternForProxy: "https://{{endpoint_location}}-aiplatform.googleapis.com/{{version}}/projects/{{project_id}}/locations/{{location_id}}/reasoningEngines/{{engine_id}}:streamQuery",
    getApiEndpoint: (context, params) => {
      return `https://${params['endpoint_location']}-aiplatform.clients6.google.com/v1beta1/projects/${params['project_id']}/locations/${params['location_id']}/reasoningEngines/${params['engine_id']}:streamQuery`;
    },
    isStreaming: true,
    transformFn: null,
  },
].map((client) => ({ ...client, patternInfo: parsePattern(client.patternForProxy) }));

// ── Classification Cache (bounded, prevents redundant LLM calls) ────────────
const classificationCache = new Map();
const CACHE_LIMIT = 1000;

export const getRouterModes = (req, res) => {
  res.json({ modes: MODES });
};

export const classifyIntent = async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'message is required' });

  try {
    const accessToken = await getAccessToken();
    if (!accessToken) return res.status(500).json({ error: 'Failed to get access token' });

    const vertexFetch = async (body, model) => {
      const url = `https://aiplatform.clients6.google.com/v1beta1/projects/${GOOGLE_CLOUD_PROJECT}/locations/${GOOGLE_CLOUD_LOCATION}/publishers/google/models/${model}:generateContent`;
      return fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    };

    const result = await classify(message, { vertexFetch });
    const dispatch = getDispatch(result.mode);

    console.log(`[Router] Classified "${message.slice(0, 60)}..." → ${result.mode} (autoRouted: ${result.autoRouted})`);
    res.json({
      mode: result.mode,
      autoRouted: result.autoRouted,
      systemPrompt: dispatch.systemPrompt,
      temperature: dispatch.temperature,
      thinkingMode: dispatch.thinkingMode,
      thinkingBudget: dispatch.thinkingBudget,
    });
  } catch (err) {
    console.error('[Router] Classification error:', err.message);
    const fallback = getDispatch('chat');
    res.json({
      mode: 'chat',
      autoRouted: false,
      systemPrompt: fallback.systemPrompt,
      temperature: fallback.temperature,
      thinkingMode: fallback.thinkingMode,
      thinkingBudget: fallback.thinkingBudget,
    });
  }
};

export const youtubeProxy = async (req, res) => {
  const query = req.query.q;
  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'Missing ?q= parameter' });
  }

  try {
    let ytSearch;
    try {
      ytSearch = (await import('yt-search')).default;
    } catch {
      return res.status(501).json({ error: 'yt-search not installed' });
    }

    const result = await ytSearch(query.trim());
    const videos = result.videos.slice(0, 5).map(v => ({
      title: v.title,
      url: v.url,
      thumbnail: v.thumbnail,
      author: v.author?.name,
      duration: v.timestamp,
    }));

    res.json(videos);
  } catch (error) {
    console.error('[API] YouTube search error:', error.message);
    res.status(500).json({ error: 'YouTube search failed' });
  }
};

export const deployHtml = async (req, res) => {
  try {
    const { html, title } = req.body;
    const result = await deployHtmlService(html, title);
    res.json(result);
  } catch (err) {
    console.error('[Deploy] Failed:', err.message);
    res.status(err.message.includes('limit') || err.message.includes('required') ? 400 : 500).json({ error: err.message || 'Deployment failed.' });
  }
};

export const vertexProxy = async (req, res) => {
  console.log(`[Node Proxy] Received request to /api-proxy. Headers:`, req.headers);
  console.log(`[Node Proxy] PROXY_HEADER configured as: "${PROXY_HEADER}", Received x-app-proxy: "${req.headers['x-app-proxy']}"`);

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
    const accessToken = await getAccessToken(res);
    if (!accessToken) return;

    const context = {projectId: GOOGLE_CLOUD_PROJECT, region: GOOGLE_CLOUD_LOCATION};
    const apiUrl = apiClient.getApiEndpoint(context, extractedParams);
    console.log(`[Node Proxy] Forwarding to Vertex API: ${apiUrl}`);

    if (apiClient?.name?.startsWith('VertexGenAi:') && body?.contents) {
      try {
        const lastUserMsg = [...body.contents].reverse().find(c => c.role === 'user');
        const userText = lastUserMsg?.parts?.find(p => p.text && !p.inlineData)?.text?.trim();

        if (userText && userText.length > 8) {
          let classification = classificationCache.get(userText);

          if (!classification) {
            const vertexFetch = async (classifyBody, model) => {
              const classifyUrl = `https://aiplatform.clients6.google.com/v1beta1/projects/${GOOGLE_CLOUD_PROJECT}/locations/${GOOGLE_CLOUD_LOCATION}/publishers/google/models/${model}:generateContent`;
              return fetch(classifyUrl, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(classifyBody),
              });
            };

            classification = await classify(userText, { vertexFetch });

            if (classificationCache.size >= CACHE_LIMIT) {
              classificationCache.clear();
            }
            classificationCache.set(userText, classification);
          }

          const { mode, autoRouted } = classification;

          if (autoRouted && mode !== 'chat') {
            const dispatch = getDispatch(mode);
            const existingParts = body.systemInstruction?.parts || [];

            body.systemInstruction = {
              role: 'system',
              parts: [
                { text: `${dispatch.systemPrompt}\n\n` },
                ...existingParts
              ]
            };

            console.log(`[Router] Auto-routed → ${mode} (respected frontend temp/thinking configs)`);
          }
        }
      } catch (routerErr) {
        console.warn(`[Router] Classification failed, proceeding unmodified: ${routerErr.message}`);
      }
    }

    const apiHeaders = getRequestHeaders(accessToken);

    const apiFetchOptions = {
      method: method || 'POST',
      headers: {...apiHeaders, ...headers},
      body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
    };

    const apiResponse = await streamingResilientFetch(apiUrl, apiFetchOptions);

    if (apiClient.isStreaming) {
      console.log(`[Node Proxy] Sending STREAMING response for ${apiClient.name}`);
      res.writeHead(apiResponse.status, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
      });
      res.flushHeaders();

      if (!apiResponse.body) {
        console.error('[Node Proxy] Streaming response has no body.');
        return res.end(JSON.stringify({ error: 'Streaming response body is null' }));
      }

      const { Readable } = await import('stream');
      const nodeStream = Readable.fromWeb(apiResponse.body);

      const decoder = new TextDecoder();
      let deltaChunk = '';
      nodeStream.on('data', (encodedChunk) => {
        if (res.writableEnded) return;

        try {
          if (!apiClient.transformFn) {
            res.write(encodedChunk);
          } else {
            const decodedChunk = decoder.decode(encodedChunk, { stream: true });
            deltaChunk = deltaChunk + decodedChunk;

            const {result, inProgress} = apiClient.transformFn(deltaChunk);
            if (result && !inProgress) {
              deltaChunk = '';
              res.write(new TextEncoder().encode(result));
            }
          }
        } catch (error) {
          console.error(`[Node Proxy] Error processing streaming response for ${apiClient.name}`);
          console.error(error);
        }
      });

      nodeStream.on('end', () => {
        deltaChunk = '';
        console.log(`[Node Proxy] Vertex stream finished and all data processed for ${apiClient.name}`);
        res.end();
      });

      nodeStream.on('error', (streamError) => {
        console.error('[Node Proxy] Error from Vertex stream:', streamError);
        if (!res.writableEnded) {
          res.end(JSON.stringify({ proxyError: 'Stream error from Vertex AI', details: streamError.message }));
        }
      });

      res.on('error', (resError) => {
        console.error('[Node Proxy] Error writing to client response:', resError);
        if (nodeStream && typeof nodeStream.destroy === 'function') {
             nodeStream.destroy(resError);
        }
      });
    } else {
      console.log(`[Node Proxy] Sending JSON response for ${apiClient.name}`);
      const data = await apiResponse.json();
      res.status(apiResponse.status).json(data);
    }
  } catch (error) {
    console.error(`[Node Proxy] Error proxying request for ${apiClient.name}`);
    console.error(error)
    res.status(500).json({ error: error.message || 'Internal Proxy Error' });
  }
};
