import { WebSocketServer, WebSocket } from 'ws';

export function setupWebSocketProxy(server, config) {
  const { sessionManager, getAccessToken, PROXY_HEADER, GOOGLE_CLOUD_LOCATION, GOOGLE_CLOUD_PROJECT } = config;
  
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', async (request, socket, head) => {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (url.pathname === '/ws-proxy') {

      // 🔒 HARDENED: Authenticate WebSocket upgrades via session cookie
      const cookies = {};
      (request.headers.cookie || '').split(';').forEach(c => {
        const [k, ...v] = c.trim().split('=');
        if (k) cookies[k] = v.join('=');
      });

      const sessionCookie = cookies['__session'];
      let wsAuthed = false;

      if (sessionCookie) {
        try {
          sessionManager.verifySession(sessionCookie);
          wsAuthed = true;
        } catch (err) { /* expired or invalid */ }
      }

      // Dev-only fallback: allow if PROXY_HEADER matches via query param
      if (!wsAuthed && process.env.NODE_ENV !== 'production') {
        const proxyAuth = url.searchParams.get('auth');
        if (proxyAuth === PROXY_HEADER) wsAuthed = true;
      }

      if (!wsAuthed) {
        console.warn('[Node Proxy] WebSocket upgrade rejected: no valid session');
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      
      let targetUrl = url.searchParams.get('target');
      if (!targetUrl) {
        console.log('[Node Proxy] Missing target URL');
        socket.destroy();
        return;
      }

      if (targetUrl === 'wss://aiplatform.googleapis.com//ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent') {
        const location = GOOGLE_CLOUD_LOCATION === 'global' ? 'us-central1' : GOOGLE_CLOUD_LOCATION;
        targetUrl = `wss://${location}-aiplatform.googleapis.com//ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent`;
      } else {
        console.log('[Node Proxy] Invalid target URL');
        socket.destroy();
        return;
      }

      let accessToken;

      try {
        accessToken = await getAccessToken();
        if (!accessToken) throw new Error('No token');
      } catch (err) {
        console.log('[Node Proxy] Authentication failed');
        socket.destroy();
        return;
      }

      console.log(`[Node Proxy] Initiating upstream connection to: ${targetUrl}`);

      let upstreamWs;

      try {
        upstreamWs = new WebSocket(targetUrl, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          }
        });
      } catch (e) {
        console.error('[Node Proxy] Invalid Upstream URL');
        socket.destroy();
        return;
      }

      const initialErrorHandler = (error) => {
        console.error('[Node Proxy] Upstream connection failed:', error);
        upstreamWs.removeListener('open', onUpstreamOpen);

        if (socket.writable) {
          socket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
          socket.destroy();
        }
      };

      upstreamWs.once('error', initialErrorHandler);

      // 5. Handle Successful Upstream Connection
      const onUpstreamOpen = () => {
        // Remove the "bootstrapping" error handler
        upstreamWs.removeListener('error', initialErrorHandler);

        if (socket.destroyed) {
          console.warn('[Node Proxy] Client socket closed before upstream connection opened');
          upstreamWs.close(1000, 'Client disconnected early');
          return;
        }

        // Perform the HTTP -> WebSocket upgrade for the Client
        wss.handleUpgrade(request, socket, head, (ws) => {

          upstreamWs.on('message', (data, isBinary) => {
            const logMsg = isBinary ? '<Binary Data>' : data.toString();
            console.log(`[Upstream -> Client] [${new Date().toISOString()}]: ${logMsg}`);

            if (ws.readyState === WebSocket.OPEN) {
              if (data === undefined || data === null) {
                console.warn('[Node Proxy] Attempted to send undefined/null data to client');
                return;
              }
              ws.send(data, { binary: isBinary });
            }
          });

          ws.on('message', (data, isBinary) => {
            // 🔒 HARDENED: Cap WebSocket message size at 1MB to prevent abuse
            const MAX_WS_MSG_SIZE = 1 * 1024 * 1024; // 1MB
            if (data && data.length > MAX_WS_MSG_SIZE) {
              console.warn(`[Node Proxy] WebSocket message too large (${data.length} bytes). Closing.`);
              ws.close(1009, 'Message too large');
              return;
            }

            const logMsg = isBinary ? '<Binary Data>' : data.toString();

            let dataJson = {};
            try {
              dataJson = JSON.parse(data.toString());
            } catch (error) {
              console.error('[Node Proxy] Failed to parse message from client:', error);
              ws.close(1011, 'Failed to parse message');
            }

            if (dataJson['setup']) {
              dataJson['setup']['model'] = `projects/${GOOGLE_CLOUD_PROJECT}/locations/${GOOGLE_CLOUD_LOCATION}/${dataJson['setup']['model']}`;
            }

            if (upstreamWs.readyState === WebSocket.OPEN) {
              upstreamWs.send(JSON.stringify(dataJson), { binary: false });
            }
          });

          upstreamWs.on('error', (error) => {
            console.error('[Node Proxy] Upstream error:', error);
            const reason = error.message ? error.message.substring(0, 100) : 'Upstream error';
            ws.close(1011, reason);
          });

          upstreamWs.on('close', (code, reason) => {
            console.log(`[Node Proxy] Upstream closed: ${code} ${reason}`);
            if (ws.readyState === WebSocket.OPEN) {
              ws.close(code, reason);
            }
          });

          ws.on('error', (error) => {
            console.error('[Node Proxy] Client error:', error);
            const reason = error.message ? error.message.substring(0, 100) : 'Client error';
            upstreamWs.close(1011, reason);
          });

          ws.on('close', (code, reason) => {
            console.log(`[Node Proxy] Client closed: ${code} ${reason}`);
            if (upstreamWs.readyState === WebSocket.OPEN) {
              upstreamWs.close(1000, reason);
            }
          });

          wss.emit('connection', ws, request);
        });
      };

      upstreamWs.once('open', onUpstreamOpen);

    } else {
      // Path did not match
      socket.destroy();
    }
  });
}
