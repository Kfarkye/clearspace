import { Spanner } from '@google-cloud/spanner';

const db = new Spanner({projectId: process.env.GOOGLE_CLOUD_PROJECT || 'gen-lang-client-0281999829'}).instance('clearspace').database('clearspace-db');

async function runCoverage() {
  try {
    console.log('\n==================================================');
    console.log(' AURA DIAGNOSTIC: MLB GAME_DATE COVERAGE');
    console.log('==================================================\n');

    const [globalRows] = await db.run(`SELECT MIN(GameDate) as min_date, MAX(GameDate) as max_date, COUNT(*) as count FROM MlbGames`);
    const minD = globalRows[0].toJSON().min_date;
    const maxD = globalRows[0].toJSON().max_date;
    const minDateStr = minD instanceof Date ? minD.toISOString().split('T')[0] : (minD && minD.value ? minD.value : String(minD).substring(0, 10));
    const maxDateStr = maxD instanceof Date ? maxD.toISOString().split('T')[0] : (maxD && maxD.value ? maxD.value : String(maxD).substring(0, 10));

    console.log('[1] GAME_DATE GLOBAL COVERAGE');
    console.table([{
      min_date: minDateStr,
      max_date: maxDateStr,
      total_games: globalRows[0].toJSON().count
    }]);

    console.log('\n[2] GAME_DATE DAILY DISTRIBUTION');
    const [dailyRows] = await db.run(`SELECT GameDate, COUNT(*) as count FROM MlbGames GROUP BY GameDate ORDER BY GameDate`);
    const distribution = dailyRows.map(r => {
      const d = r.toJSON().GameDate;
      const dateStr = d instanceof Date ? d.toISOString().split('T')[0] : (d && d.value ? d.value : String(d).substring(0, 10));
      return {
        GameDate: dateStr,
        Games: parseInt(r.toJSON().count, 10)
      };
    });
    console.table(distribution);

  } catch (err) {
    console.error(err);
  } finally {
    await db.close();
  }
}

runCoverage();
