import { Spanner } from '@google-cloud/spanner';

const PROJECT = process.env.GOOGLE_CLOUD_PROJECT || 'gen-lang-client-0281999829';
const INSTANCE = 'clearspace';
const DATABASE = 'clearspace-db';

async function check() {
  const spanner = new Spanner({ projectId: PROJECT });
  const db = spanner.instance(INSTANCE).database(DATABASE);
  
  try {
    const [rows] = await db.run('SELECT COUNT(*) as count FROM MlbGames');
    console.log(`Total MlbGames: ${rows[0].toJSON().count}`);
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await db.close();
  }
}

check();
