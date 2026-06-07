import { Spanner } from '@google-cloud/spanner';
import fetch from 'node-fetch';

const PROJECT = process.env.GOOGLE_CLOUD_PROJECT || 'gen-lang-client-0281999829';

async function checkMatches() {
  console.log('Checking matches table in aura-governance-instance (world-cup-db & sports-db)...');
  const spanner = new Spanner({ projectId: PROJECT });
  const instance = spanner.instance('aura-governance-instance');
  
  for (const dbName of ['world-cup-db', 'sports-db']) {
    const db = instance.database(dbName);
    try {
      const [rows] = await db.run(`SELECT MAX(date) as max_date, COUNT(*) as cnt FROM matches WHERE league = 'mlb'`);
      console.log(`[${dbName}] MLB matches count: ${rows[0].toJSON().cnt}, Max Date: ${rows[0].toJSON().max_date}`);
    } catch (e) {
      console.log(`[${dbName}] Error: ${e.message}`);
    } finally {
      await db.close();
    }
  }
}

async function checkMlbGames() {
  console.log('Checking MlbGames table in clearspace (clearspace-db)...');
  const spanner = new Spanner({ projectId: PROJECT });
  const instance = spanner.instance('clearspace');
  const db = instance.database('clearspace-db');
  
  try {
    const [rows] = await db.run(`SELECT EventId, FetchedAt FROM MlbGames ORDER BY FetchedAt DESC LIMIT 1`);
    if (rows.length > 0) {
      const eventId = rows[0].toJSON().EventId;
      console.log(`Most recently fetched EventId in MlbGames: ${eventId}`);
      
      // Let's fetch from ESPN to see what date this event was
      const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/summary?event=${eventId}`);
      if (res.ok) {
        const data = await res.json();
        const date = data.header?.competitions?.[0]?.date;
        console.log(`That event (${eventId}) corresponds to match date: ${date}`);
      }
    } else {
      console.log('MlbGames is empty.');
    }
  } catch (e) {
    console.log(`[clearspace-db] Error: ${e.message}`);
  } finally {
    await db.close();
  }
}

async function run() {
  await checkMatches();
  await checkMlbGames();
}

run();
