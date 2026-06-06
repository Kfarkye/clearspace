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

// ── Configuration ─────────────────────────────────────────────────────────

const MODEL_ID = 'gemini-3.1-pro-preview';
const ENGINE_TIMEOUT_MS = 120000;

// ── YouTube LRU Cache ─────────────────────────────────────────────────────
const ytCache = new Map();
const YT_CACHE_TTL = 1000 * 60 * 15;

async function searchYouTubeCached(query) {
  const normalizedQuery = query.toLowerCase().trim();
  const now = Date.now();
  const cached = ytCache.get(normalizedQuery);
  if (cached && now < cached.expiresAt) return cached.data;
  let ytSearch;
  try { ytSearch = (await import('yt-search')).default; } catch { return []; }
  const r = await ytSearch(normalizedQuery);
  const videos = r.videos.slice(0, 3).map(v => ({
    title: v.title, url: v.url, thumbnail: v.thumbnail,
    author: v.author?.name, duration: v.timestamp,
  }));
  ytCache.set(normalizedQuery, { data: videos, expiresAt: now + YT_CACHE_TTL });
  return videos;
}

const sanitizeForGemini = (obj) => {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeForGemini);
  const clean = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === '$ref' || key === 'href' || key === 'uid' || key === 'links') continue;
    clean[key] = sanitizeForGemini(value);
  }
  return clean;
};

// ── Tool Declarations ─────────────────────────────────────────────────────

const sportsToolDeclaration = {
  name: 'delegate_sports_query',
  description: 'Fetches live scoreboards, game status, and scheduled sports data.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      team: { type: Type.STRING },
      league: { type: Type.STRING },
      date: { type: Type.STRING },
      include_odds: { type: Type.BOOLEAN },
    },
    required: ['league'],
  },
};

const winProbabilityToolDeclaration = {
  name: 'get_win_probability',
  description: 'Fetches play-by-play win probability data.',
  parameters: {
    type: Type.OBJECT,
    properties: { team: { type: Type.STRING }, league: { type: Type.STRING } },
    required: ['team'],
  },
};

const playerPropToolDeclaration = {
  name: 'get_player_props',
  description: 'Fetches live player statistics fused with betting prop lines.',
  parameters: {
    type: Type.OBJECT,
    properties: { team: { type: Type.STRING }, league: { type: Type.STRING } },
    required: ['team'],
  },
};

// ── Workspace Tool Declarations ───────────────────────────────────────────

const readEmailsToolDeclaration = {
  name: 'read_emails',
  description: 'Lists emails from the user\'s Gmail inbox. Use when the user asks to check email, read inbox, or search for specific emails.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: { type: Type.STRING, description: 'Gmail search query (e.g. "is:unread", "from:boss@company.com", "subject:invoice")' },
      maxResults: { type: Type.INTEGER, description: 'Number of emails to return (default 10, max 20)' }
    },
  },
};

const readEmailDetailToolDeclaration = {
  name: 'read_email_detail',
  description: 'Reads the full body and attachments of a specific email by its message ID. Use after listing emails to read a specific one.',
  parameters: {
    type: Type.OBJECT,
    properties: { messageId: { type: Type.STRING } },
    required: ['messageId'],
  },
};

const readCalendarToolDeclaration = {
  name: 'read_calendar',
  description: 'Fetches today\'s calendar events from the user\'s Google Calendar. Use when the user asks about their schedule, meetings, or what\'s on their calendar.',
  parameters: {
    type: Type.OBJECT,
    properties: {},
  },
};

const searchDriveToolDeclaration = {
  name: 'search_drive',
  description: 'Searches the user\'s Google Drive for files by name or type. Use when the user asks about their documents, spreadsheets, or files.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: { type: Type.STRING, description: 'Search term to filter files by name' },
      type: { type: Type.STRING, enum: ['all', 'docs', 'sheets', 'slides'], description: 'Filter by file type' }
    },
  },
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

// ── System Prompt ─────────────────────────────────────────────────────────

function buildSystemPrompt(mode, dispatchPrompt, chatMode = 'operator') {
  const now = new Date();
  const dateContext = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(now).replace(/-/g, '');
  const yearContext = now.getFullYear();

  let base = `You are AURA, an elite computational intelligence platform.
TEMPORAL CONTEXT: The current year is ${yearContext}. Target modern context. Current Date: ${dateContext}

DOMAIN INSTRUCTIONS:
${dispatchPrompt}

When surfacing betting analysis, output using a JSON code block with the language "bettingangles".
You MUST use the following strict schema:
{
  "angles": [{
    "title": "Matchup or Angle Name", "market_price": "-150", "fair_price": "-170",
    "edge_source": "Polymarket", "live_state": "Bot 6th, 2 Outs, Bases Loaded",
    "risk_flag": "Critical vulnerability", "why_now": "Immediate trigger condition",
    "invalidation_condition": "When to pass on this bet", "book": "DraftKings", "deepLink": "url"
  }]
}

When asked for highlights or videos, output a JSON code block with language "youtube_media":
\`\`\`youtube_media
{ "query": "search terms here" }
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
4. MLB HISTORY: \`get_mlb_historical_matches\`.`;
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

export async function generateAsset(message, history = [], signal = null, chatMode = 'operator', workspaceToken = null) {
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
        sportsToolDeclaration, winProbabilityToolDeclaration, playerPropToolDeclaration,
        dataTableToolDeclaration, worldCupHistoricalMatchesToolDeclaration,
        mlbHistoricalMatchesToolDeclaration
      ]
    });
  } else if (classification.mode === 'research') {
    tools.unshift({
      functionDeclarations: [deepResearchToolDeclaration]
    });
  }

  if (classification.mode === 'workspace' && workspaceToken) {
    tools.unshift({
      functionDeclarations: [
        readEmailsToolDeclaration, readEmailDetailToolDeclaration,
        readCalendarToolDeclaration, searchDriveToolDeclaration
      ]
    });
  }

  let response;
  response = await ResilientNetworkClient.executeWithTimeout(async (abortSignal) => {
    // Pass the abortSignal into the config options so the underlying fetch can gracefully terminate the socket.
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
  const rawChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks
    ?.filter(c => c.web)
    .map(c => c.web) || [];
  
  const sources = rawChunks.map(chunk => ({
    sourceId: randomUUID(),
    sourceType: 'GOOGLE_SEARCH_GROUNDING',
    title: chunk.title,
    url: chunk.uri,
    publisher: new URL(chunk.uri).hostname,
    accessedAt: new Date().toISOString()
  }));

  const generatedAssets = [];

  if (response.functionCalls && response.functionCalls.length > 0) {
    const toolExecutions = response.functionCalls.map(async (call) => {
      if (signal?.aborted) return null;
      try {
        switch (call.name) {
          case 'delegate_sports_query': {
            let rawSportsData = await handleSportsQuery(call.args);
            
            // --- Fallback Interceptor ---
            if (rawSportsData?.resolution_state === 'GROUNDING_FAULT') {
              console.warn('[AURA_DIAGNOSTIC] Primary sports oracle offline. Engaging resilient search fallback.');
              const fallbackQuery = `${call.args.query || message} live schedule scores today MLB 2026`;
              
              const searchResponse = await ai.models.generateContent({
                model: MODEL_ID,
                contents: [{ role: 'user', parts: [{ text: `Search the web for the following query and synthesize the results into a JSON object matching a standard sports scoreboard schema (containing a "games" array of objects with teams and scores, and a "summary_markdown" string). Query: ${fallbackQuery}` }] }],
                config: {
                  tools: [{ googleSearch: {} }],
                  temperature: 0.2
                }
              });
              
              const textOutput = searchResponse?.text || searchResponse?.candidates?.[0]?.content?.parts?.[0]?.text || '';
              try {
                const match = textOutput.match(/```[a-zA-Z_]*\n([\s\S]*?)(?:```|$)/);
                let clean = match ? match[1] : textOutput;
                clean = clean.trim().replace(/,\s*([\]}])/g, '$1');
                
                // Find first '{'
                const firstBrace = clean.indexOf('{');
                const lastBrace = clean.lastIndexOf('}');
                if (firstBrace !== -1 && lastBrace !== -1) {
                  clean = clean.substring(firstBrace, lastBrace + 1);
                  rawSportsData = JSON.parse(clean);
                } else {
                  throw new Error('Not JSON');
                }
                
                // Attach the new sources from the fallback grounding
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
            const isBettingIntent = /bet|pick|parlay|edge|odds/i.test(message);
            
            if (isBettingIntent) {
              const bettingPrompt = `Based on the following live sports data, provide your best bets. \n\nYou MUST output using a JSON code block with the language "bettingangles" containing an "angles" array.\n\nData Context:\n${JSON.stringify(sanitizeForGemini(rawSportsData))}`;
              
              const bettingResponse = await ai.models.generateContent({
                model: MODEL_ID,
                contents: [{ role: 'user', parts: [{ text: bettingPrompt }] }],
                config: { 
                  systemInstruction: buildSystemPrompt('sports', getDispatch('sports').systemPrompt, chatMode),
                  temperature: 0.5 
                }
              });
              
              const textOutput = bettingResponse?.text || bettingResponse?.candidates?.[0]?.content?.parts?.[0]?.text || '';
              return buildAsset('WORKSPACE_DOC', 'Betting Analysis', { text: textOutput }, 'system', sources);
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
          case 'read_emails': {
            if (!workspaceToken) return buildAsset('WORKSPACE_DOC', 'Workspace Not Connected', { text: 'Please connect your Google Workspace account in Settings to use this feature.' }, 'system', sources);
            const emailResult = await handleReadEmails(workspaceToken, call.args?.query, call.args?.maxResults);
            return buildAsset('EMAIL_LIST', 'Inbox', emailResult, 'system', sources);
          }
          case 'read_email_detail': {
            if (!workspaceToken) return buildAsset('WORKSPACE_DOC', 'Workspace Not Connected', { text: 'Please connect your Google Workspace account in Settings to use this feature.' }, 'system', sources);
            const emailDetail = await handleReadEmailDetail(workspaceToken, call.args?.messageId);
            return buildAsset('EMAIL_DETAIL', emailDetail.subject || 'Email', emailDetail, 'system', sources);
          }
          case 'read_calendar': {
            if (!workspaceToken) return buildAsset('WORKSPACE_DOC', 'Workspace Not Connected', { text: 'Please connect your Google Workspace account in Settings to use this feature.' }, 'system', sources);
            const calendarResult = await handleReadCalendar(workspaceToken);
            const calColumns = ['Time', 'Event', 'Location', 'Attendees'];
            const calRows = calendarResult.events.map(e => [
              new Date(e.startTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
              e.title,
              e.location || '-',
              e.attendees.length > 0 ? e.attendees.join(', ') : '-'
            ]);
            return buildAsset('DATA_TABLE', `Calendar — ${calendarResult.date}`, {
              title: `Your Schedule — ${calendarResult.date}`,
              columns: calColumns,
              rows: calRows,
              source: 'Google Calendar'
            }, 'system', sources);
          }
          case 'search_drive': {
            if (!workspaceToken) return buildAsset('WORKSPACE_DOC', 'Workspace Not Connected', { text: 'Please connect your Google Workspace account in Settings to use this feature.' }, 'system', sources);
            const driveResult = await handleSearchDrive(workspaceToken, call.args?.query, call.args?.type);
            const driveColumns = ['Name', 'Type', 'Last Modified', 'Link'];
            const driveRows = driveResult.files.map(f => [
              f.name,
              f.type.replace('application/vnd.google-apps.', ''),
              new Date(f.lastModified).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
              f.link || '-'
            ]);
            return buildAsset('DATA_TABLE', `Drive: ${driveResult.query}`, {
              title: `Google Drive — ${driveResult.query}`,
              columns: driveColumns,
              rows: driveRows,
              source: 'Google Drive'
            }, 'system', sources);
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
    for (const res of results) {
      if (res && !signal?.aborted) generatedAssets.push(res);
    }
  }

  if (generatedAssets.length === 0 && !signal?.aborted) {
    let text = "I couldn't match your request, but I'm here to help.";
    try { if (response.text) text = response.text.trim(); } catch (e) {}

    const parsedBettingAngles = extractJsonFromMarkdown(text, 'bettingangles');
    const parsedYoutube = extractJsonFromMarkdown(text, 'youtube_media');

    if (parsedBettingAngles) {
      generatedAssets.push(buildAsset('BETTING_ANALYSIS', 'Betting Preview', parsedBettingAngles, 'system', sources));
    } else if (parsedYoutube?.query && !signal?.aborted) {
      try {
        const videos = await searchYouTubeCached(parsedYoutube.query);
        if (videos.length > 0) {
          generatedAssets.push(buildAsset('WORKSPACE_DOC', `Video Results: ${parsedYoutube.query}`, { videos }, 'system', sources));
        }
      } catch (e) {}
    }

    if (generatedAssets.length === 0) {
      generatedAssets.push(buildAsset('WORKSPACE_DOC', 'Text Response', { text }, 'system', sources));
    }
  }

  return generatedAssets;
}
