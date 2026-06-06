import WebSocket from 'ws';
import { PubSub } from '@google-cloud/pubsub';
import { Spanner } from '@google-cloud/spanner';

// Instantiate Google Cloud Platform Clients
const pubSubClient = new PubSub();
const spanner = new Spanner({ projectId: process.env.GOOGLE_CLOUD_PROJECT });
const database = spanner.instance(process.env.SPANNER_INSTANCE_ID || 'aura-core').database(process.env.SPANNER_DATABASE_ID || 'sports-ledger');

export interface OddsStreamConfig {
  streamUrl: string;
  apiKey: string;
  pubSubTopicName: string;
  heartbeatIntervalMs?: number;
  maxReconnectDelayMs?: number;
  useSpannerMutations?: boolean;
}

export class OddsStreamManager {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private readonly config: OddsStreamConfig;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private isShuttingDown = false;
  private topic;

  constructor(config: OddsStreamConfig) {
    this.config = {
      heartbeatIntervalMs: 30000,
      maxReconnectDelayMs: 60000,
      useSpannerMutations: false,
      ...config,
    };
    this.topic = pubSubClient.topic(this.config.pubSubTopicName);
  }

  /**
   * Initializes the WebSocket connection to the odds provider.
   * Utilizes an AbortSignal to gracefully terminate during edge shutdowns or network partitions.
   */
  public connect(signal?: AbortSignal): void {
    if (this.isShuttingDown) return;

    if (signal?.aborted) {
      console.warn('[OddsStreamManager] Connect aborted by external signal.');
      return;
    }

    signal?.addEventListener('abort', () => this.shutdown());

    try {
      this.ws = new WebSocket(this.config.streamUrl, {
        headers: { Authorization: \`Bearer \${this.config.apiKey}\` }
      });

      this.ws.on('open', this.handleOpen.bind(this));
      this.ws.on('message', this.handleMessage.bind(this));
      this.ws.on('close', this.handleClose.bind(this));
      this.ws.on('error', this.handleError.bind(this));
      this.ws.on('ping', this.handlePing.bind(this));
    } catch (error) {
      console.error('[OddsStreamManager] Failed to initialize WebSocket connection:', error);
      this.scheduleReconnect();
    }
  }

  private handleOpen(): void {
    console.log('[OddsStreamManager] Connected to high-frequency odds feed.');
    this.reconnectAttempts = 0;
    this.startHeartbeat();
  }

  /**
   * Processes incoming live odds and writes them to Google Cloud.
   * Either emits to Pub/Sub for event-driven downstream consumption, or writes 
   * directly to Spanner using bulk Mutations for ultra-fast, globally consistent state.
   */
  private async handleMessage(data: WebSocket.Data): Promise<void> {
    try {
      const payload = JSON.parse(data.toString());
      if (payload.type === 'heartbeat') return;

      if (payload.events && Array.isArray(payload.events)) {
        
        if (this.config.useSpannerMutations) {
          // Route 1: Direct to Spanner via highly optimized Mutations (insertOrUpdate)
          const table = database.table('LiveOddsState');
          const mutations = payload.events.map((event: any) => ({
            GameId: event.gameId,
            LastUpdated: Spanner.timestamp(new Date()),
            OddsPayload: JSON.stringify(event.odds)
          }));
          
          await table.upsert(mutations);

        } else {
          // Route 2: Fire-and-forget Pub/Sub event streaming
          const publishPromises = payload.events.map((event: any) => {
            const dataBuffer = Buffer.from(JSON.stringify(event));
            return this.topic.publishMessage({ 
              data: dataBuffer, 
              attributes: { gameId: event.gameId } 
            });
          });
          
          await Promise.all(publishPromises);
        }
      }
    } catch (error) {
      console.error('[OddsStreamManager] Unhandled payload structure or GCP execution failed:', error);
    }
  }

  private handlePing(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.pong();
    }
  }

  private handleClose(): void {
    this.stopHeartbeat();
    this.ws = null;
    if (!this.isShuttingDown) {
      this.scheduleReconnect();
    }
  }

  private handleError(error: Error): void {
    console.error('[OddsStreamManager] WebSocket network error:', error.message);
  }

  /**
   * Implements exponential backoff for connection resilience.
   */
  private scheduleReconnect(): void {
    const delay = Math.min(
      1000 * Math.pow(2, this.reconnectAttempts),
      this.config.maxReconnectDelayMs!
    );
    this.reconnectAttempts++;
    console.log(\`[OddsStreamManager] Reconnecting in \${delay}ms (Attempt \${this.reconnectAttempts})...\`);
    setTimeout(() => this.connect(), delay);
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.ping();
      } else {
        this.ws?.terminate();
      }
    }, this.config.heartbeatIntervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Provides a clean teardown sequence to prevent memory leaks in the Node environment.
   */
  public shutdown(): void {
    this.isShuttingDown = true;
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.terminate();
      this.ws = null;
    }
  }
}
