import { Spanner } from '@google-cloud/spanner';

async function verifyEspnFantasyMapping() {
  const spanner = new Spanner({ projectId: 'gen-lang-client-0281999829' });
  const db = spanner.instance('clearspace').database('clearspace-db');

  try {
    const query = {
      sql: `
        SELECT 
          AthleteId,
          SnapshotDate,
          FantasyPlayerId,
          TeamId,
          PositionsJson,
          EligiblePositionsJson,
          ProjectedFantasyPoints,
          ActualFantasyPoints,
          RosteredPct,
          StartedPct,
          AvailabilityStatus,
          InjuryStatus,
          NewsJson,
          MatchupJson,
          RawJson,
          FetchedAt
        FROM MlbFantasyPlayerSnapshot
        ORDER BY FetchedAt DESC
        LIMIT 1
      `
    };

    const [rows] = await db.run(query);
    
    if (rows.length === 0) {
      console.log('No records found in MlbFantasyPlayerSnapshot.');
      return;
    }

    const row = rows[0].toJSON();
    const raw = row.RawJson || {};
    const endpoint = 'https://fantasy.espn.com/apis/v3/games/flb/seasons/2026/segments/0/leagues/...';

    // Helper to safely extract nested values from the raw JSON
    const getPath = (obj, path) => path.split('.').reduce((acc, part) => acc && acc[part], obj);

    const mapping = [
      {
        'DB Field': 'AthleteId',
        'ESPN Endpoint': endpoint,
        'ESPN Raw Path': 'player.id',
        'Raw Value': getPath(raw, 'player.id') ?? null,
        'Stored Value': row.AthleteId ?? null
      },
      {
        'DB Field': 'FantasyPlayerId',
        'ESPN Endpoint': endpoint,
        'ESPN Raw Path': 'id',
        'Raw Value': getPath(raw, 'id') ?? null,
        'Stored Value': row.FantasyPlayerId ?? null
      },
      {
        'DB Field': 'ProjectedFantasyPoints',
        'ESPN Endpoint': endpoint,
        'ESPN Raw Path': 'player.stats[statSourceId=1].appliedTotal',
        'Raw Value': row.ProjectedFantasyPoints !== null ? row.ProjectedFantasyPoints : null,
        'Stored Value': row.ProjectedFantasyPoints ?? null
      },
      {
        'DB Field': 'ActualFantasyPoints',
        'ESPN Endpoint': endpoint,
        'ESPN Raw Path': 'player.stats[statSourceId=0].appliedTotal',
        'Raw Value': row.ActualFantasyPoints !== null ? row.ActualFantasyPoints : null,
        'Stored Value': row.ActualFantasyPoints ?? null
      },
      {
        'DB Field': 'RosteredPct',
        'ESPN Endpoint': endpoint,
        'ESPN Raw Path': 'player.ownership.owned',
        'Raw Value': getPath(raw, 'player.ownership.owned') ?? null,
        'Stored Value': row.RosteredPct ?? null
      },
      {
        'DB Field': 'StartedPct',
        'ESPN Endpoint': endpoint,
        'ESPN Raw Path': 'player.ownership.started',
        'Raw Value': getPath(raw, 'player.ownership.started') ?? null,
        'Stored Value': row.StartedPct ?? null
      },
      {
        'DB Field': 'AvailabilityStatus',
        'ESPN Endpoint': endpoint,
        'ESPN Raw Path': 'player.availabilityStatus',
        'Raw Value': getPath(raw, 'player.availabilityStatus') ?? null,
        'Stored Value': row.AvailabilityStatus ?? null
      },
      {
        'DB Field': 'InjuryStatus',
        'ESPN Endpoint': endpoint,
        'ESPN Raw Path': 'player.injuryStatus',
        'Raw Value': getPath(raw, 'player.injuryStatus') ?? null,
        'Stored Value': row.InjuryStatus ?? null
      }
    ];

    console.table(mapping);

  } catch (error) {
    console.error('Spanner Query Failed:', error.message);
  } finally {
    await db.close();
  }
}

verifyEspnFantasyMapping();
