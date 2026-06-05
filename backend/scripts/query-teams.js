import { Spanner } from '@google-cloud/spanner';

const PROJECT = process.env.GOOGLE_CLOUD_PROJECT;
const INSTANCE = process.env.WC_SPANNER_INSTANCE || 'aura-governance-instance';
const DATABASE = process.env.WC_SPANNER_DATABASE || 'world-cup-db';

const client = new Spanner({ projectId: PROJECT });
const db = client.instance(INSTANCE).database(DATABASE);

async function runQueries() {
  try {
    const [teamRows] = await db.run({
      sql: "SELECT team_code, name, group_letter, fifa_ranking FROM teams WHERE league_id = 'WORLD_CUP'"
    });
    console.log(JSON.stringify(teamRows.map(r => r.toJSON()), null, 2));
  } catch (error) {
    console.error('Query failed:', error);
  } finally {
    await db.close();
  }
}

runQueries();
