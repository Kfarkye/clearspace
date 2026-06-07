import { Spanner } from '@google-cloud/spanner';
import express from 'express';

const spanner = new Spanner({
  projectId: process.env.GOOGLE_CLOUD_PROJECT || 'gen-lang-client-0281999829'
});
const db = spanner.instance('aura-governance-instance').database('sports-db');

export class WorldCupIngestionGateway {
  static async getValidTeamCodes() {
    const [rows] = await db.run({
      sql: "SELECT team_code FROM teams WHERE league_id = 'WORLD_CUP'"
    });
    return new Set(rows.map(r => r.toJSON().team_code));
  }

  static async enforceAndWrite(tableName, rows, validTeamCodes, requiresTeamCode = true) {
    const safeRows = rows.filter(row => {
      if (!row.league_id || row.league_id !== 'WORLD_CUP') return false;
      if (requiresTeamCode && !validTeamCodes.has(row.team_code)) return false;
      return true;
    });

    if (safeRows.length === 0) {
      console.log(`[Gateway] No valid WORLD_CUP rows to insert for ${tableName}.`);
      return 0;
    }

    const table = db.table(tableName);
    await table.upsert(safeRows);
    console.log(`[Gateway] Successfully ingested ${safeRows.length} rows into ${tableName}.`);
    return safeRows.length;
  }

  static async executeReingestion(payloads) {
    console.log('\n=== INITIATING SECURE WORLD CUP INGESTION ===');
    const validTeamCodes = await this.getValidTeamCodes();
    console.log(`[Gateway] Loaded ${validTeamCodes.size} valid WORLD_CUP team codes.`);

    try {
      await this.enforceAndWrite('players', payloads.players || [], validTeamCodes);
      await this.enforceAndWrite('team_power_ratings', payloads.team_power_ratings || [], validTeamCodes);
      await this.enforceAndWrite('team_trends', payloads.team_trends || [], validTeamCodes);
      await this.enforceAndWrite('lineup_projections', payloads.lineup_projections || [], validTeamCodes);
      await this.enforceAndWrite('injury_news', payloads.injury_news || [], validTeamCodes);
      
      const safeHistorical = (payloads.historical_matches || []).filter(row => {
        return row.league_id === 'WORLD_CUP' && 
               validTeamCodes.has(row.home_team_code) && 
               validTeamCodes.has(row.away_team_code);
      });
      
      if (safeHistorical.length > 0) {
        await db.table('historical_matches').insert(safeHistorical);
        console.log(`[Gateway] Successfully ingested ${safeHistorical.length} rows into historical_matches.`);
      }
    } catch (error) {
      console.error('[Gateway] Ingestion Transaction Failed:', error);
      throw error;
    }
  }

  static async runPostIngestVerification() {
    console.log('\n=== POST-INGEST VERIFICATION ===');
    const tables = ['players', 'lineup_projections', 'injury_news', 'team_power_ratings', 'team_trends', 'historical_matches'];
    
    for (const table of tables) {
      const [countRes] = await db.run(`SELECT COUNT(*) as c FROM ${table}`);
      console.log(`${table.padEnd(20)} count: ${countRes[0].toJSON().c}`);
      
      const [distRes] = await db.run(`SELECT league_id, COUNT(*) as c FROM ${table} GROUP BY league_id`);
      console.log(`${table.padEnd(20)} distribution:`, distRes.map(r => r.toJSON()));
    }

    console.log('\n=== RELATIONAL INTEGRITY CHECKS ===');
    const queries = [
      { name: 'Lineups -> Players', sql: "SELECT COUNT(*) as c FROM lineup_projections l LEFT JOIN players p ON l.player_id = p.player_id WHERE p.player_id IS NULL" },
      { name: 'Injuries -> Players', sql: "SELECT COUNT(*) as c FROM injury_news i LEFT JOIN players p ON i.player_id = p.player_id WHERE p.player_id IS NULL" },
      { name: 'Power Ratings -> Teams', sql: "SELECT COUNT(*) as c FROM team_power_ratings tpr LEFT JOIN teams t ON tpr.team_code = t.team_code WHERE t.team_code IS NULL" }
    ];

    let passed = true;
    for (const q of queries) {
      const [res] = await db.run(q.sql);
      const orphans = res[0].toJSON().c;
      const status = orphans === 0 ? '(PASS)' : '(FAIL)';
      console.log(`${q.name.padEnd(25)} Orphan Count: ${orphans} ${status}`);
      if (orphans > 0) passed = false;
    }

    if (passed) {
      console.log('\n[SYSTEM] Verification Passed. Intelligence layers are solid. AURA prediction routing authorized.');
    } else {
      console.error('\n[SYSTEM] Verification Failed. Relational orphans detected. DO NOT AUTHORIZE AURA.');
      throw new Error('Verification Failed. Relational orphans detected.');
    }
  }
}

const app = express();
app.use(express.json());

app.post('/ingest', async (req, res) => {
  try {
    const payload = req.body;
    const mapped = {
      players: [],
      injury_news: [],
      team_power_ratings: [],
      lineup_projections: [],
      team_trends: [],
      historical_matches: []
    };

    const leagueId = payload.tag;
    const timestamp = new Date().toISOString();
    
    for (const e of payload.entities) {
      if (e.type === 'PLAYER') {
        mapped.players.push({
          player_id: e.id,
          name: e.name,
          team_code: e.team_id.replace('TEAM_', ''),
          league_id: leagueId
        });
      } else if (e.type === 'INJURY') {
        mapped.injury_news.push({
          injury_id: e.id,
          player_id: e.player_id,
          team_code: e.team_id.replace('TEAM_', ''),
          status: e.status,
          player_name: e.player_name || 'Unknown',
          league_id: leagueId
        });
      }
    }
    
    await WorldCupIngestionGateway.executeReingestion(mapped);
    await WorldCupIngestionGateway.runPostIngestVerification();
    
    res.status(200).json({ success: true, message: 'Relational integrity verified.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(8080, () => {
  console.log('Ingestion Gateway running on port 8080');
});
