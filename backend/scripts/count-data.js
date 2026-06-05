import { Spanner } from '@google-cloud/spanner';

const PROJECT = process.env.GOOGLE_CLOUD_PROJECT;
const INSTANCE = 'aura-governance-instance';

async function inspect(dbName) {
  console.log(`\n=== Inspecting Database: ${dbName} ===`);
  const client = new Spanner({ projectId: PROJECT });
  const db = client.instance(INSTANCE).database(dbName);
  
  try {
    const [leagues] = await db.run('SELECT league_id, COUNT(*) as count FROM leagues GROUP BY league_id');
    console.log('Leagues:');
    leagues.forEach(l => console.log(` - ${l.toJSON().league_id}: ${l.toJSON().count}`));

    const [teams] = await db.run('SELECT league_id, COUNT(*) as count FROM teams GROUP BY league_id');
    console.log('Teams:');
    teams.forEach(t => console.log(` - ${t.toJSON().league_id}: ${t.toJSON().count}`));

    const [matches] = await db.run('SELECT league_id, COUNT(*) as count FROM matches GROUP BY league_id');
    console.log('Matches:');
    matches.forEach(m => console.log(` - ${m.toJSON().league_id}: ${m.toJSON().count}`));

    const [odds] = await db.run('SELECT league_id, COUNT(*) as count FROM odds GROUP BY league_id');
    console.log('Odds:');
    odds.forEach(o => console.log(` - ${o.toJSON().league_id}: ${o.toJSON().count}`));
  } catch (err) {
    console.error(`Error inspecting ${dbName}:`, err.message);
  } finally {
    await db.close();
  }
}

async function main() {
  await inspect('world-cup-db');
  await inspect('sports-db');
}

main().catch(console.error);
