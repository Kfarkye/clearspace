import { Spanner } from '@google-cloud/spanner';
const spanner = new Spanner({ projectId: 'gen-lang-client-0281999829' });
const instance = spanner.instance('clearspace');
const db = instance.database('clearspace-db');
async function test() {
  const [rows] = await db.run("SELECT column_name FROM information_schema.columns WHERE table_name = 'MlbOddsHistory'");
  console.log(rows.map(r => r.toJSON().column_name));
}
test().catch(console.error);
