import { Spanner } from '@google-cloud/spanner';
async function run() {
  const spanner = new Spanner({ projectId: process.env.GOOGLE_CLOUD_PROJECT || 'gen-lang-client-0281999829' });
  const instance = spanner.instance('clearspace');
  const database = instance.database('clearspace-db');
  try {
    const [rows] = await database.run({ sql: "SELECT column_name, spanner_type FROM information_schema.columns WHERE table_name = 'MlbGameConditions'" });
    console.log(rows.map(r => r.toJSON()));
  } catch (e) {
    console.error(e);
  } finally {
    database.close();
  }
}
run();
