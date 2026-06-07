/**
 * @fileoverview ESPN Core & ESPN Bet Adapter Worker
 * @description Ingests raw telemetry from ESPN Core API, normalizes it into AURA's 
 * strict relational Spanner schema, and dispatches it to the Ingestion Gateway.
 */

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:8080/ingest';

// ESPN Core API Endpoints (Using soccer/fifa.world as the target for Phase 2)
const ESPN_CORE_SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard';
const ESPN_CORE_TEAMS = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/teams';

/**
 * Fetches raw team and roster data from ESPN Core
 */
async function fetchEspnCoreData() {
  console.log('[AURA] Fetching upstream telemetry from ESPN Core API...');
  try {
    const response = await fetch(ESPN_CORE_SCOREBOARD);
    if (!response.ok) throw new Error(`ESPN API returned ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('[AURA ERROR] Upstream ESPN Core fetch failed:', error.message);
    process.exit(1);
  }
}

/**
 * Transforms ESPN's nested JSON into AURA's flat, relational Spanner schema
 */
function transformToAuraSchema(espnData) {
  console.log('[AURA] Normalizing ESPN payload into Spanner relational entities...');
  
  const entities = [];
  const events = espnData.events || [];

  for (const event of events) {
    const competitors = event.competitions[0].competitors;

    for (const teamNode of competitors) {
      const team = teamNode.team;
      
      // 1. Construct TEAM Entity
      entities.push({
        type: "TEAM",
        id: `TEAM_${team.abbreviation.toUpperCase()}`,
        name: team.name,
        group: event.season.slug || "UNKNOWN",
        base_power_rating: parseFloat(teamNode.statistics?.find(s => s.name === 'powerIndex')?.displayValue || "80.0")
      });

      // 2. Construct PLAYER & INJURY Entities (If ESPN provides roster/injury nodes in this feed)
      if (teamNode.roster) {
        for (const playerNode of teamNode.roster) {
          entities.push({
            type: "PLAYER",
            id: `PL_${playerNode.athlete.id}`,
            team_id: `TEAM_${team.abbreviation.toUpperCase()}`,
            name: playerNode.athlete.displayName,
            position: playerNode.position?.abbreviation || "UNKNOWN",
            impact_weight: 5.0 // Base weight, AURA models will adjust
          });

          if (playerNode.injuries && playerNode.injuries.length > 0) {
            const injury = playerNode.injuries[0];
            entities.push({
              type: "INJURY",
              id: `INJ_${playerNode.athlete.id}`,
              player_id: `PL_${playerNode.athlete.id}`,
              team_id: `TEAM_${team.abbreviation.toUpperCase()}`,
              status: injury.status.toUpperCase(),
              designation: injury.detail || "Undisclosed",
              market_penalty: -1.0 // Default penalty
            });
          }
        }
      }
    }
  }

  return {
    batch_id: `ESPN_SYNC_${Date.now()}`,
    timestamp: new Date().toISOString(),
    tag: "WORLD_CUP", // Mandatory tag for the gateway
    entities: entities
  };
}

/**
 * Dispatches the normalized payload to the local Spanner Gateway
 */
async function dispatchToGateway(payload) {
  console.log(`[AURA] Dispatching ${payload.entities.length} relational entities to Spanner Gateway...`);
  
  try {
    const response = await fetch(GATEWAY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.AURA_INTERNAL_TOKEN || 'dev_bypass'}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gateway rejected payload: ${response.status} - ${errorText}`);
    }

    console.log('[AURA SUCCESS] ESPN Data successfully committed to Spanner Ledger.');
  } catch (error) {
    console.error('[AURA FATAL] Gateway dispatch failed:', error.message);
  }
}

// --- Execution Pipeline ---
async function run() {
  const rawEspnData = await fetchEspnCoreData();
  const auraPayload = transformToAuraSchema(rawEspnData);
  
  if (auraPayload.entities.length === 0) {
    console.warn('[AURA] Warning: ESPN returned 0 parsable entities. Check off-season status.');
    return;
  }
  
  await dispatchToGateway(auraPayload);
}

run();
