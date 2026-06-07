import { Spanner } from '@google-cloud/spanner';

async function runDiagnostic(eventId) {
  const spanner = new Spanner({ projectId: process.env.GOOGLE_CLOUD_PROJECT || 'gen-lang-client-0281999829' });
  const instance = spanner.instance('clearspace');
  const db = instance.database('clearspace-db');

  console.log(`\n[AURA] Running Win Probability Diagnostic for Event: ${eventId}`);
  
  try {
    const spanner = new Spanner({ projectId: process.env.GOOGLE_CLOUD_PROJECT || 'gen-lang-client-0281999829' });
    const instance = spanner.instance('clearspace');
    const db = instance.database('clearspace-db');

    const coreUrl = `https://sports.core.api.espn.com/v2/sports/baseball/leagues/mlb/events/${eventId}?lang=en&region=us`;
    const summaryUrl = `https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/summary?event=${eventId}`;
    
    const fetchJson = async url => { const res = await fetch(url); return res.ok ? res.json() : null; };
    const coreEvent = await fetchJson(coreUrl);
    const summaryEvent = await fetchJson(summaryUrl);

    let coreProbabilities = [];
    if (coreEvent?.competitions?.[0]?.$ref) {
      const comp = await fetchJson(coreEvent.competitions[0].$ref);
      if (comp?.probabilities?.$ref) {
        const prob = await fetchJson(comp.probabilities.$ref);
        coreProbabilities = prob?.items || [];
      }
    }
    const summaryProbabilities = summaryEvent?.winprobability || [];
    
    console.log(`2. ESPN Summary winprobability count: ${summaryProbabilities.length}`);
    console.log(`3. ESPN Core probabilities count: ${coreProbabilities.length}`);

    // 1. Count rows in DB
    const [countRes] = await db.run({
      sql: `SELECT COUNT(*) as count FROM MlbWinProbability WHERE EventId = @eventId`,
      params: { eventId: String(eventId) }
    });
    console.log(`1. MlbWinProbability DB row count: ${countRes[0].toJSON().count}`);

    // 4. Check for Fermin HR playId
    const targetPlayId = '4018156561304990057';
    const [ferminRes] = await db.run({
      sql: `SELECT PlayId, PlayDescription, HomeWinPercentage, ProbabilitySwing FROM MlbWinProbability WHERE EventId = @eventId AND PlayId = @playId`,
      params: { eventId: String(eventId), playId: targetPlayId }
    });
    
    if (ferminRes.length > 0) {
      console.log(`4. Fermin HR Play Found in DB:`, ferminRes[0].toJSON());
    } else {
      console.log(`4. FATAL: Fermin HR Play (${targetPlayId}) NOT FOUND in DB.`);
    }

    // 5 & 6. Verify Top Swings (Chronological calculation check)
    const [topSwings] = await db.run({
      sql: `
        SELECT PlayId, PlayDescription, ProbabilitySwing 
        FROM MlbWinProbability 
        WHERE EventId = @eventId 
        ORDER BY ProbabilitySwing DESC 
        LIMIT 3
      `,
      params: { eventId: String(eventId) }
    });
    console.log(`\nTop 3 Swings in DB (Fermin HR must be #1):`);
    console.table(topSwings.map(r => r.toJSON()));

  } catch (err) {
    console.error('Diagnostic error:', err);
  } finally {
    await db.close();
  }
}

runDiagnostic('401815656');
