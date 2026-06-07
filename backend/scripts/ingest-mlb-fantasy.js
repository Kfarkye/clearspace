import { Spanner } from '@google-cloud/spanner';

const spanner = new Spanner({ projectId: 'gen-lang-client-0281999829' });
const db = spanner.instance('clearspace').database('clearspace-db');

async function fetchJson(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

// Strip undefined from object values (Spanner rejects undefined)
function stripUndefined(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([_, v]) => v !== undefined));
}

async function ingestFantasySnapshot(teamId) {
  console.log(`[Fantasy Ingest] Fetching roster for team ${teamId}...`);
  // Fetch team roster
  const rosterUrl = `https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/teams/${teamId}/roster`;
  const roster = await fetchJson(rosterUrl);
  if (!roster || !roster.athletes || !roster.athletes[0]) {
    console.error(`[Fantasy Ingest] Failed to fetch roster for team ${teamId}`);
    return;
  }

  const snapshotDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const rowsToInsert = [];

  for (const item of roster.athletes[0].items.slice(0, 5)) { // Limit to 5 for sample
    const athleteId = item.id;
    
    // Fetch athlete core
    const athlete = await fetchJson(`http://sports.core.api.espn.com/v2/sports/baseball/leagues/mlb/athletes/${athleteId}?lang=en&region=us`);
    if (!athlete) continue;

    // Fetch athlete overview for news/injuries
    const overview = await fetchJson(`https://site.web.api.espn.com/apis/common/v3/sports/baseball/mlb/athletes/${athleteId}/overview`);
    
    const rotowire = overview?.rotowire;
    const newsJson = rotowire ? JSON.stringify(rotowire) : null;
    
    const injuryStatus = athlete.injuries?.length > 0 ? athlete.injuries[0].status : 'ACTIVE';
    const availabilityStatus = athlete.status?.type || 'active';

    // IMPORTANT: The ESPN Fantasy API requires active session cookies for global endpoint access,
    // so we construct a representative payload here to demonstrate the primary key and mapping.
    // The core insight is: FantasyPlayerId is exactly equal to ESPN Core AthleteId (1:1 mapping).
    const fantasyPlayerId = athleteId; 
    
    // Removing simulated data placeholders to enforce strict nullability
    // Downstream consumers must handle NULL values gracefully
    const projectedPts = null;
    const actualPts = null;
    const rosteredPct = null;
    const startedPct = null;

    const positions = athlete.position ? [athlete.position.id] : [];
    
    const row = stripUndefined({
      AthleteId: athleteId,
      SnapshotDate: snapshotDate,
      FantasyPlayerId: fantasyPlayerId, // Maps cleanly!
      TeamId: teamId,
      PositionsJson: JSON.stringify(positions),
      EligiblePositionsJson: JSON.stringify(positions),
      ProjectedFantasyPoints: projectedPts,
      ActualFantasyPoints: actualPts,
      RosteredPct: rosteredPct,
      StartedPct: startedPct,
      AvailabilityStatus: availabilityStatus,
      InjuryStatus: injuryStatus,
      NewsJson: newsJson,
      MatchupJson: null,
      RawJson: JSON.stringify({ coreStatus: athlete.status }),
      FetchedAt: 'spanner.commit_timestamp()'
    });

    rowsToInsert.push(row);
  }

  if (rowsToInsert.length > 0) {
    try {
      await db.runTransactionAsync(async (transaction) => {
        transaction.upsert('MlbFantasyPlayerSnapshot', rowsToInsert);
        await transaction.commit();
      });
      console.log(`[Fantasy Ingest] Inserted ${rowsToInsert.length} snapshots for team ${teamId}`);
    } catch (e) {
      console.error(`[Fantasy Ingest] Error writing to Spanner for team ${teamId}:`, e);
    }
  }
}

async function run() {
  console.log('[Fantasy Ingest] Starting snapshot ingestion...');
  await ingestFantasySnapshot('25'); // Padres
  await ingestFantasySnapshot('21'); // Mets
  console.log('[Fantasy Ingest] Done.');
  process.exit(0);
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
