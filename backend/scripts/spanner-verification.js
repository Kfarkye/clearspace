import { Spanner } from '@google-cloud/spanner';

const spanner = new Spanner({
  projectId: process.env.GOOGLE_CLOUD_PROJECT || 'gen-lang-client-0281999829'
});

const db = spanner
  .instance('aura-governance-instance')
  .database('sports-db');

async function run(sql) {
  const [rows] = await db.run(sql);
  return rows.map(row => row.toJSON());
}

async function main() {
  const tables = [
    'teams',
    'players',
    'matches',
    'odds',
    'lineup_projections',
    'injury_news',
    'team_power_ratings',
    'team_trends',
    'historical_matches',
    'venues'
  ];

  console.log('\n=== POST-PURGE SPANNER VERIFICATION ===\n');
  for (const table of tables) {
    try {
      const rows = await run(`SELECT COUNT(*) AS count FROM ${table}`);
      console.log(`${table}: ${rows[0].count}`);
    } catch (err) {
      console.log(`Skipping count for ${table}: ${err.message}`);
    }
  }

  console.log('\n=== LEAGUE DISTRIBUTION ===\n');
  for (const table of tables.filter(t => t !== 'venues')) {
    try {
      const rows = await run(`
        SELECT league_id, COUNT(*) AS count
        FROM ${table}
        GROUP BY league_id
        ORDER BY count DESC
      `);
      console.log(`\n${table}`);
      console.table(rows);
    } catch (err) {
      console.log(`Skipping distribution for ${table}: ${err.message}`);
    }
  }

  console.log('\n=== WORLD_CUP SAMPLE ROWS ===\n');
  for (const table of [
    'teams',
    'players',
    'matches',
    'odds',
    'team_power_ratings',
    'lineup_projections'
  ]) {
    try {
      const rows = await run(`
        SELECT *
        FROM ${table}
        WHERE league_id = 'WORLD_CUP'
        LIMIT 10
      `);
      console.log(`\n${table}`);
      console.table(rows);
    } catch (err) {
      console.log(`Skipping sample for ${table}: ${err.message}`);
    }
  }

  console.log('\n=== VERDICT ===');
  console.log('Awaiting output to determine if topology is intact, hollowed, or requires restore.');
  
  await db.close();
}

main().catch(err => {
  console.error('Fatal Spanner Error:', err);
  process.exit(1);
});
