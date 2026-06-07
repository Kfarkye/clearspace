import { Spanner } from '@google-cloud/spanner';

const db = new Spanner({projectId: process.env.GOOGLE_CLOUD_PROJECT || 'gen-lang-client-0281999829'}).instance('clearspace').database('clearspace-db');

async function hydrateDates() {
  try {
    const [rows] = await db.run(`SELECT EventId, RawJson FROM MlbGames WHERE GameDate IS NULL`);
    console.log(`Found ${rows.length} rows to hydrate.`);

    let count = 0;
    const statements = [];
    for (const row of rows) {
      const data = row.toJSON();
      const eventId = data.EventId;
      const raw = typeof data.RawJson === 'string' ? JSON.parse(data.RawJson || '{}') : (data.RawJson || {});
      
      const startTimeStrRaw = raw.date || new Date().toISOString();
      const startTimeStr = new Date(startTimeStrRaw).toISOString();
      const gameDateStr = startTimeStr.substring(0, 10);
      const seasonYear = raw.season?.year || 2026;

      statements.push({
        sql: `UPDATE MlbGames SET GameDate = DATE(@gd), StartTime = TIMESTAMP(@st), Season = @sy WHERE EventId = @id`,
        params: { gd: gameDateStr, st: startTimeStr, sy: parseInt(seasonYear, 10), id: eventId }
      });
      count++;
    }

    if (statements.length > 0) {
      await db.runTransactionAsync(async (tx) => {
        await tx.batchUpdate(statements);
        await tx.commit();
      });
    }
    console.log(`Successfully hydrated ${count} rows.`);
  } catch (err) {
    console.error('Hydration failed:', err);
  } finally {
    await db.close();
  }
}

hydrateDates();
