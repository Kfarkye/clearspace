import { Spanner } from '@google-cloud/spanner';

const PROJECT = process.env.GOOGLE_CLOUD_PROJECT || 'gen-lang-client-0281999829';
const INSTANCE = 'clearspace';
const DATABASE = 'clearspace-db';

async function verifyMlbSeasonLedger() {
  const spanner = new Spanner({ projectId: PROJECT });
  const db = spanner.instance(INSTANCE).database(DATABASE);
  
  try {
    console.log('\n==================================================');
    console.log(' AURA DIAGNOSTIC: MLB SEASON LEDGER VERIFICATION');
    console.log('==================================================\n');

    const [coverageRows] = await db.run(`
      SELECT 
        MIN(DATE(FetchedAt)) AS min_date, 
        MAX(DATE(FetchedAt)) AS max_date, 
        COUNT(*) AS total_games 
      FROM MlbGames
    `);
    
    const minD = coverageRows[0].toJSON().min_date;
    const maxD = coverageRows[0].toJSON().max_date;
    const minDateStr = minD instanceof Date ? minD.toISOString().split('T')[0] : (minD && minD.value ? minD.value : String(minD).substring(0, 10));
    const maxDateStr = maxD instanceof Date ? maxD.toISOString().split('T')[0] : (maxD && maxD.value ? maxD.value : String(maxD).substring(0, 10));

    console.log('[1] GLOBAL COVERAGE');
    console.table([{
      min_date: minDateStr,
      max_date: maxDateStr,
      total_games: coverageRows[0].toJSON().total_games
    }]);

    const tables = [
      'MlbGames', 'MlbPlayByPlay', 'MlbWinProbability', 
      'MlbBoxscoreBatting', 'MlbBoxscorePitching', 
      'MlbOddsHistory', 'MlbInjuries', 'MlbGameStandings', 'MlbSeasonSeries'
    ];
    
    console.log('\n[2] TABLE ROW COUNTS');
    const counts = await Promise.all(
      tables.map(async (table) => {
        try {
          const [rows] = await db.run(`SELECT COUNT(*) AS count FROM ${table}`);
          return { Table: table, Rows: parseInt(rows[0].toJSON().count, 10) };
        } catch (e) {
          return { Table: table, Rows: 'N/A' };
        }
      })
    );
    console.table(counts);

    const [statuses] = await db.run(`
      SELECT Status, COUNT(*) AS count 
      FROM MlbGames 
      GROUP BY Status 
      ORDER BY count DESC
    `);
    console.log('\n[3] GAMES BY STATUS');
    console.table(statuses.map(r => r.toJSON()));

    const failedEvents = "('401817092', '401817090')";
    const [failedData] = await db.run({
      sql: `SELECT EventId, Status FROM MlbGames WHERE EventId IN ${failedEvents}`
    });

    console.log('\n[4 & 5] FAILED EVENT ANALYSIS');
    if (failedData.length === 0) {
      console.log('Result: Events not found in DB. (Likely rejected at payload validation due to missing competition data).');
    } else {
      const analyzedFailures = failedData.map(r => {
        const e = r.toJSON();
        return {
          EventId: e.EventId,
          Status: e.Status,
          IsExpectedFailure: ['Canceled', 'Postponed', 'TBD', 'Unknown'].includes(e.Status)
        };
      });
      console.table(analyzedFailures);
    }

    console.log('\n[6] FINAL-DAY SAMPLE VERIFICATION');
    const [sampleGame] = await db.run({
      sql: `
      SELECT EventId, HomeScore, AwayScore, FetchedAt
      FROM MlbGames 
      WHERE DATE(FetchedAt) = '${maxDateStr.substring(0, 10)}' 
      LIMIT 1
      `
    });

    if (sampleGame.length > 0) {
      const eventId = sampleGame[0].toJSON().EventId;
      
      const [odds] = await db.run({sql: `SELECT COUNT(*) as count FROM MlbOddsHistory WHERE EventId = '${eventId}'`});
      const [boxBat] = await db.run({sql: `SELECT COUNT(*) as count FROM MlbBoxscoreBatting WHERE EventId = '${eventId}'`});
      const [boxPitch] = await db.run({sql: `SELECT COUNT(*) as count FROM MlbBoxscorePitching WHERE EventId = '${eventId}'`});
      const [plays] = await db.run({sql: `SELECT COUNT(*) as count FROM MlbPlayByPlay WHERE EventId = '${eventId}'`});
      const [wp] = await db.run({sql: `
        SELECT MAX(ProbabilitySwing) AS max_swing 
        FROM MlbWinProbability 
        WHERE EventId = '${eventId}'
      `});

      console.table([{
        EventId: eventId,
        Score: `Away ${sampleGame[0].toJSON().AwayScore} - Home ${sampleGame[0].toJSON().HomeScore}`,
        OddsRows: parseInt(odds[0].toJSON().count, 10),
        BoxBattingRows: parseInt(boxBat[0].toJSON().count, 10),
        BoxPitchingRows: parseInt(boxPitch[0].toJSON().count, 10),
        PlaysCount: parseInt(plays[0].toJSON().count, 10),
        TopWPSwing: wp[0].toJSON().max_swing ? ((wp[0].toJSON().max_swing * 100).toFixed(2) + '%') : 'N/A'
      }]);
    } else {
      console.log('Result: No final games found on the max date.');
    }

  } catch (error) {
    console.error('CRITICAL FAULT during verification:', error);
  } finally {
    await db.close();
  }
}

verifyMlbSeasonLedger();
