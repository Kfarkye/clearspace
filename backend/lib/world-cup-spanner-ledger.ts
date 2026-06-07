import { Spanner } from '@google-cloud/spanner';

/**
 * AURA Spanner Ingestion Engine
 * Enforces ACID-compliant, high-throughput batch mutations for sports intelligence data.
 */
export class WorldCupSpannerLedger {
  private spanner: Spanner;
  private instanceId: string;
  private databaseId: string;

  constructor(projectId: string, instanceId: string, databaseId: string) {
    this.spanner = new Spanner({ projectId });
    this.instanceId = instanceId;
    this.databaseId = databaseId;
  }

  /**
   * Executes a highly optimized batch mutation to Spanner.
   * Handles chunking to respect Spanner's 20,000 mutation limit per commit.
   */
  public async commitMappedPayload(tableName: string, payloads: Record<string, any>[]): Promise<void> {
    const database = this.spanner.instance(this.instanceId).database(this.databaseId);
    
    // Spanner limit: 20,000 mutations per commit. 
    // We chunk safely at 5,000 to account for wide-column indexing overhead.
    const CHUNK_SIZE = 5000; 
    
    try {
      for (let i = 0; i < payloads.length; i += CHUNK_SIZE) {
        const chunk = payloads.slice(i, i + CHUNK_SIZE);
        await database.table(tableName).upsert(chunk);
      }
    } catch (error) {
      throw new Error(`Spanner Ingestion Fault: ${error instanceof Error ? error.message : 'Unknown Ledger Exception'}`);
    } finally {
      await database.close();
    }
  }
}
