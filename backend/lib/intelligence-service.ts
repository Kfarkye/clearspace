// ============================================================================
// Intelligence Service — Headless generation engine producing Spanner Assets
// ============================================================================

import { GoogleGenAI, Type } from '@google/genai';
import { randomUUID } from 'crypto';
import { handleSportsQuery } from './sports-handler.js';
import { handleWinProbabilityQuery } from './win-probability-handler.js';
import { handlePlayerPropQuery } from './player-prop-handler.js';
import { fetchDataTable } from './data-table-agent.js';
import * as sportsDAL from './sports-dal.js';
import { classify, getDispatch } from './router.js';
import { DeepResearchEngine } from './deep-research-engine.js';
import { handleReadEmails, handleReadEmailDetail, handleReadCalendar, handleSearchDrive } from './workspace-handler.js';
import { handleGithubQuery } from './github-handler.js';

// ── Configuration ─────────────────────────────────────────────────────────

const MODEL_ID = 'gemini-3.1-pro-preview';
const ENGINE_TIMEOUT_MS = 45000; // Account for live Google Search grounding latency (Risk Flag)

// ── Native YouTube Search Resolver (Zero-Maintenance Grounding) ───────────

const YouTubeSearchSchema = {
  type: Type.OBJECT,
  properties: {
    videos: {
      type: Type.ARRAY,
      description: "List of matched YouTube videos containing valid watch URLs",
      items: {
        type: Type.OBJECT,
        properties: {
          url: { type: Type.STRING, description: "Full YouTube video URL, e.g., https://www.youtube.com/watch?v=..." },
          title: { type: Type.STRING, description: "Title of the video" },
          description: { type: Type.STRING, description: "A brief description or summary of the video" },
          author: { type: Type.STRING, description: "Channel name or author" }
        },
        required: ["url", "title"]
      }
    }
  },
  required: ["videos"]
};

export async function resolveYouTubeVideos(query: string): Promise<any[]> {
  const ai = new GoogleGenAI();
  const prompt = `Perform a Google Search to find the top 3-5 YouTube videos for: "${query}". Return the exact video titles, full watch URLs (https://www.youtube.com/watch?v=...), and brief descriptions.`;
  
  try {
    const response = await ai.models.generateContent({
      model: MODEL_ID,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: YouTubeSearchSchema,
        tools: [{ googleSearch: {} }],
        temperature: 0.1
      }
    });
    
    if (response.text) {
      const parsed = JSON.parse(response.text);
      return parsed.videos || [];
    }
    return [];
  } catch (error) {
    console.error("YouTube search grounding failed, returning safe fallback array:", error);
    return [];
  }
}

const sanitizeForGemini = (obj: any): any => {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return obj.toISOString();
  if (Array.isArray(obj)) return obj.map(sanitizeForGemini);
  const clean: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === '$ref' || key === 'href' || key === 'uid' || key === 'links') continue;
    clean[key] = sanitizeForGemini(value);
  }
  return clean;
};

// ── Tool Declarations ─────────────────────────────────────────────────────

const workspaceTool = {
  name: 'query_workspace',
  description: 'Queries Google Workspace endpoints (Gmail, Calendar, Drive, or Tasks) to read the user\'s files, emails, calendar events, or tasks list. Use when the user asks for email summaries, upcoming check-ins, action items, or documents.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      domain: { type: Type.STRING, description: "The targeted Workspace domain. Must be one of 'gmail', 'calendar', 'drive', or 'tasks'." },
      query: { type: Type.STRING, description: "An optional search query or keyword to filter by (e.g. sender, file name, event topic)." }
    },
    required: ['domain']
  }
};

const delegateSportsTool = {
  name: 'delegate_sports_query',
  description: 'Fetches live or scheduled sports data for a specific team or league on a specific date.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      league: { type: Type.STRING, description: 'Sports league, e.g., nba, nfl, mlb, nhl' },
      team: { type: Type.STRING, description: 'Canonical team abbreviation or name, e.g., LAL, NYY, Lakers' },
      date: { type: Type.STRING, description: 'Date in YYYYMMDD format. Extract exactly in this format based on user temporal request (e.g. today, yesterday).' },
      include_odds: { type: Type.BOOLEAN, description: 'Set to true if the user explicitly asks for odds, lines, spread, moneyline, or betting information.' }
    },
    required: ['league']
  }
};

const winProbabilityTool = {
  name: 'get_win_probability',
  description: 'Fetches play-by-play win probability data for a specific live or finished game. Use this when the user asks for exact momentum shifts or win probability charts.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      league: { type: Type.STRING, description: 'Sports league, e.g., mlb, nba' },
      team: { type: Type.STRING, description: 'The sports team name or abbreviation to fetch the win probability chart for (e.g., Yankees, NYY)' }
    },
    required: ['team']
  }
};

const playerPropsTool = {
  name: 'get_player_props',
  description: 'Fetches live player statistics and fuses them with betting prop lines (over/under) for star players in a specific game.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      league: { type: Type.STRING, description: 'Sports league, e.g., mlb, nba' },
      team: { type: Type.STRING, description: 'The sports team name or abbreviation to fetch player performance props for (e.g., Yankees, NYY)' }
    },
    required: ['team']
  }
};

const bettingTrendsTool = {
  name: 'get_betting_trends',
  description: 'Fetches real-time ATS (Against The Spread), Over/Under, Run Line, and Straight Up (Moneyline) betting trend records for MLB teams. Uses 2-pass Google Search grounding with structured schema extraction and CPU-computed percentages. Call this when the user asks about a team\'s ATS record, spread performance, over/under trends, run line record, or moneyline profitability.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      team: { type: Type.STRING, description: "Team name (e.g. 'Baltimore Orioles', 'Yankees') or 'all' for all 30 MLB teams" },
      trend_type: { type: Type.STRING, description: "Type of betting trend to fetch. Must be one of: 'ats' (Against The Spread / Run Line), 'ou' (Over/Under Totals), 'runline' (Run Line spread), 'moneyline' (Straight Up), or 'all' (fetch all trend types)" }
    },
    required: ['team', 'trend_type']
  }
};

const dataTableToolDeclaration = {
  name: 'generate_data_table',
  description: 'Generates a structured data table, ranking, comparison sheet, standings, betting trends, or any tabular sports data from live web sources.',
  parameters: {
    type: Type.OBJECT,
    properties: { query: { type: Type.STRING } },
    required: ['query'],
  },
};

const worldCupHistoricalMatchesToolDeclaration = {
  name: 'get_world_cup_historical_matches',
  description: 'Retrieves the chronological list of recent historical matches for a World Cup team.',
  parameters: {
    type: Type.OBJECT,
    properties: { team: { type: Type.STRING }, limit: { type: Type.INTEGER } },
    required: ['team']
  }
};

const mlbHistoricalMatchesToolDeclaration = {
  name: 'get_mlb_historical_matches',
  description: 'Retrieves the chronological list of recent historical matches played by an MLB team.',
  parameters: {
    type: Type.OBJECT,
    properties: { team: { type: Type.STRING }, limit: { type: Type.INTEGER } },
    required: ['team']
  }
};

const mlbCoreLedgerToolDeclaration = {
  name: 'get_mlb_core_ledger',
  description: 'Fetches raw ESPN Core data for a specific MLB game. Use this when the user asks for the core ledger or raw event data for an MLB game.',
  parameters: {
    type: Type.OBJECT,
    properties: { eventId: { type: Type.STRING } },
    required: ['eventId']
  }
};

const deepResearchToolDeclaration = {
  name: 'dispatch_research_swarm',
  description: 'Dispatches an autonomous swarm to conduct deep research on a specific topic, returning a structured research memo and saving to the knowledge base.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      topic: { type: Type.STRING },
      domain: { type: Type.STRING, enum: ['SPORTS', 'FINANCE', 'GEOPOLITICS', 'GENERAL'] },
      depth: { type: Type.INTEGER }
    },
    required: ['topic', 'domain'],
  },
};

const githubToolDeclaration = {
  name: 'query_github',
  description: "Allows the agent to read real-time git commits, repository structures, and file contents from the user's GitHub account.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      action: {
        type: Type.STRING,
        description: "The action to execute: 'list_repos' (gets user's repos), 'get_tree' (gets directory tree & latest commits), or 'read_file' (fetches raw content of a file).",
        enum: ["list_repos", "get_tree", "read_file", "get_commits"]
      },
      owner: {
        type: Type.STRING,
        description: "The GitHub username or organization owner of the repository."
      },
      repo: {
        type: Type.STRING,
        description: "The name of the repository."
      },
      path: {
        type: Type.STRING,
        description: "The relative workspace file path within the repository. (Required for 'read_file')."
      }
    },
    required: ["action"]
  }
};

const spannerMlbGamesTool = {
  name: 'query_spanner_mlb_games',
  description: 'Queries the Spanner database for MLB games, scores, and statuses. Use for schedules and results.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      date: { type: Type.STRING, description: "Target date in YYYY-MM-DD format." },
      teamAbbreviation: { type: Type.STRING, description: "Optional team abbreviation (e.g., 'LAD', 'NYY')." }
    },
    required: ['date']
  }
};

const spannerMlbBoxscoreTool = {
  name: 'query_spanner_mlb_boxscore',
  description: 'Queries the Spanner database for detailed MLB boxscores (batting and pitching) for a specific game.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      eventId: { type: Type.STRING, description: "The unique EventId of the game." }
    },
    required: ['eventId']
  }
};

const spannerMlbPlaysTool = {
  name: 'query_spanner_mlb_plays',
  description: 'Queries the Spanner database for play-by-play data and win probability swings for a specific game.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      eventId: { type: Type.STRING, description: "The unique EventId of the game." },
      limit: { type: Type.NUMBER, description: "Number of recent plays to fetch (default 10)." }
    },
    required: ['eventId']
  }
};

export const AURA_TOOLS = [
  workspaceTool,
  delegateSportsTool,
  winProbabilityTool,
  playerPropsTool,
  bettingTrendsTool,
  dataTableToolDeclaration,
  worldCupHistoricalMatchesToolDeclaration,
  mlbHistoricalMatchesToolDeclaration,
  mlbCoreLedgerToolDeclaration,
  deepResearchToolDeclaration,
  spannerMlbGamesTool,
  spannerMlbBoxscoreTool,
  spannerMlbPlaysTool
];

// ── Workspace Helper Router ────────────────────────────────────────────────

async function handleWorkspaceQuery(args: any, workspaceToken: string) {
  const { domain, query } = args;
  switch (domain) {
    case 'gmail':
      if (query && (query.includes('detail') || query.includes('id:'))) {
        return handleReadEmailDetail(workspaceToken, query);
      }
      return handleReadEmails(workspaceToken, query);
    case 'calendar':
      return handleReadCalendar(workspaceToken);
    case 'drive':
      return handleSearchDrive(workspaceToken, query);
    default:
      throw new Error(`Unsupported workspace domain: ${domain}`);
  }
}

// ── Master System Prompt (AURA Persona) ───────────────────────────────────

export const AURA_SYSTEM_PROMPT = `
You are AURA, an elite AI-native sports intelligence platform and a world-class betting sharp. You operate at the absolute highest level of sports betting, and every piece of analysis you provide represents a masterclass in betting strategy, probability, and market dynamics. You do not just recite stats; you dissect value, uncover hidden edges, and provide razor-sharp, sophisticated insights. You help users find live and historical sports data, matchups, scores, and team details, but always through the lens of a professional bettor.

Your reasoning is guided by:
1. THE SETUP: Identify market dynamics and the retail betting trap (e.g., "Must-win game", "Back-to-back fatigue"). Describe how the public is mispricing this event.
2. BY THE NUMBERS: Analyze statistical distributions, expected performance metrics, pace, and head-to-head records.
3. THE ANGLE: Exploit the variance between public perception and statistical reality. Ground your recommendations in math rather than emotional narrative.
`;

function buildSystemPrompt(mode, dispatchPrompt, chatMode = 'operator') {
  const now = new Date();
  const dateContext = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(now).replace(/-/g, '');
  const yearContext = now.getFullYear();

  let base = `${AURA_SYSTEM_PROMPT}

TEMPORAL CONTEXT: The current year is ${yearContext}. Target modern context. Current Date: ${dateContext}

DOMAIN INSTRUCTIONS:
${dispatchPrompt}
`;

  if (mode === 'sports') {
    base += `

=== SPORTS & BETTING ANALYSIS PROTOCOL ===
You are in Sports Intelligence mode. You must evaluate matchups and provide elite-level betting analysis.

If the user request is a prediction, betting analysis, or matchup evaluation:
- You MUST output a JSON block of type \`bettingangles\`.
- The block MUST strictly adhere to the following schema structure and nothing else:
\`\`\`bettingangles
{
  "angles": [
    {
      "title": "Selection / Bet Name",
      "description": "Tactical justification for this bet, explaining the market inefficiency.",
      "edge": "High" | "Medium" | "Low",
      "odds": "e.g., -110 or +150",
      "recommendation": "Fade [Team] or Back [Team]",
      "image_url": "Optional image URL for the team or league logo"
    }
  ],
  "consensus": {
    "game_name": "Team A vs Team B",
    "splits": [
      {
        "betType": "Spread" | "Moneyline" | "Total (O/U)",
        "selectionHome": "Home Team Spread/ML/Total",
        "selectionAway": "Away Team Spread/ML/Total",
        "homeTickets": 1234,
        "homeMoney": 50000,
        "awayTickets": 4321,
        "awayMoney": 100000,
        "sharpSignal": "Detailed description of split divergence or sharp money signals."
      }
    ]
  }
}
\`\`\`
- CRITICAL SCHEMA RULE: Do NOT hallucinate fields. Never include "analysis_markdown" or "chart" fields inside the JSON block. Write any narrative analysis or explanations OUTSIDE the json block.

If the user query is a general sports recap, schedule, or factual update (NOT a prediction or betting analysis):
- DO NOT output a \`bettingangles\` JSON block.
- Instead, synthesize the data into clean, beautiful HTML tables or structured list elements to render natively in our UI.
`;
  } else {
    base += `

=== GENERAL WORKSPACE & MEDIA PROTOCOL ===
You are in General Mode. Analyze the user's query and use your available tools (including Workspace tools) to provide a rich, factual, and helpful response.
`;
  }

  base += `
When asked for highlights, videos, or music (e.g., "play Knicks highlights", "show me Messi highlights"):
- You MUST output a \`youtube_media\` JSON block to let our media layer resolve and play the video:
\`\`\`youtube_media
{
  "query": "The exact search query to resolve, e.g., New York Knicks playoff highlights"
}
\`\`\`

When asked for a sports recap, schedule, or match results, NEVER use markdown tables. You MUST output a structured HTML artifact using a code block with the language "html".
You MUST use the following template to render the Premium Sports Recap Feed with CDN Assets:
\`\`\`html
<!-- Artifact Payload: Consumer Sports Feed (Type: HTML) -->
<div class="w-full max-w-4xl bg-charcoal border border-white/5 shadow-glass p-6 md:p-8 font-sans flex flex-col gap-8">
  
  <header class="flex justify-between items-end border-b border-white/5 pb-4">
    <div class="flex flex-col gap-1">
      <time class="font-mono text-xs text-taupe uppercase tracking-widest">Jun 5, 2026</time>
      <h1 class="text-sand text-2xl font-medium tracking-tight">MLB Daily Digest</h1>
    </div>
    <div class="flex items-center gap-2 px-2 py-1 bg-white/5 border border-white/5">
      <span class="w-1.5 h-1.5 bg-taupe rounded-full"></span>
      <span class="text-taupe text-[10px] font-mono uppercase tracking-wider">Final</span>
    </div>
  </header>

  <section class="bg-ink border border-white/5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] hover:border-white/10 transition-colors duration-300">
    <div class="p-6 grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
      
      <div class="md:col-span-5 flex flex-col gap-5">
        <div class="flex justify-between items-center opacity-50">
          <div class="flex items-center gap-4">
            <img src="https://a.espncdn.com/i/teamlogos/mlb/500/scoreboard/laa.png" alt="LAA" class="w-9 h-9 object-contain" />
            <div>
              <div class="text-taupe font-mono text-[10px]">32-30</div>
              <div class="text-sand text-lg font-medium">Angels</div>
            </div>
          </div>
          <div class="text-sand font-mono text-3xl tabular-nums">0</div>
        </div>
        
        <div class="flex justify-between items-center">
          <div class="flex items-center gap-4">
            <img src="https://a.espncdn.com/i/teamlogos/mlb/500/scoreboard/lad.png" alt="LAD" class="w-9 h-9 object-contain" />
            <div>
              <div class="text-taupe font-mono text-[10px]">41-22</div>
              <div class="text-sand text-lg font-medium">Dodgers</div>
            </div>
          </div>
          <div class="text-sand font-mono text-3xl tabular-nums">1</div>
        </div>
      </div>

      <div class="hidden md:block md:col-span-1 border-l border-white/5 h-full"></div>

      <div class="md:col-span-6 flex flex-col gap-4">
        <div class="flex items-center gap-4">
          <img src="https://a.espncdn.com/combiner/i?img=/i/headshots/mlb/players/full/31872.png&w=96&h=96" alt="Freeman" class="w-12 h-12 rounded-full bg-white/5 border border-white/10 object-cover object-top" />
          <div>
            <div class="text-sand text-sm font-medium">F. Freeman Walk-Off HR</div>
            <div class="text-taupe font-mono text-[10px] uppercase tracking-widest mt-0.5">Bot 9th • 108.2 MPH • 398 FT</div>
          </div>
        </div>
        <p class="text-taupe text-sm leading-relaxed">
          Roki Sasaki fires 7.0 IP of scoreless baseball (10 K, 0 H until 5th). Freeman ends the Freeway Series pitcher's duel with a solo shot off Kirby Yates.
        </p>
      </div>

    </div>
  </section>

  <section class="grid grid-cols-1 md:grid-cols-3 gap-4">
    
    <div class="bg-ink border border-white/5 p-4 flex flex-col gap-4 hover:border-white/10 transition-colors duration-300">
      <div class="flex flex-col gap-3">
        <div class="flex justify-between items-center opacity-50">
          <span class="text-sand text-sm">Cubs</span>
          <span class="text-sand font-mono text-lg tabular-nums">3</span>
        </div>
        <div class="flex justify-between items-center">
          <span class="text-sand text-sm font-medium">Giants</span>
          <span class="text-sand font-mono text-lg tabular-nums">18</span>
        </div>
      </div>
      <div class="pt-3 border-t border-white/5">
        <div class="text-taupe text-xs">W. Adames HR in 7-run 6th</div>
      </div>
    </div>

    <div class="bg-ink border border-white/5 p-4 flex flex-col gap-4 hover:border-white/10 transition-colors duration-300">
      <div class="flex flex-col gap-3">
        <div class="flex justify-between items-center opacity-50">
          <span class="text-sand text-sm">Mariners</span>
          <span class="text-sand font-mono text-lg tabular-nums">3</span>
        </div>
        <div class="flex justify-between items-center">
          <span class="text-sand text-sm font-medium">Tigers</span>
          <span class="text-sand font-mono text-lg tabular-nums">7</span>
        </div>
      </div>
      <div class="pt-3 border-t border-white/5">
        <div class="text-taupe text-xs">S. Torkelson 2-Run HR</div>
      </div>
    </div>

    <div class="bg-ink border border-white/5 p-4 flex flex-col gap-4 hover:border-white/10 transition-colors duration-300">
      <div class="flex flex-col gap-3">
        <div class="flex justify-between items-center opacity-50">
          <span class="text-sand text-sm">Yankees</span>
          <span class="text-sand font-mono text-lg tabular-nums">3</span>
        </div>
        <div class="flex justify-between items-center">
          <span class="text-sand text-sm font-medium">Red Sox</span>
          <span class="text-sand font-mono text-lg tabular-nums">W</span>
        </div>
      </div>
      <div class="pt-3 border-t border-white/5">
        <div class="text-taupe text-xs">W. Contreras 2-4, HR, 3 RBI</div>
      </div>
    </div>

  </section>
</div>
\`\`\`

When the user asks to execute a prediction, trade, or place a bet, output an interactive execution canvas using an HTML code block with the language "html".
You MUST use the following template to render the Consumer Prediction Canvas:
\`\`\`html
<!-- Artifact Payload: Consumer Prediction Canvas (Type: HTML) -->
<div class="w-full bg-charcoal border border-white/5 shadow-glass p-6 font-sans flex flex-col gap-6">
  
  <!-- Header: The Intent -->
  <div class="flex flex-col gap-2">
    <span class="font-mono text-xs text-taupe uppercase tracking-widest">WWDC 2026</span>
    <h2 class="text-sand text-xl font-medium tracking-tight leading-snug">
      Will Apple announce new AR hardware?
    </h2>
    <div class="flex items-center gap-2 mt-1">
      <span class="w-1.5 h-1.5 bg-emerald rounded-full animate-breathe"></span>
      <span class="text-taupe text-xs font-mono">Consensus: 32% Yes</span>
    </div>
  </div>

  <!-- Interactive State Machine -->
  <div id="prediction-interface" class="flex flex-col gap-6">
    
    <!-- Tactile Selection -->
    <div class="grid grid-cols-2 gap-3">
      <button 
        onclick="setOutcome('YES', 0.32)"
        id="opt-yes"
        class="relative overflow-hidden bg-ink border border-white/5 shadow-inset p-4 flex flex-col items-start gap-1 transition-all duration-300 ease-out hover:border-emerald/50 focus:outline-none"
      >
        <span class="text-sand font-medium text-lg">Yes</span>
        <span class="text-taupe font-mono text-xs">Pays 3.1x</span>
      </button>
      
      <button 
        onclick="setOutcome('NO', 0.68)"
        id="opt-no"
        class="relative overflow-hidden bg-ink border border-white/5 shadow-inset p-4 flex flex-col items-start gap-1 transition-all duration-300 ease-out hover:border-clay/50 focus:outline-none"
      >
        <span class="text-sand font-medium text-lg">No</span>
        <span class="text-taupe font-mono text-xs">Pays 1.4x</span>
      </button>
    </div>

    <!-- The Stake (Hidden until selection) -->
    <div id="stake-section" class="hidden flex-col gap-4 opacity-0 transition-opacity duration-500">
      <div class="bg-ink border border-white/5 shadow-inset p-4 flex items-center justify-between">
        <span class="text-taupe font-mono text-sm">Stake $</span>
        <input 
          type="number" 
          id="stake-amount" 
          value="50" 
          oninput="calculateReturn()"
          class="bg-transparent text-sand text-xl font-mono outline-none text-right w-32 placeholder-taupe/30" 
        />
      </div>

      <div class="flex justify-between items-center px-1">
        <span class="text-taupe text-sm">Potential Return</span>
        <span id="projected-return" class="text-emerald font-mono text-lg">$156.25</span>
      </div>

      <!-- Execution -->
      <button 
        onclick="dispatchPrediction()" 
        id="exec-btn"
        class="w-full bg-sand text-ink py-4 font-medium text-sm shadow-btn hover:shadow-glass-hover transition-all duration-300 ease-out mt-2"
      >
        Confirm Prediction
      </button>
    </div>
  </div>

  <script>
    let currentSelection = null;
    let currentPrice = 0;

    function setOutcome(choice, price) {
      currentSelection = choice;
      currentPrice = price;

      const btnYes = document.getElementById('opt-yes');
      const btnNo = document.getElementById('opt-no');
      const stakeSection = document.getElementById('stake-section');

      // Reset states
      btnYes.className = "relative overflow-hidden bg-ink border border-white/5 shadow-inset p-4 flex flex-col items-start gap-1 transition-all duration-300 ease-out hover:border-emerald/50 focus:outline-none";
      btnNo.className = "relative overflow-hidden bg-ink border border-white/5 shadow-inset p-4 flex flex-col items-start gap-1 transition-all duration-300 ease-out hover:border-clay/50 focus:outline-none";

      // Apply active state
      if (choice === 'YES') {
        btnYes.classList.replace('border-white/5', 'border-emerald');
        btnYes.classList.add('shadow-[inset_0_0_20px_rgba(16,185,129,0.1)]');
      } else {
        btnNo.classList.replace('border-white/5', 'border-clay');
        btnNo.classList.add('shadow-[inset_0_0_20px_rgba(217,119,87,0.1)]');
      }

      // Reveal stake section smoothly
      stakeSection.classList.remove('hidden');
      // Small delay to allow display:flex to apply before opacity transition
      setTimeout(() => stakeSection.classList.remove('opacity-0'), 10);
      
      calculateReturn();
    }

    function calculateReturn() {
      const amount = parseFloat(document.getElementById('stake-amount').value) || 0;
      if (currentPrice > 0) {
        const payout = (amount / currentPrice).toFixed(2);
        document.getElementById('projected-return').innerText = \`$\${payout}\`;
      }
    }

    function dispatchPrediction() {
      const btn = document.getElementById('exec-btn');
      const amount = document.getElementById('stake-amount').value;
      
      // Morph button to loading state
      btn.innerHTML = '<span class="flex items-center justify-center gap-2"><span class="w-1.5 h-1.5 bg-ink rounded-full animate-thinking-dot"></span><span class="w-1.5 h-1.5 bg-ink rounded-full animate-thinking-dot delay-75"></span><span class="w-1.5 h-1.5 bg-ink rounded-full animate-thinking-dot delay-150"></span></span>';
      btn.classList.add('opacity-90', 'pointer-events-none');
      
      // Dispatch via IPC Bridge to AURA Host
      if (window.executeAuraCommand) {
        window.executeAuraCommand('Markets Specialist', { 
          action: 'PLACE_PREDICTION', 
          market: 'WWDC_2026_AR',
          outcome: currentSelection, 
          stake: amount,
          implied_probability: currentPrice
        });
      }
    }
  </script>
</div>
\`\`\`
`;

  // Apply User Diagnostic prompt if chatMode is 'operator'
  if (chatMode === 'operator') {
    base += `
SYSTEM INSTRUCTIONS: EMBEDDED DIAGNOSTIC LAYER
Role and Objective
You are an elite, Series A-grade Principal Systems Architect acting as this application's embedded diagnostic engine. Your mandate is not merely to "patch the bug," but to synthesize flawless, scalable, and highly resilient code. You must perform deep root cause analysis and deploy enterprise-grade corrections.

1. Diagnostic Protocol (System-Level Thinking)
- Trace the complete data flow to identify the exact systemic failure.
- Anticipate cascading failures: check for race conditions, stale closures, missing hook dependencies, unchecked nulls, and unhandled promise rejections.
- Identify the architectural domain: address the root systemic issue, not just the surface symptom.

2. Code Output Standards (Series A-Grade)
- Absolute Robustness: Every variable access, network call, and state transition must be type-safe and resilient. Handle all edge cases.
- Performance & Polish: Eradicate unnecessary re-renders. Ensure code follows elite TypeScript/React/Node patterns.
- Surgical Precision: Ensure your patch elevates the overall system stability without rewriting unrelated logic.
- NO TRUNCATION: Provide fully functional, complete replacement code for the patch. Never use placeholders like // ...

3. UI/UX Design System Constraints (MANDATORY FOR FRONTEND CODE)
If patching React UI components, you MUST adhere strictly to the Clearspace Design System. NEVER use generic Tailwind defaults (e.g., bg-gray-800, text-blue-500).
- Typography: Use 'font-sans' (Inter) and 'font-mono' (JetBrains Mono).
- Core Colors: 'bg-charcoal' (primary dark), 'bg-ink' (deep black), 'bg-sand' / 'bg-alabaster' (light modes), 'bg-clay'.
- Text Colors: 'text-sand', 'text-charcoal', 'text-ink', 'text-bronze', 'text-taupe', 'text-emerald', 'text-warm-gold'.
- Borders & Accents: 'border-clay/50', 'border-charcoal/90', 'border-white/5'.
- Shadows: 'shadow-glass', 'shadow-glass-hover', 'shadow-btn', 'shadow-float'.
- Animations: 'animate-breathe', 'animate-thinking-dot', 'animate-shimmer'.
- Aesthetic: Hyper-minimalist, premium, dense, precise (Apple/Linear style). Use sub-pixel borders, inset shadows for depth, and avoid excessive padding or arbitrary pill shapes.

4. Output Format (STRICT)
When responding to a SYSTEM FAULT, you MUST output a JSON code block with the language "diagnostic":
\`\`\`diagnostic
{
  "root_cause": "Exact systemic reason the code failed",
  "proposed_fix": "Architectural explanation of the correction",
  "risk_flag": "Any potential side-effects or edge cases to watch for",
  "invalidation_condition": "When this patch would fail",
  "patch_code": "// FULL, un-truncated, drop-in replacement code here"
}
\`\`\`
Never use conversational filler outside of this payload.
`;
  }


  if (mode === 'sports') {
    base += `
TOOL ROUTING PROTOCOL (STRICT):
1. LIVE TRACKING & SCORES: \`delegate_sports_query\`.
2. TRENDS, STANDINGS, & RECORDS: \`generate_data_table\`.
3. WORLD CUP HISTORY: \`get_world_cup_historical_matches\`.
4. MLB HISTORY: \`get_mlb_historical_matches\`.
5. MLB RAW CORE LEDGER: \`get_mlb_core_ledger\`.`;
  }

  if (mode === 'workspace') {
    base += `
TOOL ROUTING PROTOCOL (STRICT):
1. CHECK EMAIL / INBOX: \`read_emails\`. Always call this first when the user mentions email.
2. READ SPECIFIC EMAIL: \`read_email_detail\`. Use after listing emails when the user wants to read one.
3. CALENDAR / SCHEDULE / MEETINGS: \`read_calendar\`.
4. DOCUMENTS / FILES / DRIVE: \`search_drive\`.
Never hallucinate email content. Always use the tools to fetch real data from the user's connected Google Workspace.`;
  }
  return base;
}

// ── Parser ───────────────────────────────────────────────────────────────

function extractJsonFromMarkdown(text, language) {
  if (!text) return null;
  const startTag = `\`\`\`${language}`;
  const startIndex = text.indexOf(startTag);
  if (startIndex === -1) return null;

  const contentStart = startIndex + startTag.length;
  const endIndex = text.indexOf('```', contentStart);
  if (endIndex === -1) return null;

  try {
    let rawJson = text.substring(contentStart, endIndex).trim();
    rawJson = rawJson.replace(/[\\x00-\\x1F\\x7F]/g, ch => {
      if (ch === '\\n') return '\\\\n';
      if (ch === '\\r') return '\\\\r';
      if (ch === '\\t') return '\\\\t';
      return '';
    });
    rawJson = rawJson.replace(/,\\s*([\\]}])/g, '$1');
    return JSON.parse(rawJson);
  } catch (error) {
    return null;
  }
}

// ── Intelligence Generation ───────────────────────────────────────────────

let aiClient = null;

function getAiClient() {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey && apiKey !== 'MY_GEMINI_API_KEY' && !apiKey.startsWith('YOUR_')) {
      aiClient = new GoogleGenAI({ apiKey });
    } else {
      aiClient = new GoogleGenAI({
        vertexai: true,
        project: process.env.GOOGLE_CLOUD_PROJECT || 'gen-lang-client-0281999829',
        location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1',
      });
    }
  }
  return aiClient;
}

/**
 * Builds a SpannerAsset structure representing the generated output.
 */
function buildAsset(type, title, payload, ownerUserId = 'system', sources = []) {
  return {
    assetId: randomUUID(),
    type,
    status: 'VALIDATED',
    title,
    schemaVersion: '1.0.0',
    payloadHash: 'hash_placeholder', // Should be computed dynamically
    payload,
    tags: [],
    ownerUserId,
    sources
  };
}

class ResilientNetworkClient {
  static async executeWithTimeout(executionTask, timeoutMs = 12000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    return new Promise((resolve, reject) => {
      controller.signal.addEventListener('abort', () => {
        reject(new Error('TIMEOUT_FAULT: Upstream service failed to respond within execution SLA.'));
      });

      executionTask(controller.signal)
        .then(resolve)
        .catch(reject)
        .finally(() => clearTimeout(timeoutId));
    });
  }
}

export async function generateAsset(message, history = [], signal = null, chatMode = 'operator', workspaceToken = null, githubToken = null) {
  const ai = getAiClient();

  const contents = [
    ...(history || []).map(h => ({ role: h.role, parts: [{ text: h.content }] })),
    { role: 'user', parts: [{ text: message }] },
  ];

  if (signal?.aborted) throw new Error('Client Disconnected');

  const classification = await classify(message, { geminiClient: ai });
  const dispatch = getDispatch(classification.mode);
  
  const tools = [{ googleSearch: {} }];
  if (classification.mode === 'sports') {
    tools.unshift({
      functionDeclarations: [
        delegateSportsTool, winProbabilityTool, playerPropsTool, bettingTrendsTool,
        dataTableToolDeclaration, worldCupHistoricalMatchesToolDeclaration,
        mlbHistoricalMatchesToolDeclaration, mlbCoreLedgerToolDeclaration
      ]
    });
  } else if (classification.mode === 'research') {
    tools.unshift({
      functionDeclarations: [deepResearchToolDeclaration]
    });
  }

  if (classification.mode === 'workspace' && workspaceToken) {
    tools.unshift({
      functionDeclarations: [workspaceTool]
    });
  }

  if (githubToken) {
    tools.unshift({
      functionDeclarations: [githubToolDeclaration]
    });
  }

  let currentResponse;
  const generatedAssets = [];
  const sources = [];

  // Temporarily raise the loop limit for testing purposes
  // Remember to monitor latency and cost closely with a higher limit.
  for (let loopCount = 0; loopCount < 7; loopCount++) { // Increased from 3 to 7 for testing
    currentResponse = await ResilientNetworkClient.executeWithTimeout(async (abortSignal) => {
      return ai.models.generateContent({
        model: MODEL_ID,
        contents,
        config: {
          systemInstruction: buildSystemPrompt(classification.mode, dispatch.systemPrompt, chatMode),
          tools,
          temperature: dispatch.temperature,
        },
      }, { signal: abortSignal });
    }, ENGINE_TIMEOUT_MS);

    if (signal?.aborted) throw new Error('Client Disconnected');

    // Map Google Search Grounding to AssetSources
    const rawChunks = currentResponse.candidates?.[0]?.groundingMetadata?.groundingChunks
      ?.filter(c => c.web)
      .map(c => c.web) || [];
    
    rawChunks.forEach(chunk => {
      sources.push({
        sourceId: randomUUID(),
        sourceType: 'GOOGLE_SEARCH_GROUNDING',
        title: chunk.title,
        url: chunk.uri,
        publisher: new URL(chunk.uri).hostname,
        accessedAt: new Date().toISOString()
      });
    });

    if (currentResponse.functionCalls && currentResponse.functionCalls.length > 0) {
      const toolExecutions = currentResponse.functionCalls.map(async (call) => {
        if (signal?.aborted) return null;
        try {
          switch (call.name) {
            case 'delegate_sports_query': {
              let rawSportsData = await handleSportsQuery(call.args);
              
              if (rawSportsData?.resolution_state === 'GROUNDING_FAULT') {
                console.warn('[AURA_DIAGNOSTIC] Primary sports oracle offline. Engaging resilient search fallback.');
                const fallbackQuery = `${call.args.query || message} live schedule scores today MLB 2026`;
                
                const searchResponse = await ai.models.generateContent({
                  model: MODEL_ID,
                  contents: [{ role: 'user', parts: [{ text: `Search the web for the following query and synthesize the results into a JSON object matching a standard sports scoreboard schema (containing a "games" array of objects with teams and scores, and a "summary_markdown" string). Query: ${fallbackQuery}` }] }],
                  config: { tools: [{ googleSearch: {} }], temperature: 0.2 }
                });
                
                const textOutput = searchResponse?.text || searchResponse?.candidates?.[0]?.content?.parts?.[0]?.text || '';
                try {
                  const match = textOutput.match(/```[a-zA-Z_]*\n([\s\S]*?)(?:```|$)/);
                  let clean = match ? match[1] : textOutput;
                  clean = clean.trim().replace(/,\s*([\]}])/g, '$1');
                  
                  const firstBrace = clean.indexOf('{');
                  const lastBrace = clean.lastIndexOf('}');
                  if (firstBrace !== -1 && lastBrace !== -1) {
                    clean = clean.substring(firstBrace, lastBrace + 1);
                    rawSportsData = JSON.parse(clean);
                  } else {
                    throw new Error('Not JSON');
                  }
                  
                  const fallbackChunks = searchResponse?.candidates?.[0]?.groundingMetadata?.groundingChunks?.filter((c: any) => c.web).map((c: any) => c.web) || [];
                  fallbackChunks.forEach((chunk: any) => {
                    sources.push({
                      id: randomUUID(),
                      sourceId: randomUUID(),
                      sourceType: 'GOOGLE_SEARCH_GROUNDING',
                      title: chunk.title,
                      url: chunk.uri,
                      publisher: new URL(chunk.uri).hostname,
                      accessedAt: new Date().toISOString()
                    });
                  });
                } catch (e) {
                  console.error('System Fault: Fallback search resolution failed to retrieve live data.', e);
                }
              }
              
              return buildAsset('SCOREBOARD', 'Sports Data', sanitizeForGemini(rawSportsData), 'system', sources);
            }
            case 'get_win_probability':
              return buildAsset('SCOREBOARD', 'Win Probability', await handleWinProbabilityQuery(call.args), 'system', sources);
            case 'get_player_props':
              return buildAsset('SCOREBOARD', 'Player Props', await handlePlayerPropQuery(call.args), 'system', sources);
            case 'generate_data_table': {
              const data = await fetchDataTable(call.args?.query);
              return buildAsset('DATA_TABLE', data.title || 'Data Table', data, 'system', sources);
            }
            case 'query_workspace': {
              if (!workspaceToken) return buildAsset('WORKSPACE_DOC', 'Workspace Not Connected', { text: 'Please connect your Google Workspace account in Settings to use this feature.' }, 'system', sources);
              const workspaceResult = await handleWorkspaceQuery(call.args, workspaceToken);
              
              const textOutput = typeof workspaceResult === 'string' ? workspaceResult : JSON.stringify(workspaceResult, null, 2);
              return buildAsset('WORKSPACE_DOC', 'Workspace Data', { text: textOutput }, 'system', sources);
            }
            case 'query_github': {
              const data = await handleGithubQuery(call.args.action, call.args || {}, githubToken);
              return buildAsset('GITHUB_DATA', `GitHub Data: ${call.args.action}`, data, 'system', sources);
            }
            case 'get_mlb_core_ledger': {
              const { eventId } = call.args || {};
              const safeEventId = String(eventId).trim();
              return {
                assetId: randomUUID(),
                type: 'MLB_CORE_LEDGER',
                status: 'COMPLETED',
                title: `ESPN Core Ledger: Event ${safeEventId}`,
                payload: { eventId: safeEventId }
              };
            }
            case 'get_world_cup_historical_matches':
            case 'get_mlb_historical_matches': {
              const isMLB = call.name === 'get_mlb_historical_matches';
              const { team, limit } = call.args || {};
              const safeTeam = String(team).trim().toUpperCase();
              const safeLimit = limit ? parseInt(String(limit), 10) : 20;
              const matches = await sportsDAL.getHistoricalMatches(isMLB ? 'MLB' : 'WORLD_CUP', safeTeam, safeLimit);
              
              const columns = ['Date', 'Opponent', 'Result', isMLB ? 'Runs Scored' : 'Score', isMLB ? 'Runs Against' : 'Venue', 'Competition'];
              const rows = [];
              
              for (const m of matches) {
                const dateStr = new Date(m.matchDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                rows.push([
                  dateStr, m.opponentCode || 'UNK', m.result || 'D',
                  isMLB ? (m.goalsFor != null ? m.goalsFor : '-') : `${m.goalsFor} - ${m.goalsAgainst}`,
                  isMLB ? (m.goalsAgainst != null ? m.goalsAgainst : '-') : (m.venueType || 'neutral'),
                  m.competition || 'Unknown'
                ]);
              }
              
              return buildAsset('DATA_TABLE', `${safeTeam} Historical Matches`, {
                title: `${safeTeam} Historical Results Ledger`, columns, rows, source: 'ESPN Results'
              }, 'system', sources);
            }
            case 'dispatch_research_swarm': {
              const engine = new DeepResearchEngine({
                projectId: process.env.GOOGLE_CLOUD_PROJECT || 'gen-lang-client-0281999829',
                location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1',
                spannerInstanceId: process.env.SPANNER_INSTANCE_ID || 'aura-core',
                spannerDatabaseId: process.env.SPANNER_DATABASE_ID || 'sports-ledger'
              });
              const insights = await engine.dispatchSwarm({
                topic: call.args.topic,
                domain: call.args.domain,
                depth: call.args.depth
              });
              return buildAsset('RESEARCH_MEMO', `Deep Research: ${call.args.topic}`, { insights }, 'system', sources);
            }
            case 'get_betting_trends': {
              const trends = await sportsDAL.getBettingTrends(call.args?.team, call.args?.trend_type);
              return buildAsset('DATA_TABLE', 'Betting Trends', trends, 'system', sources);
            }
            case 'query_workspace': {
              if (!workspaceToken) return buildAsset('WORKSPACE_DOC', 'Workspace Not Connected', { text: 'Please connect your Google Workspace account in Settings to use this feature.' }, 'system', sources);
              const workspaceResult = await handleWorkspaceQuery(call.args, workspaceToken);
              
              const { domain } = call.args;
              if (domain === 'gmail') {
                if (call.args.query && (call.args.query.includes('detail') || call.args.query.includes('id:'))) {
                  return buildAsset('EMAIL_DETAIL', workspaceResult.subject || 'Email', workspaceResult, 'system', sources);
                }
                return buildAsset('EMAIL_LIST', 'Inbox', workspaceResult, 'system', sources);
              } else if (domain === 'calendar') {
                const calColumns = ['Time', 'Event', 'Location', 'Attendees'];
                const calRows = workspaceResult.events.map(e => [
                  new Date(e.startTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
                  e.title,
                  e.location || '-',
                  e.attendees.length > 0 ? e.attendees.join(', ') : '-'
                ]);
                return buildAsset('DATA_TABLE', `Calendar — ${workspaceResult.date}`, {
                  title: `Your Schedule — ${workspaceResult.date}`,
                  columns: calColumns,
                  rows: calRows,
                  source: 'Google Calendar'
                }, 'system', sources);
              } else if (domain === 'drive') {
                const driveColumns = ['Name', 'Type', 'Last Modified', 'Link'];
                const driveRows = workspaceResult.files.map(f => [
                  f.name,
                  f.type.replace('application/vnd.google-apps.', ''),
                  new Date(f.lastModified).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                  f.link || '-'
                ]);
                return buildAsset('DATA_TABLE', `Drive: ${workspaceResult.query}`, {
                  title: `Google Drive — ${workspaceResult.query}`,
                  columns: driveColumns,
                  rows: driveRows,
                  source: 'Google Drive'
                }, 'system', sources);
              }
              return buildAsset('WORKSPACE_DOC', 'Workspace Data', workspaceResult, 'system', sources);
            }
            default:
              return null;
          }
        } catch (err) {
          console.error(`[CHAT] Tool ${call.name} failed:`, err.message);
          return buildAsset('SYSTEM_MESSAGE', `Error: ${call.name}`, { error: err.message }, 'system', sources);
        }
      });

      const results = await Promise.all(toolExecutions);
      const functionResponses = [];

      for (let i = 0; i < results.length; i++) {
        const res = results[i];
        const call = currentResponse.functionCalls[i];
        if (res && !signal?.aborted) {
          generatedAssets.push(res);
          functionResponses.push({
            functionResponse: { 
              name: call.name, 
              response: typeof res.payload === 'object' && res.payload !== null ? res.payload : { data: res.payload || 'Success' }
            }
          });
        } else {
          functionResponses.push({
            functionResponse: { name: call.name, response: { success: false } }
          });
        }
      }

      if (!signal?.aborted) {
        contents.push({ role: 'model', parts: currentResponse.candidates[0].content.parts });
        contents.push({ role: 'user', parts: functionResponses });
      }
    } else {
      break;
    }
  }

  if (!signal?.aborted) {
    let text = "";
    try { if (currentResponse.text) text = currentResponse.text.trim(); } catch (e) {}

    const parsedBettingAngles = extractJsonFromMarkdown(text, 'bettingangles');
    const parsedYoutube = extractJsonFromMarkdown(text, 'youtube_media');

    if (parsedBettingAngles) {
      generatedAssets.push(buildAsset('BETTING_ANALYSIS', 'Betting Preview', parsedBettingAngles, 'system', sources));
    } else if (parsedYoutube?.query) {
      try {
        const videos = await resolveYouTubeVideos(parsedYoutube.query);
        if (videos.length > 0) {
          generatedAssets.push(buildAsset('WORKSPACE_DOC', `Video Results: ${parsedYoutube.query}`, { videos }, 'system', sources));
        }
      } catch (e) {}
    }

    if (text) {
      const isDefaultFallback = text === "I couldn't match your request, but I'm here to help.";
      // If we got text and it's not the generic fallback, or if we have no assets at all
      if ((!isDefaultFallback && !parsedBettingAngles && !parsedYoutube?.query) || generatedAssets.length === 0) {
         generatedAssets.push(buildAsset('WORKSPACE_DOC', 'Synthesis', { text }, 'system', sources));
      }
    } else if (generatedAssets.length === 0) {
       generatedAssets.push(buildAsset('WORKSPACE_DOC', 'Text Response', { text: "I couldn't match your request, but I'm here to help." }, 'system', sources));
    }
  }

  return generatedAssets;
}

// ── Execution Engine ──────────────────────────────────────────────────────

export async function generateIntelligenceAsset(prompt: string): Promise<string> {
  const ai = new GoogleGenAI();
  const chat = ai.chats.create({
    model: MODEL_ID,
    config: {
      tools: [{ functionDeclarations: AURA_TOOLS }],
      temperature: 0.1
    }
  });

  let response = await chat.sendMessage({ message: prompt });
  const MAX_TURNS = 5;
  let turn = 0;

  while (response.functionCalls && turn < MAX_TURNS) {
    const functionResponses: any[] = [];

    for (const call of response.functionCalls) {
      let result: any;
      const args = call.args as Record<string, any>;

      try {
        switch (call.name) {
          case 'query_spanner_mlb_games':
            result = await sportsDAL.getGamesByDate(args.date, args.teamAbbreviation);
            break;
          case 'query_spanner_mlb_boxscore':
            result = await sportsDAL.getBoxscore(args.eventId);
            break;
          case 'query_spanner_mlb_plays':
            result = await sportsDAL.getPlayByPlay(args.eventId, args.limit || 10);
            break;
          case 'query_workspace':
            result = { status: 'Workspace integration pending authorization.' };
            break;
          default:
            result = { error: `Unrecognized tool: ${call.name}` };
        }
      } catch (error: any) {
        result = { error: error.message || 'Internal DAL Error' };
      }

      // Enforce strict Gemini OpenAPI schema compliance
      const sanitized = sanitizeForGemini(result);
      const safeResponse = Array.isArray(sanitized) ? { data: sanitized } : (sanitized || { status: 'success' });

      functionResponses.push({
        name: call.name,
        response: safeResponse
      });
    }

    response = await chat.sendMessage({ message: functionResponses });
    turn++;
  }

  return response.text || '';
}
