import { Spanner } from '@google-cloud/spanner';
import fs from 'fs';

const PROJECT = process.env.GOOGLE_CLOUD_PROJECT || 'gen-lang-client-0281999829';
const INSTANCE = 'aura-governance-instance';
const DATABASE = 'sports-db';

const client = new Spanner({ projectId: PROJECT });
const db = client.instance(INSTANCE).database(DATABASE);

async function runDiagnostic() {
  let auditResults = {
    phase3_lineups: [],
    phase4_injuries: {
      total_rows: 0,
      stale_count: 0,
      conflicts: []
    },
    phase5_variance: []
  };

  try {
    console.log('Running Phase 3...');
    // --- PHASE 3: ROSTER & LINEUP REFERENTIAL VALIDATION ---
    const [recentMatches] = await db.run(`
      SELECT match_id, MAX(updated_at) as max_time
      FROM lineup_projections 
      GROUP BY match_id 
      ORDER BY max_time DESC 
      LIMIT 3
    `);
    
    for (const m of recentMatches) {
      const matchId = m.toJSON().match_id;
      const [lineups] = await db.run({
        sql: `SELECT * FROM lineup_projections WHERE match_id = @id`,
        params: { id: matchId }
      });
      
      let checked = 0;
      let matched = 0;
      let unmatched = [];

      const checks = lineups.map(async player => {
        const name = player.toJSON().player_name;
        const [pMatch] = await db.run({
          sql: `SELECT player_id FROM players WHERE name = @n AND team_code = @t`,
          params: { n: name, t: player.toJSON().team_code }
        });
        return { name, found: pMatch.length > 0 };
      });
      
      const results = await Promise.all(checks);
      results.forEach(r => {
        checked++;
        if (r.found) matched++;
        else unmatched.push(r.name);
      });
      
      auditResults.phase3_lineups.push({
        match_id: matchId,
        projected_players_checked: checked,
        matched_in_players_table: matched,
        unmatched_players: unmatched
      });
    }

    console.log('Running Phase 4...');
    // --- PHASE 4: TEMPORAL & LOGICAL CONFLICT RESOLUTION ---
    const [injuries] = await db.run(`SELECT * FROM injury_news`);
    auditResults.phase4_injuries.total_rows = injuries.length;
    
    let staleCount = 0;
    const conflictChecks = injuries.map(async injRow => {
      const inj = injRow.toJSON();
      if (!inj.updated_at || (!inj.source && !inj.provenance)) {
        staleCount++;
      }
      const [conflict] = await db.run({
        sql: `SELECT match_id FROM lineup_projections WHERE player_name = @n AND team_code = @t AND is_projected_starter = true`,
        params: { n: inj.player_name, t: inj.team_code }
      });
      if (conflict.length > 0) {
        return `Player ${inj.player_name} is marked as injured (${inj.status}) but is in a projected XI.`;
      }
      return null;
    });
    
    const conflictResults = await Promise.all(conflictChecks);
    auditResults.phase4_injuries.conflicts = conflictResults.filter(Boolean);
    auditResults.phase4_injuries.stale_count = staleCount;

    console.log('Running Phase 5...');
    // --- PHASE 5: VARIANCE ENGINE SMOKE TEST ---
    const [variance] = await db.run(`
      SELECT 
        o.match_id, 
        CONCAT(m.home_team_code, ' vs ', m.away_team_code) as teams,
        (ph.rating - pa.rating) as rating_delta,
        o.team_code as market_selection, 
        o.american_odds as odds,
        o.implied_probability
      FROM odds o
      JOIN matches m ON o.match_id = m.match_id
      LEFT JOIN team_power_ratings ph ON ph.team_code = m.home_team_code AND ph.league_id = m.league_id
      LEFT JOIN team_power_ratings pa ON pa.team_code = m.away_team_code AND pa.league_id = m.league_id
      WHERE o.market_type = '3way_moneyline' AND o.team_code != 'DRAW'
      ORDER BY ABS((ph.rating - pa.rating) * 0.01 - COALESCE(o.implied_probability, 0)) DESC
      LIMIT 5
    `);
    
    auditResults.phase5_variance = variance.map(v => {
      let row = v.toJSON();
      row.DiagnosticReason = "High rating delta vs. implied probability";
      return row;
    });

  } catch (err) {
    auditResults.error = err.message;
  } finally {
    await db.close();
    fs.writeFileSync('aura_audit_payload.json', JSON.stringify(auditResults, null, 2));
    console.log('Saved payload to aura_audit_payload.json');
  }
}

runDiagnostic();
