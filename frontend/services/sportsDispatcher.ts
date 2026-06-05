/**
 * @file frontend/services/sportsDispatcher.ts
 * @description Unified sports tool declarations and dispatch logic for Vertex AI.
 * Bridges frontend tool calls directly to the backend intelligence handlers,
 * ensuring parity across Kalshi/Polymarket enrichment, caching, and data tables.
 */

import { FunctionDeclaration, Type } from '@google/genai';

export interface ToolCallArgs {
  sport?: string;
  league?: string;
  team?: string;
  date?: string;
  event_id?: string;
  include_odds?: boolean;
  query?: string;
  trend_type?: string;
}

export interface ToolCall {
  name: string;
  args: ToolCallArgs;
}

// ============================================================================
// TOOL DECLARATIONS (Vertex AI Schema)
// ============================================================================

export const scoreboardTool: FunctionDeclaration = {
  name: 'get_scoreboard',
  description: `Fetches today's games, live scores, scheduled matchups, and odds for an entire league. Returns all games enriched with DraftKings odds, Kalshi prediction markets, Polymarket odds, standings context, and injury reports.

USE THIS WHEN: The user asks "what games are on today", "MLB scores", "did the Yankees win", or wants a full league overview.
DO NOT USE THIS WHEN: The user asks for a specific game deep-dive (use get_game_detail), play-by-play (use get_play_by_play), or multi-book odds comparison (use get_live_odds).

OUTPUT: Returns enriched scoreboard with events array, each containing teams, scores, odds (DK + Kalshi + Polymarket), standings context, and injury data.`,
  parameters: {
    type: Type.OBJECT,
    properties: {
      sport: {
        type: Type.STRING,
        description: 'The league key. One of: mlb, nfl, nba, nhl, wnba, mls, epl, liga, ucl, cfb, cbb'
      },
      date: {
        type: Type.STRING,
        description: 'Optional date in YYYYMMDD format. Defaults to today.'
      },
      team: {
        type: Type.STRING,
        description: 'Optional team name or abbreviation to filter results (e.g., NYY, Lakers, Braves)'
      },
      include_odds: {
        type: Type.BOOLEAN,
        description: 'Set to true to include odds from DraftKings, Kalshi, and Polymarket. Defaults to true.'
      }
    },
    required: ['sport']
  }
};

export const gameDetailTool: FunctionDeclaration = {
  name: 'get_game_detail',
  description: `Fetches a structured deep-dive into a specific game by ESPN event ID. Returns resolved odds from multiple providers, win probability, team records, and detailed status.

USE THIS WHEN: The user asks for "more detail", "deep-dive", "breakdown", or "odds" on a specific game. REQUIRES an event_id from a previous get_scoreboard call.
DO NOT USE THIS WHEN: The user wants today's full slate (use get_scoreboard), play-by-play (use get_play_by_play), or multi-book odds (use get_live_odds).`,
  parameters: {
    type: Type.OBJECT,
    properties: {
      sport: {
        type: Type.STRING,
        description: 'The league key. One of: mlb, nfl, nba, nhl, wnba, mls, epl, liga, ucl, cfb, cbb'
      },
      event_id: {
        type: Type.STRING,
        description: 'The ESPN event ID from a previous get_scoreboard response.'
      },
    },
    required: ['sport', 'event_id']
  }
};

export const playByPlayTool: FunctionDeclaration = {
  name: 'get_play_by_play',
  description: `Fetches live play-by-play data for an in-progress game. Returns the current game situation: count/balls/strikes, current batter and pitcher, baserunners, last 10 plays, scoring leaders, and momentum indicators.

USE THIS WHEN: The user asks "what's happening right now", "who's at bat", "who's pitching", "last few plays", or wants real-time in-game context. REQUIRES an event_id.
IMPORTANT: Only works for IN-PROGRESS games.`,
  parameters: {
    type: Type.OBJECT,
    properties: {
      sport: {
        type: Type.STRING,
        description: 'The league key. One of: mlb, nfl, nba, nhl, wnba, mls, epl, liga, ucl, cfb, cbb'
      },
      event_id: {
        type: Type.STRING,
        description: 'The ESPN event ID for the in-progress game.'
      },
    },
    required: ['sport', 'event_id']
  }
};

export const liveOddsTool: FunctionDeclaration = {
  name: 'get_live_odds',
  description: `Fetches multi-book odds comparison from The Odds API. Returns moneyline, spread, and total odds from DraftKings, FanDuel, BetMGM, Caesars, and other sportsbooks for all games in a league.

USE THIS WHEN: The user asks to "compare odds", "shop lines", "best value", or wants odds from multiple sportsbooks side-by-side.
DO NOT USE THIS WHEN: The user just wants the scoreboard with default odds (use get_scoreboard).`,
  parameters: {
    type: Type.OBJECT,
    properties: {
      sport: {
        type: Type.STRING,
        description: 'The league key. One of: mlb, nfl, nba, nhl, wnba, mls, epl'
      },
    },
    required: ['sport']
  }
};

export const winProbabilityTool: FunctionDeclaration = {
  name: 'get_win_probability',
  description: `Fetches play-by-play win probability data for a specific live or finished game. Returns a timeline of win percentage changes keyed to individual plays, with team colors and logos for visualization.

USE THIS WHEN: The user asks for "win probability", "WPA chart", "momentum chart", or "who's likely to win based on game flow".
REQUIRES: A team name and league to find the game.`,
  parameters: {
    type: Type.OBJECT,
    properties: {
      team: {
        type: Type.STRING,
        description: 'Team name or abbreviation (e.g., Yankees, NYY, Knicks)'
      },
      league: {
        type: Type.STRING,
        description: 'League key (e.g., mlb, nba, nfl, nhl)'
      }
    },
    required: ['team', 'league']
  }
};

export const playerPropsTool: FunctionDeclaration = {
  name: 'get_player_props',
  description: `Fetches live player statistics fused with PrizePicks betting prop lines (over/under) for star players in an active game. Shows current stat value vs. the prop line.

USE THIS WHEN: The user asks about "player props", "PrizePicks", "over/under on a player", or "who's hitting the over".
REQUIRES: A team name and league to find the game.`,
  parameters: {
    type: Type.OBJECT,
    properties: {
      team: {
        type: Type.STRING,
        description: 'Team name or abbreviation'
      },
      league: {
        type: Type.STRING,
        description: 'League key (e.g., mlb, nba, nfl)'
      }
    },
    required: ['team', 'league']
  }
};

export const bettingTrendsTool: FunctionDeclaration = {
  name: 'get_betting_trends',
  description: `Fetches historical ATS (Against the Spread), Over/Under, Run Line, and Moneyline betting trend records. Synthesizes AI-generated betting angles based on the trend data.

USE THIS WHEN: The user asks "ATS trends", "betting record", "do they cover the spread", "where's the value", or wants to find betting edges.
DO NOT USE THIS WHEN: The user wants live scores or game tracking (use get_scoreboard).`,
  parameters: {
    type: Type.OBJECT,
    properties: {
      team: {
        type: Type.STRING,
        description: "Team name or 'all' for league-wide trends"
      },
      trend_type: {
        type: Type.STRING,
        description: "One of: 'ats', 'ou', 'runline', 'moneyline', or 'all'"
      }
    },
    required: ['team', 'trend_type']
  }
};

export const dataTableTool: FunctionDeclaration = {
  name: 'generate_data_table',
  description: `Generates a structured data table from grounded search data. Uses a 2-pass Gemini pipeline with Google Search grounding to scrape, parse, and return tabular data for any sports query.

USE THIS WHEN: The user asks for "a table of", "show me the stats for all teams", "ranking of", or any request for structured tabular data.
DO NOT USE THIS WHEN: The user wants live scores (use get_scoreboard) or a specific game detail (use get_game_detail).`,
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: {
        type: Type.STRING,
        description: 'The exact search query to build the table, e.g., "MLB team batting averages 2026"'
      }
    },
    required: ['query']
  }
};

export const standingsTool: FunctionDeclaration = {
  name: 'get_league_standings',
  description: `Generates a data table of current league standings, win-loss records, and team rankings. Powered by the data table agent with Google Search grounding.

USE THIS WHEN: The user asks for "standings", "rankings", "team records", "who's in first place", or "playoff picture".`,
  parameters: {
    type: Type.OBJECT,
    properties: {
      league: {
        type: Type.STRING,
        description: 'League key (e.g., mlb, nba, nfl, nhl, epl)'
      }
    },
    required: ['league']
  }
};

// ============================================================================
// COMPLETE TOOL LIST (for Vertex AI registration)
// ============================================================================

export const worldCupTrendsTool: FunctionDeclaration = {
  name: 'get_world_cup_trends',
  description: 'Fetches calculated historical betting trends (win rate, goals averages, clean sheets, over 2.5 rate, BTTS rate, and recent form strings) for a qualified World Cup team from our verified database.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      team: { type: Type.STRING, description: 'Canonical 3-letter team code (e.g. USA, MEX, ESP, ARG, BRA, FRA, GER)' },
      period: { type: Type.STRING, description: "Period of trend snapshots: 'last_10', 'last_20', or 'all'. Defaults to 'all'." }
    },
    required: ['team']
  }
};

export const worldCupHistoricalMatchesTool: FunctionDeclaration = {
  name: 'get_world_cup_historical_matches',
  description: 'Retrieves the chronological list of recent historical matches played by a qualified World Cup team (including scores, opponent, and result) from our verified database.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      team: { type: Type.STRING, description: 'Canonical 3-letter team code (e.g. USA, MEX, ESP, ARG, BRA, FRA, GER)' },
      limit: { type: Type.INTEGER, description: 'Maximum number of match records to retrieve. Defaults to 20.' }
    },
    required: ['team']
  }
};

export const mlbTrendsTool: FunctionDeclaration = {
  name: 'get_mlb_trends',
  description: 'Fetches calculated historical betting trends (win rate, runs averages, shutout rate, over 8.5 rate, BTTS rate, and recent form strings) for a specific MLB team or all teams from our verified database.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      team: { type: Type.STRING, description: 'Canonical 3-letter team abbreviation (e.g. NYY, LAD, BOS, CHC, SF) or "all" to retrieve trends for all 30 teams.' },
      period: { type: Type.STRING, description: "Period of trend snapshots: 'last_10', 'last_20', or 'all'. Defaults to 'all'." }
    },
    required: ['team']
  }
};

export const mlbHistoricalMatchesTool: FunctionDeclaration = {
  name: 'get_mlb_historical_matches',
  description: 'Retrieves the chronological list of recent historical matches played by an MLB team (including runs, opponent, and result) from our verified database.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      team: { type: Type.STRING, description: 'Canonical 3-letter team abbreviation (e.g. NYY, LAD, BOS, CHC, SF)' },
      limit: { type: Type.INTEGER, description: 'Maximum number of match records to retrieve. Defaults to 20.' }
    },
    required: ['team']
  }
};

export const allSportsTools: FunctionDeclaration[] = [
  scoreboardTool,
  gameDetailTool,
  playByPlayTool,
  liveOddsTool,
  winProbabilityTool,
  playerPropsTool,
  bettingTrendsTool,
  dataTableTool,
  standingsTool,
  worldCupTrendsTool,
  worldCupHistoricalMatchesTool,
  mlbTrendsTool,
  mlbHistoricalMatchesTool,
];

// ============================================================================
// TOOL NAME SET (for fast lookup in dispatch)
// ============================================================================

export const SPORTS_TOOL_NAMES = new Set(allSportsTools.map(t => t.name));

// ============================================================================
// DISPATCH LOGIC
// ============================================================================

/**
 * Routes frontend tool calls to the unified backend intelligence layer.
 * Returns null if the tool name is not a sports tool (caller should handle other domains).
 */
export async function dispatchSportsTool(
  call: { name: string; args: Record<string, any> },
  withTimeout: <T>(promise: Promise<T>, label: string) => Promise<T>,
): Promise<any | null> {
  if (!SPORTS_TOOL_NAMES.has(call.name)) return null;

  const { name, args } = call;

  const fetchIntelligence = async (endpoint: string, payload: Record<string, any>) => {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(`Intelligence endpoint returned ${response.status}: ${response.statusText}`);
    }
    return response.json();
  };

  switch (name) {
    // ── SCOREBOARD (routed to sports-handler.js) ─────────────────────────
    case 'get_scoreboard': {
      console.log('[Sports] Scoreboard → intelligence layer:', args);
      return withTimeout(
        fetchIntelligence('/api/intelligence/sports/query', {
          league: args.sport || args.league || 'mlb',
          team: args.team,
          date: args.date,
          include_odds: args.include_odds !== false,
        }),
        'Sports Intelligence'
      );
    }

    // ── GAME DETAIL (raw Core API — no handler equivalent yet) ───────────
    case 'get_game_detail': {
      console.log('[Sports] Game detail → raw proxy:', args);
      const sport = args.sport || 'mlb';
      const eventId = args.event_id;
      if (!eventId) return { error: 'event_id is required. Get it from a previous get_scoreboard response.' };

      return withTimeout(
        fetch(`/api-proxy/espn/${sport}/event/${eventId}`).then(r => {
          if (!r.ok) throw new Error(`ESPN Core API returned ${r.status}`);
          return r.json();
        }),
        'ESPN Event Detail'
      );
    }

    // ── PLAY-BY-PLAY (raw Summary API — richest single endpoint) ─────────
    case 'get_play_by_play': {
      console.log('[Sports] Play-by-play → raw proxy:', args);
      const sport = args.sport || 'mlb';
      const eventId = args.event_id;
      if (!eventId) return { error: 'event_id is required. Get it from a previous get_scoreboard response.' };

      const [plays, detail] = await withTimeout(
        Promise.all([
          fetch(`/api-proxy/espn/${sport}/event/${eventId}/plays`).then(r => {
            if (!r.ok) throw new Error(`ESPN Summary API returned ${r.status}`);
            return r.json();
          }),
          fetch(`/api-proxy/espn/${sport}/event/${eventId}`).then(r => {
            if (!r.ok) throw new Error(`ESPN Core API returned ${r.status}`);
            return r.json();
          }),
        ]),
        'ESPN Play-by-Play'
      );
      return {
        ...detail,
        playByPlay: plays,
        _context_note: 'This response contains both the current game situation (playByPlay) and the full game context (scores, odds, matchup). Use playByPlay for real-time situation and the top-level data for scores and odds.',
      };
    }

    // ── LIVE ODDS (raw Odds API — multi-book comparison) ─────────────────
    case 'get_live_odds': {
      console.log('[Sports] Live odds → raw proxy:', args);
      const sport = args.sport || 'mlb';
      try {
        const response = await withTimeout(
          fetch(`/api-proxy/odds/${sport}`).then(r => {
            if (!r.ok) return null;
            return r.json();
          }),
          'The Odds API'
        );
        if (!response || !response.configured) {
          return {
            error: 'Live multi-book odds are not available. The Odds API key may not be configured.',
            _fallback_note: 'DraftKings odds are available via get_scoreboard.',
          };
        }
        return response;
      } catch {
        return { error: 'Live odds request timed out.' };
      }
    }

    // ── WIN PROBABILITY (routed to win-probability-handler.js) ───────────
    case 'get_win_probability': {
      console.log('[Sports] Win probability → intelligence layer:', args);
      return withTimeout(
        fetchIntelligence('/api/intelligence/sports/win-probability', {
          team: args.team,
          league: args.league || args.sport,
        }),
        'Win Probability'
      );
    }

    // ── PLAYER PROPS (routed to player-prop-handler.js) ──────────────────
    case 'get_player_props': {
      console.log('[Sports] Player props → intelligence layer:', args);
      return withTimeout(
        fetchIntelligence('/api/intelligence/sports/player-props', {
          team: args.team,
          league: args.league || args.sport,
        }),
        'Player Props'
      );
    }

    // ── BETTING TRENDS (routed to data-table-agent.js as search query) ───
    case 'get_betting_trends': {
      console.log('[Sports] Betting trends → intelligence layer:', args);
      const query = `${args.team || 'MLB'} ${args.trend_type || 'all'} betting trends and record this season`;
      return withTimeout(
        fetchIntelligence('/api/intelligence/sports/data-table', { query }),
        'Betting Trends'
      );
    }

    // ── DATA TABLE (routed to data-table-agent.js) ───────────────────────
    case 'generate_data_table': {
      console.log('[Sports] Data table → intelligence layer:', args);
      return withTimeout(
        fetchIntelligence('/api/intelligence/sports/data-table', {
          query: args.query,
        }),
        'Data Table Agent'
      );
    }

    // ── LEAGUE STANDINGS (routed to data-table-agent.js) ─────────────────
    case 'get_league_standings': {
      console.log('[Sports] Standings → intelligence layer:', args);
      const safeLeague = (args.league || 'sports').toUpperCase();
      return withTimeout(
        fetchIntelligence('/api/intelligence/sports/data-table', {
          query: `Current ${safeLeague} regular season standings, win-loss records, and team rankings`,
        }),
        'League Standings'
      );
    }

    // ── WORLD CUP TRENDS (direct Spanner fetch + DATA_TABLE format) ──────
    case 'get_world_cup_trends': {
      console.log('[Sports] World Cup Trends → Spanner:', args);
      const safeTeam = String(args.team).trim().toUpperCase();
      const safePeriod = args.period || 'all';

      return withTimeout(
        fetch(`/api/world-cup/teams/${safeTeam}/trends?period=${safePeriod}`)
          .then(async r => {
            if (!r.ok) throw new Error(`Trends API returned ${r.status}`);
            const res = await r.json();
            const trends = res.trends;
            const trendsList = Array.isArray(trends) ? trends : [trends].filter(Boolean);

            const columns = ['Period', 'Win Rate', 'Goals For Avg', 'Goals Against Avg', 'Clean Sheets', 'Over 2.5', 'BTTS', 'Form 5', 'Form 10'];
            const rows = trendsList.map((t: any) => [
              t.period || 'all',
              t.winRate != null ? `${(t.winRate * 100).toFixed(1)}%` : '-',
              t.goalsForAvg != null ? Number(t.goalsForAvg).toFixed(2) : '-',
              t.goalsAgainstAvg != null ? Number(t.goalsAgainstAvg).toFixed(2) : '-',
              t.cleanSheetRate != null ? `${(t.cleanSheetRate * 100).toFixed(1)}%` : '-',
              t.over25Rate != null ? `${(t.over25Rate * 100).toFixed(1)}%` : '-',
              t.bttsRate != null ? `${(t.bttsRate * 100).toFixed(1)}%` : '-',
              t.form5 || '-',
              t.form10 || '-'
            ]);

            return {
              id: `wc_trends_${Date.now()}`,
              type: 'DATA_TABLE',
              resolution_state: 'RESOLVED',
              context_summary: `${safeTeam} World Cup Snapshot`,
              data: {
                title: `${safeTeam} World Cup Ingestion Snapshot`,
                columns,
                rows,
                source: 'ESPN Historical Ingestion',
              }
            };
          }),
        'World Cup Trends'
      );
    }

    // ── WORLD CUP HISTORICAL MATCHES (direct Spanner fetch + DATA_TABLE format) 
    case 'get_world_cup_historical_matches': {
      console.log('[Sports] World Cup Historical Matches → Spanner:', args);
      const safeTeam = String(args.team).trim().toUpperCase();
      const safeLimit = args.limit ? parseInt(String(args.limit), 10) : 20;

      return withTimeout(
        fetch(`/api/world-cup/teams/${safeTeam}/historical?limit=${safeLimit}`)
          .then(async r => {
            if (!r.ok) throw new Error(`Historical Matches API returned ${r.status}`);
            const res = await r.json();
            const matches = res.matches || [];

            const columns = ['Date', 'Opponent', 'Result', 'Score', 'Venue', 'Competition'];
            const rows = matches.map((m: any) => {
              const dateStr = new Date(m.matchDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
              return [
                dateStr,
                m.opponentCode || 'UNK',
                m.result || 'D',
                `${m.goalsFor} - ${m.goalsAgainst}`,
                m.venueType || 'neutral',
                m.competition || 'Unknown'
              ];
            });

            return {
              id: `wc_matches_${Date.now()}`,
              type: 'DATA_TABLE',
              resolution_state: 'RESOLVED',
              context_summary: `${safeTeam} Historical matches`,
              data: {
                title: `${safeTeam} Historical Results Ledger (Last ${safeLimit} matches)`,
                columns,
                rows,
                source: 'ESPN Results',
              }
            };
          }),
        'World Cup Historical Matches'
      );
    }

    // ── MLB TRENDS (direct Spanner fetch + DATA_TABLE format) ────────────
    case 'get_mlb_trends': {
      console.log('[Sports] MLB Trends → Spanner:', args);
      const safeTeam = String(args.team).trim().toUpperCase();
      const safePeriod = args.period || 'all';

      return withTimeout(
        fetch(`/api/sports/MLB/teams/${safeTeam}/trends?period=${safePeriod}`)
          .then(async r => {
            if (!r.ok) throw new Error(`Trends API returned ${r.status}`);
            const res = await r.json();
            const trends = res.trends;
            const trendsList = Array.isArray(trends) ? trends : [trends].filter(Boolean);

            const columns = ['Team', 'Period', 'Win Rate', 'Runs For Avg', 'Runs Against Avg', 'Shutout Rate', 'Over 8.5 Rate', 'BTTS Rate', 'Form 5', 'Form 10'];
            const rows = trendsList.map((t: any) => [
              t.teamCode || safeTeam,
              t.period || 'all',
              t.winRate != null ? `${(t.winRate * 100).toFixed(1)}%` : '-',
              t.goalsForAvg != null ? Number(t.goalsForAvg).toFixed(2) : '-',
              t.goalsAgainstAvg != null ? Number(t.goalsAgainstAvg).toFixed(2) : '-',
              t.cleanSheetRate != null ? `${(t.cleanSheetRate * 100).toFixed(1)}%` : '-',
              t.over25Rate != null ? `${(t.over25Rate * 100).toFixed(1)}%` : '-',
              t.bttsRate != null ? `${(t.bttsRate * 100).toFixed(1)}%` : '-',
              t.form5 || '-',
              t.form10 || '-'
            ]);

            return {
              id: `mlb_trends_${Date.now()}`,
              type: 'DATA_TABLE',
              resolution_state: 'RESOLVED',
              context_summary: safeTeam !== 'ALL' ? `${safeTeam} MLB Snapshot` : `MLB League-Wide Trends (${safePeriod})`,
              data: {
                title: safeTeam !== 'ALL' ? `${safeTeam} MLB Ingestion Snapshot` : `MLB League-Wide Historical Betting Trends (${safePeriod})`,
                columns,
                rows,
                source: 'ESPN Results',
              }
            };
          }),
        'MLB Trends'
      );
    }

    // ── MLB HISTORICAL MATCHES (direct Spanner fetch + DATA_TABLE format) 
    case 'get_mlb_historical_matches': {
      console.log('[Sports] MLB Historical Matches → Spanner:', args);
      const safeTeam = String(args.team).trim().toUpperCase();
      const safeLimit = args.limit ? parseInt(String(args.limit), 10) : 20;

      return withTimeout(
        fetch(`/api/sports/MLB/teams/${safeTeam}/historical?limit=${safeLimit}`)
          .then(async r => {
            if (!r.ok) throw new Error(`Historical Matches API returned ${r.status}`);
            const res = await r.json();
            const matches = res.matches || [];

            const columns = ['Date', 'Opponent', 'Result', 'Runs Scored', 'Runs Against', 'Venue', 'Competition'];
            const rows = matches.map((m: any) => {
              const dateStr = new Date(m.matchDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
              return [
                dateStr,
                m.opponentCode || 'UNK',
                m.result || 'D',
                m.goalsFor != null ? m.goalsFor : '-',
                m.goalsAgainst != null ? m.goalsAgainst : '-',
                m.venueType || 'neutral',
                m.competition || 'Unknown'
              ];
            });

            return {
              id: `mlb_matches_${Date.now()}`,
              type: 'DATA_TABLE',
              resolution_state: 'RESOLVED',
              context_summary: `${safeTeam} MLB Historical Matches`,
              data: {
                title: `${safeTeam} MLB Historical Results Ledger (Last ${safeLimit} matches)`,
                columns,
                rows,
                source: 'ESPN Results',
              }
            };
          }),
        'MLB Historical Matches'
      );
    }

    default:
      return { error: `Unrecognized sports tool: ${name}` };
  }
}
