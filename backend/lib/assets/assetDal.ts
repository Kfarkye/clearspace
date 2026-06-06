/**
 * @file assetDal.ts
 * @description Data access layer for the Spanner Asset Ledger. 
 * Handles transactional inserts of assets and their interleaved children.
 */

import { Database } from '@google-cloud/spanner';
import { SpannerAsset, AssetSource, AssetRender, AssetAction } from './assetSchema.js';

export class AssetDal {
  private database: Database;

  constructor(database: Database) {
    this.database = database;
  }

  /**
   * Inserts a fully formed asset and its interleaved children in a single transaction.
   * 
   * @param asset The complete asset object including sources, renders, and actions.
   * @returns A promise resolving to the inserted assetId.
   */
  public async createAsset(asset: SpannerAsset): Promise<string> {
    if (!asset.assetId) {
      throw new Error('assetId is required for creation');
    }

    try {
      await this.database.runTransactionAsync(async (transaction) => {
        // 1. Insert parent asset
        transaction.insert('assets', {
          asset_id: asset.assetId,
          type: asset.type,
          status: asset.status,
          title: asset.title,
          summary: asset.summary || null,
          owner_user_id: asset.ownerUserId || null,
          source_session_id: asset.sourceSessionId || null,
          schema_version: asset.schemaVersion,
          payload_hash: asset.payloadHash,
          payload: asset.payload, // Spanner NodeJS client serializes objects to JSON automatically
          tags: asset.tags || [],
          embedding: asset.embedding || null,
          created_at: 'spanner.commit_timestamp()',
          updated_at: 'spanner.commit_timestamp()',
          expires_at: asset.expiresAt ? new Date(asset.expiresAt) : null,
        });

        // 2. Insert sources (Grounded Search, APIs, etc.)
        if (asset.sources && asset.sources.length > 0) {
          const sourceRows = asset.sources.map((source: AssetSource) => ({
            asset_id: asset.assetId,
            source_id: source.sourceId,
            source_type: source.sourceType,
            title: source.title || null,
            url: source.url || null,
            publisher: source.publisher || null,
            accessed_at: new Date(source.accessedAt),
            content_hash: source.contentHash || null,
          }));
          transaction.insert('asset_sources', sourceRows);
        }

        // 3. Insert renders (HTML deploy, Google Docs, PDFs)
        if (asset.renders && asset.renders.length > 0) {
          const renderRows = asset.renders.map((render: AssetRender) => ({
            asset_id: asset.assetId,
            render_id: render.renderId,
            render_type: render.renderType,
            status: render.status,
            url: render.url || null,
            external_id: render.externalId || null,
            created_at: 'spanner.commit_timestamp()',
            error_message: render.errorMessage || null,
          }));
          transaction.insert('asset_renders', renderRows);
        }

        // 4. Insert initial actions (if any exist on creation)
        if (asset.actions && asset.actions.length > 0) {
          const actionRows = asset.actions.map((action: AssetAction) => ({
            asset_id: asset.assetId,
            action_id: action.actionId,
            action_type: action.actionType,
            status: action.status,
            approved_by_user_id: action.approvedByUserId || null,
            input_hash: action.inputHash || null,
            external_id: action.externalId || null,
            created_at: 'spanner.commit_timestamp()',
            result: action.result || null,
            error_message: action.errorMessage || null,
          }));
          transaction.insert('asset_actions', actionRows);
        }

        await transaction.commit();
      });

      return asset.assetId;
    } catch (error) {
      console.error(`Failed to insert asset ${asset.assetId}:`, error);
      throw error;
    }
  }

  /**
   * Fetches an asset and all its children via Spanner's interleaved join optimization.
   * 
   * @param assetId The unique identifier of the asset
   * @returns The assembled SpannerAsset object or null if not found
   */
  public async getAsset(assetId: string): Promise<SpannerAsset | null> {
    const query = {
      sql: `
        SELECT 
          a.asset_id, a.type, a.status, a.title, a.summary, a.owner_user_id,
          a.source_session_id, a.schema_version, a.payload_hash, a.payload,
          a.tags, a.created_at, a.updated_at, a.expires_at,
          ARRAY(SELECT AS STRUCT * FROM asset_sources s WHERE s.asset_id = a.asset_id) as sources,
          ARRAY(SELECT AS STRUCT * FROM asset_renders r WHERE r.asset_id = a.asset_id) as renders,
          ARRAY(SELECT AS STRUCT * FROM asset_actions act WHERE act.asset_id = a.asset_id) as actions
        FROM assets a
        WHERE a.asset_id = @assetId
      `,
      params: { assetId },
    };

    try {
      const [rows] = await this.database.run(query);
      if (rows.length === 0) return null;

      const row = rows[0].toJSON();
      
      return {
        assetId: row.asset_id,
        type: row.type as any,
        status: row.status as any,
        title: row.title,
        summary: row.summary,
        ownerUserId: row.owner_user_id,
        sourceSessionId: row.source_session_id,
        schemaVersion: row.schema_version,
        payloadHash: row.payload_hash,
        payload: row.payload,
        tags: row.tags || [],
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        expiresAt: row.expires_at,
        sources: row.sources || [],
        renders: row.renders || [],
        actions: row.actions || []
      };
    } catch (error) {
      console.error(`Failed to fetch asset ${assetId}:`, error);
      throw error;
    }
  }
}
