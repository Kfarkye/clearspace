// pipeline module: provenance.ts
import { Database } from '@google-cloud/spanner';
import { NormalizedEntity } from './normalize.js';
import { FieldProvenance } from '../schemas/source.schema.js';

export interface MergedEntity {
  entityType: string;
  entityId: string;
  fields: Record<string, any>;
  provenance: Record<string, FieldProvenance>;
}

/**
 * Resolves the merged entity by comparing incoming fields and their provenance confidence
 * against existing database records. Adheres to: "Do not overwrite a verified source with a weaker source".
 */
export async function mergeProvenance(
  db: Database,
  incoming: NormalizedEntity
): Promise<MergedEntity> {
  const mergedFields: Record<string, any> = { ...incoming.fields };
  const mergedProvenance: Record<string, FieldProvenance> = { ...incoming.provenance };

  let existingRow: any = null;

  try {
    // 1. Try to read the existing record from Spanner to fetch its current columns and provenance
    let tableName = '';
    let keyColumn = '';
    let columns: string[] = [];

    switch (incoming.entityType) {
      case 'team':
        tableName = 'teams';
        keyColumn = 'team_code';
        columns = ['team_code', 'manager', 'world_cup_history', 'logo_url', 'provenance'];
        break;
      case 'venue':
        tableName = 'venues';
        keyColumn = 'venue_id';
        columns = ['venue_id', 'capacity', 'latitude', 'longitude', 'timezone', 'provenance'];
        break;
      case 'match':
        tableName = 'matches';
        keyColumn = 'match_id';
        columns = ['match_id', 'status', 'home_score', 'away_score', 'provenance'];
        break;
      case 'player':
        tableName = 'players';
        // Note: players has a composite PK (team_code, player_id)
        // We'll query using executeSql to be safe
        break;
      default:
        // Odds and other transient tables don't need historical field-level provenance merging
        return {
          entityType: incoming.entityType,
          entityId: incoming.entityId,
          fields: incoming.fields,
          provenance: incoming.provenance,
        };
    }

    if (tableName && keyColumn) {
      let sql = `SELECT ${columns.join(', ')} FROM ${tableName} WHERE ${keyColumn} = @id`;
      const params: any = { id: incoming.entityId };
      if (tableName !== 'venues') {
        sql += ` AND league_id = @leagueId`;
        params.leagueId = 'WORLD_CUP';
      }
      const [rows] = await db.run({
        sql,
        params
      });
      if (rows.length > 0) {
        existingRow = rows[0].toJSON();
      }
    } else if (incoming.entityType === 'player') {
      const sql = `SELECT * FROM players WHERE league_id = @leagueId AND player_id = @id`;
      const [rows] = await db.run({
        sql,
        params: { id: incoming.entityId, leagueId: 'WORLD_CUP' }
      });
      if (rows.length > 0) {
        existingRow = rows[0].toJSON();
      }
    }
  } catch (err: any) {
    console.warn(`  [Provenance Warning] Failed to read existing row for ${incoming.entityType} ${incoming.entityId}: ${err.message}. Assuming clean write.`);
  }

  // 2. Perform field-level merging if an existing row with provenance exists
  if (existingRow) {
    let existingProvenance: Record<string, FieldProvenance> = {};
    if (existingRow.provenance) {
      try {
        existingProvenance = typeof existingRow.provenance === 'string'
          ? JSON.parse(existingRow.provenance)
          : existingRow.provenance;
      } catch {
        existingProvenance = {};
      }
    }

    // Iterate over all incoming fields
    Object.keys(incoming.fields).forEach(key => {
      const incomingProv = incoming.provenance[key];
      const existingProv = existingProvenance[key];

      if (existingProv && existingRow[key] !== undefined) {
        // Core rule: If the database value has higher confidence, reject the update
        if (existingProv.confidence > incomingProv.confidence) {
          console.log(`  [Provenance Block] Retaining high-confidence field "${key}" (${existingProv.confidence} from ${existingProv.sourceName}) over incoming (${incomingProv.confidence} from ${incomingProv.sourceName}) for ${incoming.entityId}`);
          mergedFields[key] = existingRow[key];
          mergedProvenance[key] = existingProv;
        }
      }
    });
  }

  return {
    entityType: incoming.entityType,
    entityId: incoming.entityId,
    fields: mergedFields,
    provenance: mergedProvenance,
  };
}
export async function executeProvenanceMerge(
  db: Database,
  entities: NormalizedEntity[]
): Promise<MergedEntity[]> {
  console.log('🔄 [Pipeline: Provenance] Resolving field-level confidence conflicts...');
  
  // Use Promise.all to run in parallel and avoid sequential roundtrip latency
  const merged = await Promise.all(
    entities.map(ent => mergeProvenance(db, ent))
  );

  console.log('✅ [Pipeline: Provenance] Resolution phase complete.');
  return merged;
}
