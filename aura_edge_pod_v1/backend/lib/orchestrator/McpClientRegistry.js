import { Client } from '@modelcontextprotocol/sdk/client/index.js';

export class McpClientRegistry {
  constructor() { this.clients = new Map(); }

  async connectAll(servers) {
    for (const server of servers) {
      if (this.clients.has(server.server_id)) continue;
      try {
        const client = new Client({ name: `aura-${server.server_id}-client`, version: '1.0.0' }, { capabilities: {} });
        const timeoutMs = server.timeout_ms || 10000;

        client.callTool = async (req) => {
          if (process.env.NODE_ENV === 'production') {
            if (!server.endpoint_url) throw new Error(`UNAVAILABLE: MCP server endpoint missing for ${server.name}`);
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs);
            try {
              const response = await fetch(server.endpoint_url, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jsonrpc: '2.0', method: req.name, params: req.arguments, id: 1 }),
                signal: controller.signal
              });
              if (!response.ok) throw new Error(`Upstream MCP fetch failed: ${response.status} ${response.statusText}`);
              const data = await response.json();
              if (data.error) throw new Error(`MCP error: ${data.error.message}`);
              return { content: [{ text: JSON.stringify(data.result) }] };
            } catch (err) {
              if (err.name === 'AbortError') throw new Error(`UNAVAILABLE: MCP server ${server.name} timed out after ${timeoutMs}ms`);
              throw err;
            } finally {
              clearTimeout(timer);
            }
          } else {
            return { content: [{ text: JSON.stringify({ status: "mock_success", tool: req.name, args: req.arguments }) }] };
          }
        };

        this.clients.set(server.server_id, client);
        if (process.env.NODE_ENV === 'production' && server.endpoint_url) {
          console.log(`[MCP Client] Bound transport to ${server.name} at ${server.endpoint_url}`);
        }
      } catch (error) {
        console.error(`[MCP Client] Failed to bind ${server.name}: ${error}`);
      }
    }
  }

  get(serverName) {
    const client = this.clients.get(serverName);
    if (!client) throw new Error(`MCP_CLIENT_ERROR: Client for '${serverName}' not connected.`);
    return client;
  }
}
