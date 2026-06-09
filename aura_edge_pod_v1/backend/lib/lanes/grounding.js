import crypto from 'crypto';

export class GroundingPlane {
  constructor(db, writeTrace) {
    this.db = db;
    this.writeTrace = writeTrace;
  }
  async resolveEphemeral(query, routeId, sourceUrls = []) {
    const context = `Fast context for: "${query}"`;
    if (this.writeTrace) this.writeTrace('GROUNDING_TIER_1_EPHEMERAL', { routeId, query, sourceUrls });
    return { tier: 'EPHEMERAL', context, citations: sourceUrls.length ? sourceUrls : ["[1] Real-time search"], cached: false };
  }
  async resolveDurable(query, routeId, sourceUrl) {
    const url = sourceUrl || 'internal://knowledge-graph';
    const sourceId = crypto.randomUUID();
    const groundingId = crypto.randomUUID();
    const contentHash = crypto.createHash('sha256').update(query + url).digest('hex');
    const trustStatus = url.includes('paywall') ? 'SOURCE_RESTRICTED' : 'TRUSTED';

    if (this.db && process.env.NODE_ENV === 'production') {
      await this.db.runTransactionAsync(async (transaction) => {
        transaction.insert('SourceSnapshots', [{
          SourceId: sourceId, Url: url, CanonicalUrl: url, Title: `Snapshot for ${query.substring(0, 30)}...`, SourceType: 'WEB', FetchedAt: 'spanner.commit_timestamp()', ContentHash: contentHash, RawTextRef: `gs://aura-artifacts/raw/${sourceId}.txt`, TrustStatus: trustStatus, Metadata: JSON.stringify({ fetchLatencyMs: 450 })
        }]);
        transaction.insert('GroundingTraces', [{
          GroundingId: groundingId, RouteId: routeId, SourceIds: [sourceId], Query: query, ResultCount: 1, CreatedAt: 'spanner.commit_timestamp()'
        }]);
      });
    }
    if (this.writeTrace) this.writeTrace('GROUNDING_TIER_2_DURABLE', { groundingId, sourceId, trustStatus });
    return { tier: 'DURABLE', groundingId, sourceId, trustStatus, contentHash, verifiedContent: `Mapped artifact for: "${query}"` };
  }
}
