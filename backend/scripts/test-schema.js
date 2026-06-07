import { Spanner } from '@google-cloud/spanner';
async function run() {
  const spanner = new Spanner({ projectId: process.env.GOOGLE_CLOUD_PROJECT || 'gen-lang-client-0281999829' });
  const instance = spanner.instance('clearspace');
  const database = instance.database('clearspace-db');
  try {
    const [rows] = await database.run({ sql: "SELECT table_name FROM information_schema.tables WHERE table_catalog = '' and table_schema = ''" });
    console.log(rows.map(r => r.toJSON().table_name));
  } catch (e) {
    console.error(e);
  } finally {
    database.close();
  }
}
run();
