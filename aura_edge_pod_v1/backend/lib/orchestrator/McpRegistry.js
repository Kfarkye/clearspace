import fs from 'fs/promises';
import path from 'path';

export class McpRegistry {
  constructor() { this.contracts = new Map(); }
  async load() {
    const registryPath = path.resolve(process.cwd(), 'backend/contracts/mcp/mcp-registry.json');
    try {
      const registryJson = JSON.parse(await fs.readFile(registryPath, 'utf8'));
      registryJson.forEach(contract => { this.contracts.set(contract.server_id, contract); });
      console.log(`[MCP Registry] Loaded ${this.contracts.size} contracts.`);
    } catch (err) {
      console.error('[MCP Registry] Failed to load registry JSON:', err.message);
      throw err;
    }
  }

  resolve(serverName, toolName, operationName) {
    const contract = this.contracts.get(serverName);
    if (!contract) throw new Error(`MCP_REGISTRY_ERROR: Server '${serverName}' not found in registry.`);
    const tool = contract.allowed_tools.find(t => t.tool === toolName);
    if (!tool) throw new Error(`MCP_REGISTRY_ERROR: Tool '${toolName}' not allowed on server '${serverName}'.`);
    const operation = tool.operations.find(op => op.name === operationName);
    if (!operation) throw new Error(`MCP_REGISTRY_ERROR: Operation '${operationName}' not found for tool '${toolName}'.`);
    if (contract.blocked_operations.includes(operationName)) {
      throw new Error(`MCP_REGISTRY_ERROR: Operation '${operationName}' blocked for '${serverName}'.`);
    }
    return { ...contract, resolvedOperation: operation };
  }

  getEnabledServers() {
    return Array.from(this.contracts.values()).filter(c => c.trust_level === 'approved');
  }
}
