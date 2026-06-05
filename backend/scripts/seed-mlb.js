import { Spanner } from '@google-cloud/spanner';

const PROJECT = process.env.GOOGLE_CLOUD_PROJECT;
const INSTANCE = process.env.WC_SPANNER_INSTANCE || 'aura-governance-instance';
const DATABASE = process.env.WC_SPANNER_DATABASE || 'sports-db';

if (!PROJECT) {
  console.error('❌ GOOGLE_CLOUD_PROJECT is required');
  process.exit(1);
}

async function main() {
  const client = new Spanner({ projectId: PROJECT });
  const db = client.instance(INSTANCE).database(DATABASE);

  console.log(`Connected to Spanner: ${PROJECT}/${INSTANCE}/${DATABASE}`);

  try {
    // 1. Register MLB League
    console.log('Registering MLB League in database...');
    await db.table('leagues').upsert({
      league_id: 'MLB',
      sport_type: 'baseball',
      display_name: 'MLB Baseball',
      current_season: '2026',
      created_at: Spanner.COMMIT_TIMESTAMP,
    });
    console.log('✓ League MLB registered.');

    // 2. Fetch Teams from ESPN API
    const espnTeamsUrl = 'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/teams?limit=100';
    console.log(`Fetching MLB teams from ESPN API: ${espnTeamsUrl}`);
    const res = await fetch(espnTeamsUrl);
    if (!res.ok) {
      throw new Error(`HTTP error fetching teams: ${res.status}`);
    }
    const data = await res.json();
    const espnTeams = data.sports?.[0]?.leagues?.[0]?.teams || [];
    console.log(`Found ${espnTeams.length} teams in ESPN response.`);

    if (espnTeams.length === 0) {
      throw new Error('No teams found in ESPN response.');
    }

    // 3. Map and Upsert Teams
    const teamRows = espnTeams.map(item => {
      const t = item.team;
      const rawAbbr = t.abbreviation;
      let code = rawAbbr.toUpperCase();
      
      // Resolve canonical code discrepancies (CHW -> CWS, ATH -> OAK)
      if (code === 'CHW') code = 'CWS';
      if (code === 'ATH') code = 'OAK';

      return {
        league_id: 'MLB',
        team_code: code,
        name: t.displayName || t.name,
        group_letter: 'A',
        created_at: Spanner.COMMIT_TIMESTAMP,
        updated_at: Spanner.COMMIT_TIMESTAMP,
        logo_url: t.logos?.[0]?.href || '',
        is_placeholder: false,
        provenance: JSON.stringify({
          source: 'espn_site',
          espn_team_id: t.id,
          espn_abbr: rawAbbr
        })
      };
    });

    console.log(`Upserting ${teamRows.length} MLB teams to Spanner...`);
    await db.table('teams').upsert(teamRows);
    console.log('✓ Teams successfully seeded.');

    await db.close();
    console.log('Database connection closed.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Seeding failed:', err);
    process.exit(1);
  }
}

main();
