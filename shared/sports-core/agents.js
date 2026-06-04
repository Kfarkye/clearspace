// ============================================================================
// Shared Sports Core: Betting Data Agents
// 2-pass Gemini pipelines: Search Grounding → Schema Extraction → CPU Math
// Extracted from aura-enterprise/backend/agents/
// ============================================================================

// --- Shared cache for all agents ---
const agentCaches = {
  ats: new Map(),
  ou: new Map(),
  runline: new Map(),
  moneyline: new Map(),
};
const CACHE_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

function getCachedResult(cacheKey, cacheName) {
  const cache = agentCaches[cacheName];
  if (!cache) return null;
  const entry = cache.get(cacheKey);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL_MS) {
    return entry.data;
  }
  return null;
}

function setCachedResult(cacheKey, cacheName, data) {
  const cache = agentCaches[cacheName];
  if (!cache) return;
  cache.set(cacheKey, { data, timestamp: Date.now() });
  // Bound cache at 200 entries
  if (cache.size > 200) {
    cache.delete(cache.keys().next().value);
  }
}

// --- Schema Definitions ---

const ATS_RAW_EXTRACTION_SCHEMA = {
  type: 'OBJECT',
  properties: {
    teams: {
      type: 'ARRAY',
      description: "List of requested team(s) and their raw 2026 Run Line integers.",
      items: {
        type: 'OBJECT',
        properties: {
          team: { type: 'STRING', description: "Full name of the team (e.g. Baltimore Orioles)" },
          runline_wins: { type: 'INTEGER', description: "Raw Run Line (spread) wins from the OVERALL season row." },
          runline_losses: { type: 'INTEGER', description: "Raw Run Line (spread) losses from the OVERALL season row." },
          runline_pushes: { type: 'INTEGER', description: "Raw Run Line (spread) pushes/ties." },
          season: { type: 'STRING', description: "Must be '2026'" }
        },
        required: ['team', 'runline_wins', 'runline_losses', 'runline_pushes', 'season']
      }
    }
  },
  required: ['teams']
};

const OU_RAW_EXTRACTION_SCHEMA = {
  type: 'OBJECT',
  properties: {
    teams: {
      type: 'ARRAY',
      description: "List of requested team(s) and their raw 2026 Over/Under integers.",
      items: {
        type: 'OBJECT',
        properties: {
          team: { type: 'STRING', description: "Full name of the team (e.g. Baltimore Orioles)" },
          overs: { type: 'INTEGER', description: "Raw number of games that went OVER the total. DO NOT pull Run Line or SU stats." },
          unders: { type: 'INTEGER', description: "Raw number of games that went UNDER the total. DO NOT pull Run Line or SU stats." },
          pushes: { type: 'INTEGER', description: "Raw number of games that pushed on the total." },
          season: { type: 'STRING', description: "Must be '2026'" }
        },
        required: ['team', 'overs', 'unders', 'pushes', 'season']
      }
    }
  },
  required: ['teams']
};

const RUNLINE_RAW_EXTRACTION_SCHEMA = {
  type: 'OBJECT',
  properties: {
    teams: {
      type: 'ARRAY',
      description: "List of requested team(s) and their raw 2026 Run Line integers.",
      items: {
        type: 'OBJECT',
        properties: {
          team: { type: 'STRING', description: "Full name of the team (e.g. Baltimore Orioles)" },
          runline_wins: { type: 'INTEGER', description: "Raw Run Line (spread) wins. DO NOT pull Straight Up/Moneyline wins." },
          runline_losses: { type: 'INTEGER', description: "Raw Run Line (spread) losses. DO NOT pull Straight Up/Moneyline losses." },
          runline_pushes: { type: 'INTEGER', description: "Raw Run Line (spread) pushes/ties." },
          season: { type: 'STRING', description: "Must be '2026'" }
        },
        required: ['team', 'runline_wins', 'runline_losses', 'runline_pushes', 'season']
      }
    }
  },
  required: ['teams']
};

const SU_EXTRACTION_SCHEMA = {
  type: 'OBJECT',
  properties: {
    teams: {
      type: 'ARRAY',
      description: "List of requested team(s) and their raw outright Straight Up (SU) stats.",
      items: {
        type: 'OBJECT',
        properties: {
          team: { type: 'STRING', description: "Full name of the team (e.g. Cleveland Guardians)" },
          su_wins: { type: 'INTEGER', description: "Outright straight-up wins. DO NOT pull Run Line or ATS wins." },
          su_losses: { type: 'INTEGER', description: "Outright straight-up losses. DO NOT pull Run Line or ATS losses." },
          moneyline_profit_units: { type: 'STRING', description: "Net money won or lost on a standard $100 bettor basis (e.g. +$420 or -1.5 units)." },
          season: { type: 'STRING', description: "Must be '2026'" }
        },
        required: ['team', 'su_wins', 'su_losses', 'moneyline_profit_units', 'season']
      }
    }
  },
  required: ['teams']
};

const BETTING_ANGLES_SCHEMA = {
  type: 'OBJECT',
  properties: {
    analysis_markdown: { type: 'STRING' },
    angles: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING' },
          odds: { type: 'STRING' },
          key_matchup: {
            type: 'OBJECT',
            properties: {
              title: { type: 'STRING' },
              pitcher_name: { type: 'STRING' },
              pitcher_stats: { type: 'STRING' }
            },
            required: ['title', 'pitcher_name', 'pitcher_stats']
          },
          narrative: { type: 'STRING' },
          recommendation: { type: 'STRING' }
        },
        required: ['title', 'odds', 'key_matchup', 'narrative', 'recommendation']
      }
    }
  },
  required: ['analysis_markdown', 'angles']
};


// Multi-source domain string for source redundancy
const SEARCH_DOMAINS = "(site:teamrankings.com OR site:covers.com)";

// ============================================================================
// ATS Agent — Against The Spread / Run Line records
// ============================================================================

/**
 * @param {Object} ai - GoogleGenAI instance (either API key or Vertex AI)
 * @param {string} teamName - Team name or "all"
 * @returns {Promise<Object>} Structured ATS data with CPU-computed percentages
 */
export async function fetchAtsRecord(ai, teamName) {
  if (!teamName) return { error: "No team name provided." };

  const cached = getCachedResult(teamName, 'ats');
  if (cached) { console.log(`[ATS Agent] Cache hit for "${teamName}"`); return cached; }

  const targetedSearchQuery = teamName.toLowerCase() === "all"
    ? `${SEARCH_DOMAINS} 2026 MLB "Run Line" ATS standings all 30 teams record`
    : `${SEARCH_DOMAINS} 2026 MLB "Run Line" ATS record ${teamName}`;

  try {
    // PASS 1: Multi-Source Grounding
    console.log(`[ATS Pass 1] Multi-Source Grounding: "${targetedSearchQuery}"...`);
    const searchResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: targetedSearchQuery,
      config: {
        systemInstruction: "You are a high-precision data scraper. Retrieve the complete Run Line / ATS data table from the provided canonical sites. Do not skip rows or truncate teams. Output all records as plain text.",
        tools: [{ googleSearch: {} }],
        temperature: 0.0
      }
    });

    const rawSearchText = searchResponse.text;
    if (!rawSearchText) throw new Error("Multi-source grounding returned no raw data.");

    const groundingMetadata = searchResponse.candidates?.[0]?.groundingMetadata;
    const sources = groundingMetadata?.groundingChunks?.map(chunk => chunk.web?.uri).filter(Boolean) || [];
    const actualSourceUrl = sources[0] || "https://www.covers.com/sport/baseball/mlb/standings";

    // PASS 2: Extract raw integers
    console.log(`[ATS Pass 2] Extracting raw integers (source: ${actualSourceUrl})...`);
    const extractionResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Extract the 2026 Run Line wins, losses, and pushes from this targeted text payload:\n"${rawSearchText}"\n\nCRITICAL INSTRUCTIONS:\n1. Only extract from the OVERALL/FULL SEASON row for each team. Ignore Home, Away, Favorite, Underdog splits.\n2. You are strictly forbidden from pulling Straight Up (SU) records.\n3. You must ONLY pull the record from the "Run Line" (spread) table columns.`,
      config: {
        systemInstruction: "Extract raw integer metrics from the Run Line dataset only. Do not compute percentages. The season field MUST be '2026'.",
        responseMimeType: 'application/json',
        responseSchema: ATS_RAW_EXTRACTION_SCHEMA,
        temperature: 0.1
      }
    });

    const parsedData = JSON.parse(extractionResponse.text);

    // POST-PROCESSING: CPU math + outlier filtering
    let processedTeams = parsedData.teams.map(t => {
      const totalGames = t.runline_wins + t.runline_losses;
      const winPct = totalGames > 0 ? `${((t.runline_wins / totalGames) * 100).toFixed(1)}%` : "50.0%";
      return {
        team: t.team,
        ats_win_percentage: winPct,
        ats_record: `${t.runline_wins}-${t.runline_losses}-${t.runline_pushes}`,
        games_played: totalGames,
        season: t.season,
        source_url: actualSourceUrl
      };
    });

    // Outlier filter: reject teams with < 80% of median games played
    if (processedTeams.length > 1) {
      const sortedGameCounts = [...processedTeams].map(t => t.games_played).sort((a, b) => a - b);
      const medianGames = sortedGameCounts[Math.floor(sortedGameCounts.length / 2)];
      const lowerBound = medianGames * 0.8;
      processedTeams = processedTeams.filter(t => t.games_played >= lowerBound);
    }

    const finalTeams = processedTeams.map(({ games_played, ...rest }) => rest);
    const finalPayload = { teams: finalTeams };
    if (finalTeams.length > 0) setCachedResult(teamName, 'ats', finalPayload);
    return finalPayload;

  } catch (error) {
    console.error(`[ATS Agent] Pipeline failure for "${teamName}":`, error.message);
    return { teams: [], error: `Failed to fetch ATS data: ${error.message}` };
  }
}

// ============================================================================
// O/U Agent — Over/Under (Totals) records
// ============================================================================

/**
 * @param {Object} ai - GoogleGenAI instance
 * @param {string} teamName - Team name or "all"
 */
export async function fetchOuRecord(ai, teamName) {
  if (!teamName) return { error: "No team name provided." };

  const cached = getCachedResult(teamName, 'ou');
  if (cached) { console.log(`[O/U Agent] Cache hit for "${teamName}"`); return cached; }

  const searchQuery = teamName.toLowerCase() === "all"
    ? "Find the 2026 Over/Under (Totals) records for ALL 30 MLB teams. Include Overs, Unders, and Pushes."
    : `Find the 2026 Over/Under (Totals) record for the ${teamName}. Include Overs, Unders, and Pushes.`;

  try {
    console.log(`[O/U Pass 1] Searching Google for "${teamName}"...`);
    const searchResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: searchQuery,
      config: {
        systemInstruction: "You are a precise data collector specializing in 2026 MLB season stats. Search the web for '2026 MLB Over/Under standings' or '2026 Totals records'. ONLY retrieve Over/Under (Totals) records. Ignore Run Line, ATS, Moneyline, and Straight Up (SU) records entirely. Return raw stats as plain text.",
        tools: [{ googleSearch: {} }],
        temperature: 0.0
      }
    });

    const rawSearchText = searchResponse.text;
    if (!rawSearchText) throw new Error("Google search grounding returned no readable data.");

    const groundingMetadata = searchResponse.candidates?.[0]?.groundingMetadata;
    const sources = groundingMetadata?.groundingChunks?.map(chunk => chunk.web?.uri).filter(Boolean) || [];
    const canonicalSource = sources[0] || "https://www.teamrankings.com/mlb/trends/ou-trends/";

    console.log(`[O/U Pass 2] Extracting raw integer metrics...`);
    const extractionResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Extract the 2026 Over/Under (Totals) Overs, Unders, and Pushes from this text.\n\nCRITICAL RULE:\nThe source text may contain "Straight Up" (SU) and "Run Line" records alongside "Over/Under" records.\nYou are strictly forbidden from pulling SU or Run Line records.\nYou must ONLY pull the record from the "Over/Under" or "Totals" table columns.\nText:\n"${rawSearchText}"`,
      config: {
        systemInstruction: "Extract raw integer metrics from the Over/Under (Totals) dataset only. Do not compute percentages. The season field MUST be '2026'.",
        responseMimeType: 'application/json',
        responseSchema: OU_RAW_EXTRACTION_SCHEMA,
        temperature: 0.1
      }
    });

    const parsedData = JSON.parse(extractionResponse.text);

    const processedTeams = parsedData.teams.map(t => {
      const totalGames = t.overs + t.unders;
      const overPct = totalGames > 0 ? `${((t.overs / totalGames) * 100).toFixed(1)}%` : "50.0%";
      return { team: t.team, over_percentage: overPct, ou_record: `${t.overs}-${t.unders}-${t.pushes}`, season: t.season, source_url: canonicalSource };
    });

    const finalPayload = { teams: processedTeams };
    if (processedTeams.length > 0) setCachedResult(teamName, 'ou', finalPayload);
    return finalPayload;

  } catch (error) {
    console.error(`[O/U Agent] Pipeline failure for "${teamName}":`, error.message);
    return { teams: [], error: `Failed to fetch Over/Under data: ${error.message}` };
  }
}

// ============================================================================
// Run Line Agent — Run Line spread records
// ============================================================================

/**
 * @param {Object} ai - GoogleGenAI instance
 * @param {string} teamName - Team name or "all"
 */
export async function fetchRunlineRecord(ai, teamName) {
  if (!teamName) return { error: "No team name provided." };

  const cached = getCachedResult(teamName, 'runline');
  if (cached) { console.log(`[Run Line Agent] Cache hit for "${teamName}"`); return cached; }

  const searchQuery = teamName.toLowerCase() === "all"
    ? "Find the 2026 Run Line records (wins, losses, pushes against the -1.5/+1.5 spread) for ALL 30 MLB teams."
    : `Find the 2026 Run Line record (wins, losses, pushes against the -1.5/+1.5 spread) for the ${teamName}.`;

  try {
    console.log(`[Run Line Pass 1] Searching Google for "${teamName}"...`);
    const searchResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: searchQuery,
      config: {
        systemInstruction: "You are a precise data collector specializing in 2026 MLB season stats. Search the web for '2026 MLB Run Line standings' or '2026 Run Line records'. Focus strictly on the +/- 1.5 run spread performance. Ignore Moneyline/Straight Up (SU) records entirely. Return raw stats as plain text.",
        tools: [{ googleSearch: {} }],
        temperature: 0.0
      }
    });

    const rawSearchText = searchResponse.text;
    if (!rawSearchText) throw new Error("Google search grounding returned no readable data.");

    const groundingMetadata = searchResponse.candidates?.[0]?.groundingMetadata;
    const sources = groundingMetadata?.groundingChunks?.map(chunk => chunk.web?.uri).filter(Boolean) || [];
    const canonicalSource = sources[0] || "https://www.teamrankings.com/mlb/trends/ats-trends/";

    console.log(`[Run Line Pass 2] Extracting raw integer metrics...`);
    const extractionResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Extract the 2026 Run Line wins, losses, and pushes from this text.\n\nCRITICAL RULE:\nThe source text contains "Straight Up" (SU) records and "Run Line" records.\nYou are strictly forbidden from pulling SU records.\nYou must ONLY pull the record from the "Run Line" (spread) table columns.\nText:\n"${rawSearchText}"`,
      config: {
        systemInstruction: "Extract raw integer metrics from the Run Line dataset only. Do not compute percentages. The season field MUST be '2026'.",
        responseMimeType: 'application/json',
        responseSchema: RUNLINE_RAW_EXTRACTION_SCHEMA,
        temperature: 0.1
      }
    });

    const parsedData = JSON.parse(extractionResponse.text);

    const processedTeams = parsedData.teams.map(t => {
      const totalGames = t.runline_wins + t.runline_losses;
      const winPct = totalGames > 0 ? `${((t.runline_wins / totalGames) * 100).toFixed(1)}%` : "50.0%";
      return { team: t.team, runline_win_percentage: winPct, runline_record: `${t.runline_wins}-${t.runline_losses}-${t.runline_pushes}`, season: t.season, source_url: canonicalSource };
    });

    const finalPayload = { teams: processedTeams };
    if (processedTeams.length > 0) setCachedResult(teamName, 'runline', finalPayload);
    return finalPayload;

  } catch (error) {
    console.error(`[Run Line Agent] Pipeline failure for "${teamName}":`, error.message);
    return { teams: [], error: `Failed to fetch Run Line data: ${error.message}` };
  }
}

// ============================================================================
// Moneyline/SU Agent — Straight Up records
// ============================================================================

/**
 * @param {Object} ai - GoogleGenAI instance
 * @param {string} teamName - Team name or "all"
 */
export async function fetchMoneylineRecord(ai, teamName) {
  if (!teamName) return { error: "No team name provided." };

  const cached = getCachedResult(teamName, 'moneyline');
  if (cached) { console.log(`[SU Agent] Cache hit for "${teamName}"`); return cached; }

  const normalizedQuery = teamName.toLowerCase() === "all"
    ? "ALL 30 MLB teams 2026 Straight Up (SU) moneyline records and unit profitability"
    : `2026 Straight Up (SU) moneyline record and unit profitability for the ${teamName}`;

  try {
    console.log(`[SU Pass 1] Searching Google for: "${normalizedQuery}"...`);
    const searchResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Search for and list the 2026 MLB season "Straight Up" (SU) moneyline records and net units won/lost for: ${normalizedQuery}. Keep this completely separate from Run Line or ATS standings.`,
      config: {
        systemInstruction: "You are a precise data retriever. Locate and list outright Straight Up (SU) wins and losses. Ignore Run Line or ATS records entirely. The current year is 2026.",
        tools: [{ googleSearch: {} }],
        temperature: 0.0
      }
    });

    const rawSearchText = searchResponse.text;
    if (!rawSearchText) throw new Error("Google search grounding returned no raw data.");

    const groundingMetadata = searchResponse.candidates?.[0]?.groundingMetadata;
    const sources = groundingMetadata?.groundingChunks?.map(chunk => chunk.web?.uri).filter(Boolean) || [];
    const canonicalSource = sources[0] || "https://www.teamrankings.com/mlb/trends/moneyline-trends/";

    console.log(`[SU Pass 2] Extracting raw SU records...`);
    const extractionResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Extract the 2026 Straight Up (SU) wins and losses from this text.\n\nCRITICAL RULE:\nYou are strictly forbidden from pulling Run Line / ATS / Spread records (e.g. 33-25).\nYou must ONLY pull the outright records from the "Straight Up" (SU) table columns (e.g. 29-29).\nText:\n"${rawSearchText}"`,
      config: {
        systemInstruction: "Extract raw outright wins and losses. Do not compute win percentages or formatted records. The season field MUST be '2026'.",
        responseMimeType: 'application/json',
        responseSchema: SU_EXTRACTION_SCHEMA,
        temperature: 0.1
      }
    });

    const parsedData = JSON.parse(extractionResponse.text);

    const processedTeams = parsedData.teams.map(t => {
      const totalGames = t.su_wins + t.su_losses;
      const winPercentage = totalGames > 0 ? `${((t.su_wins / totalGames) * 100).toFixed(1)}%` : "50.0%";
      return { team: t.team, win_loss_record: `${t.su_wins}-${t.su_losses}`, win_percentage: winPercentage, moneyline_profit_units: t.moneyline_profit_units, season: t.season, source_url: canonicalSource };
    });

    const finalPayload = { teams: processedTeams };
    if (processedTeams.length > 0) setCachedResult(teamName, 'moneyline', finalPayload);
    return finalPayload;

  } catch (error) {
    console.error(`[SU Agent] Pipeline failure for "${teamName}":`, error.message);
    return { teams: [], error: error.message };
  }
}

// ============================================================================
// Betting Angles Agent — Structured angle generation from enriched data
// ============================================================================

/**
 * @param {Object} ai - GoogleGenAI instance
 * @param {Object} enrichedDataPayload - Pre-enriched game data with ATS/O-U/odds
 */
export async function generateBettingAngles(ai, enrichedDataPayload) {
  const team = enrichedDataPayload?.team;
  const isTeamScoped = team && team.toLowerCase() !== 'all';

  // CRITICAL SCOPE MANDATE: Prevent agent from returning angles for unrelated games
  const scopeDirective = isTeamScoped
    ? `The user has requested betting angles explicitly for: ${team}. You MUST ONLY return betting angles and analysis involving the ${team}. If you return a bet for a completely unrelated game, you have FAILED your mandate.`
    : `Analyze the full board and find the best value across the entire league.`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `Analyze this verified sports payload and generate angles: ${JSON.stringify(enrichedDataPayload)}`,
    config: {
      systemInstruction: `You are Aura, a professional sports betting sharp.\n\nCRITICAL SCOPE MANDATE:\n${scopeDirective}\n\nGenerate betting angles based strictly on the provided structured payload. Do not invent odds. If ATS or Over/Under is not available or grade is NEUTRAL, pivot your analysis strictly to starting pitching mismatches and recommend F5 (First 5 innings) ML.`,
      responseMimeType: 'application/json',
      responseSchema: BETTING_ANGLES_SCHEMA,
      temperature: 0.2
    }
  });

  if (!response.text) throw new Error("Empty response from betting angles agent");
  return JSON.parse(response.text);
}

// ============================================================================
// Sports Filter — STRONG/FADE/NEUTRAL grading
// ============================================================================

/**
 * Deterministically applies sports betting filtration rules.
 * Strips weak signals to prevent the LLM from hallucinating angles on mediocre records.
 * @param {Object} teamStatsWrapper - Output from any of the data agents
 */
export function applyAtsFilters(teamStatsWrapper) {
  if (!teamStatsWrapper || !teamStatsWrapper.teams) return teamStatsWrapper;

  const filteredTeams = teamStatsWrapper.teams.map(team => {
    const pctStr = team.runline_win_percentage || team.ats_win_percentage || team.over_percentage;
    if (!pctStr) return team;

    const pct = parseFloat(pctStr);

    if (pct > 65.0) {
      return { ...team, grade: "STRONG_CANDIDATE", display_ats: true };
    } else if (pct < 35.0) {
      return { ...team, grade: "FADE_CANDIDATE", display_ats: true };
    } else {
      // ABSOLUTE SILENT BYPASS: Strip ATS metrics so the LLM cannot see or print them
      const strippedTeam = { ...team, grade: "NEUTRAL", display_ats: false };
      if (strippedTeam.runline_win_percentage) strippedTeam.runline_win_percentage = null;
      if (strippedTeam.runline_record) strippedTeam.runline_record = null;
      if (strippedTeam.ats_win_percentage) strippedTeam.ats_win_percentage = null;
      if (strippedTeam.ats_record) strippedTeam.ats_record = null;
      if (strippedTeam.over_percentage) strippedTeam.over_percentage = null;
      if (strippedTeam.ou_record) strippedTeam.ou_record = null;
      return strippedTeam;
    }
  });

  return { ...teamStatsWrapper, teams: filteredTeams };
}
