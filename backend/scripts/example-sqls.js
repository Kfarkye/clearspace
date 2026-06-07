import { Spanner } from '@google-cloud/spanner';

const PROJECT = process.env.GOOGLE_CLOUD_PROJECT || 'gen-lang-client-0281999829';
const INSTANCE = 'clearspace';
const DATABASE = 'clearspace-db';

async function runExamples() {
  const spanner = new Spanner({ projectId: PROJECT });
  const db = spanner.instance(INSTANCE).database(DATABASE);
  
  try {
    console.log('--- Example 1: Recent Games ---');
    const [games] = await db.run(`
      SELECT EventId, HomeTeamName, AwayTeamName, HomeScore, AwayScore, Status 
      FROM MlbGames 
      LIMIT 3
    `);
    console.table(games.map(g => g.toJSON()));

    console.log('\n--- Example 2: Pitching Stats (High Strikeouts) ---');
    const [pitchers] = await db.run(`
      SELECT TeamId, Name, InningsPitched, Strikeouts 
      FROM MlbBoxscorePitching 
      WHERE Strikeouts >= 5 
      LIMIT 3
    `);
    console.table(pitchers.map(p => p.toJSON()));

    console.log('\n--- Example 3: Biggest Win Probability Swings ---');
    const [swings] = await db.run(`
      SELECT EventId, PlayDescription, ProbabilitySwing 
      FROM MlbWinProbability 
      WHERE ProbabilitySwing > 0.3
      ORDER BY ProbabilitySwing DESC 
      LIMIT 3
    `);
    console.table(swings.map(s => s.toJSON()));

    console.log('\n--- Example 4: Game Odds ---');
    const [odds] = await db.run(`
      SELECT EventId, Provider, SnapshotType, HomeMoneyLine, AwayMoneyLine 
      FROM MlbOddsHistory 
      LIMIT 3
    `);
    console.table(odds.map(o => o.toJSON()));

  } catch (err) {
    console.error('Error running examples:', err.message);
  } finally {
    await db.close();
  }
}

runExamples();
