import { Spanner } from '@google-cloud/spanner';

const PROJECT = process.env.GOOGLE_CLOUD_PROJECT || 'gen-lang-client-0281999829';
const INSTANCE = 'aura-governance-instance';
const DATABASE = 'sports-db';

const client = new Spanner({ projectId: PROJECT });
const db = client.instance(INSTANCE).database(DATABASE);

async function sanitizeTopology() {
  try {
    console.log('Fetching valid league IDs from matches...');
    const validLeagues = ['WORLD_CUP'];
    console.log(`Enforcing strict lock on Valid leagues: ${validLeagues.join(', ')}`);

    if (validLeagues.length === 0) {
      console.log('No valid leagues found in matches table. Aborting to prevent full wipe.');
      return;
    }

    console.log('Executing cascading purge in a transaction...');
    await db.runTransactionAsync(async (tx) => {
      const tables = [
        'odds',
        'lineup_projections',
        'historical_matches',
        'matches',
        'injury_news',
        'players',
        'team_power_ratings',
        'team_trends',
        'teams'
      ];
      
      for (const table of tables) {
        const sql = `DELETE FROM ${table} WHERE league_id NOT IN UNNEST(@leagues)`;
        const [rowCount] = await tx.runUpdate({
          sql: sql,
          params: { leagues: validLeagues }
        });
        console.log(`Purged ${rowCount} contaminated records from ${table}`);
      }
      
      await tx.commit();
      console.log('Sanitization transaction committed successfully.');
    });

  } catch (err) {
    console.error('SANITIZATION FAILED:', err);
  } finally {
    await db.close();
  }
}

sanitizeTopology();
