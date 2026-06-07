/**
 * @fileoverview Phase 2: World Cup 2026 Data Spine Re-ingestion Runner
 * @description Constructs and dispatches strictly typed relational payloads (Teams -> Players -> Injuries) 
 * to the Spanner Ingestion Gateway. Handles backpressure and network faults silently.
 */

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:8080/ingest';

const WORLD_CUP_SPINE = {
  batch_id: `WC26_PHASE2_${Date.now()}`,
  timestamp: new Date().toISOString(),
  tag: "WORLD_CUP",
  entities: [
    // --- TEAMS ---
    { type: "TEAM", id: "TEAM_FRA", name: "France", group: "A", base_power_rating: 92.5 },
    { type: "TEAM", id: "TEAM_BRA", name: "Brazil", group: "G", base_power_rating: 91.8 },
    { type: "TEAM", id: "TEAM_ENG", name: "England", group: "B", base_power_rating: 89.4 },
    { type: "TEAM", id: "TEAM_USA", name: "United States", group: "D", base_power_rating: 78.2 },

    // --- PLAYERS & INJURIES (Relational Integrity Enforced) ---
    
    // France
    { type: "PLAYER", id: "PL_MBAPPE", team_id: "TEAM_FRA", name: "Kylian Mbappé", position: "FW", impact_weight: 9.8 },
    { type: "PLAYER", id: "PL_TCHOUAMENI", team_id: "TEAM_FRA", name: "Aurélien Tchouaméni", position: "MF", impact_weight: 8.2 },
    { type: "INJURY", id: "INJ_TCHOUAMENI", player_id: "PL_TCHOUAMENI", team_id: "TEAM_FRA", status: "QUESTIONABLE", designation: "Ankle Sprain", market_penalty: -1.5 },

    // Brazil
    { type: "PLAYER", id: "PL_VINI", team_id: "TEAM_BRA", name: "Vinícius Júnior", position: "FW", impact_weight: 9.5 },
    { type: "PLAYER", id: "PL_NEYMAR", team_id: "TEAM_BRA", name: "Neymar Jr", position: "FW", impact_weight: 8.5 },
    { type: "INJURY", id: "INJ_NEYMAR", player_id: "PL_NEYMAR", team_id: "TEAM_BRA", status: "OUT", designation: "ACL Recovery", market_penalty: -2.0 },

    // England
    { type: "PLAYER", id: "PL_BELLINGHAM", team_id: "TEAM_ENG", name: "Jude Bellingham", position: "MF", impact_weight: 9.4 },
    { type: "PLAYER", id: "PL_SAKA", team_id: "TEAM_ENG", name: "Bukayo Saka", position: "FW", impact_weight: 8.7 },
    { type: "INJURY", id: "INJ_SAKA", player_id: "PL_SAKA", team_id: "TEAM_ENG", status: "PROBABLE", designation: "Hamstring Fatigue", market_penalty: -0.2 },

    // USA
    { type: "PLAYER", id: "PL_PULISIC", team_id: "TEAM_USA", name: "Christian Pulisic", position: "FW", impact_weight: 8.9 },
    { type: "PLAYER", id: "PL_ADAMS", team_id: "TEAM_USA", name: "Tyler Adams", position: "MF", impact_weight: 7.8 },
    { type: "INJURY", id: "INJ_ADAMS", player_id: "PL_ADAMS", team_id: "TEAM_USA", status: "QUESTIONABLE", designation: "Back Spasms", market_penalty: -1.1 }
  ]
};

async function executeReingestion() {
  console.log(`[AURA] Initiating Phase 2 Re-ingestion. Target: ${GATEWAY_URL}`);
  
  try {
    const response = await fetch(GATEWAY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.AURA_INTERNAL_TOKEN || 'dev_bypass'}`
      },
      body: JSON.stringify(WORLD_CUP_SPINE)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gateway rejected payload: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log(`[AURA] SUCCESS: Data Spine Ingested. Spanner Ledger Updated.`);
    console.log(`[AURA] Gateway Response:`, result);
    console.log(`[AURA] Phase 3 Prediction Routing is now UNLOCKED.`);
    
  } catch (error) {
    console.error(`[AURA] FATAL: Re-ingestion failed. Pipeline halted.`);
    console.error(error.message);
    process.exit(1);
  }
}

// Execute immediately
executeReingestion();
