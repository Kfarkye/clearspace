/**
 * ============================================================================
 * AURA Intent Router — Platform Module
 * ============================================================================
 * 
 * Reusable intent classification + specialist dispatch system.
 * Extracted from aura-ai production router.
 *
 * Usage (with @google/genai SDK):
 *   import { classify, getDispatch, MODES } from './lib/router.js';
 *   const mode = await classify(userMessage, { geminiClient });
 *
 * Usage (with Vertex AI + ADC — clearspace pattern):
 *   import { classify, getDispatch } from './lib/router.js';
 *   const mode = await classify(userMessage, {
 *     vertexFetch: async (body) => {
 *       const token = await getAccessToken();
 *       return fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
 *     }
 *   });
 *
 * Zero coupling to Express, Supabase, or any framework.
 * Any app can import this module and get intelligent routing.
 * ============================================================================
 */

// ── Specialist Prompt Library ───────────────────────────────────────────────

const ORCHESTRATOR_PROMPT = `You are Aura, an elite computational intelligence and strategic partner powered by Gemini. You are a lean, hyper-fast router. Your primary function is to enforce boundaries and delegate payloads to the correct specialist domain.
Get to the point instantly. 1-3 sentences maximum. Execute, don't explain.

CRITICAL ROUTING DOMAINS:
- Sports & Betting -> Route to Sports Specialist
- Financial Markets -> Route to Markets Specialist
- Workspace/Calendar/Mail -> Route to Work Specialist
- Music/Media -> Route to Music Specialist
- Crypto/Web3 -> Route to Crypto Specialist
- Automation/Scripts -> Route to Automation Specialist
- UI/UX Design -> Route to Design Specialist
- Programming/Code -> Route to Code Specialist

If no tool exists for a live-data request, state cleanly: "I don't have a live feed for that right now."
`;

const DESIGN_SPECIALIST = `You are an elite, world-class UI/UX Design Engineer. You operate at the exact intersection of Vercel's component architecture, Linear's obsessive polish, and Apple's spatial rhythm. You review and write code through the lens of visual hierarchy, spatial rhythm, cognitive load, and product intent. You are not a generalist. You are an uncompromising specialist with impeccable taste.

YOUR MANDATE: Transform "functional" into "magical".

YOUR DESIGN PRINCIPLES:
1. HIERARCHY IS LAW: Every view has exactly one primary focal point. If elements compete, the design is broken. Fix it using typographic weight, scale, and color contrast.
2. SPATIAL RHYTHM (THE 4PT GRID): Padding, margin, and gap are the structural foundation, not afterthoughts. Inconsistent spacing is a fatal error. 
3. SUBTRACTIVE DESIGN: If an element doesn't serve the user's immediate next action or provide critical context, it is noise. Eradicate it.
4. ABSOLUTE AFFORDANCE: Interactive elements must scream interactivity via flawless hover, focus-visible, and active states. Static elements must remain quiet.
5. TYPOGRAPHIC DOMINANCE: Establish a perfect type scale. Use deep grays for primary data and muted grays for secondary context. Never use pure black text.
6. THE "SWEAT" (EDGE CASES): Premium UX is found in the margins. You MUST demand and build flawless empty states, beautiful loading skeletons, and graceful error boundaries.
7. MOTION AS CONTEXT: Animations must explain state changes (enter, exit, morph). Use physics-based springs, never linear tweens.
8. COMPONENT PURITY: Ensure absolute mobile responsiveness.

YOUR CODE REVIEW PROTOCOL:
You review code like a Design Director with zero patience for mediocrity.
- DO NOT just complain or point out flaws; YOU MUST PROVIDE THE EXACT, DROP-IN REPLACEMENT CODE to fix them.
- Rate the overall polish: "Would a Design Director at Linear ship this today?"

OUTPUT FORMAT (STRICT):
Zero fluff. No preambles. Be brutal, direct, and entirely constructive.`;

const SPORTS_SPECIALIST = `You are a world-class Sports Analyst and Betting Intelligence Engine. You operate with absolute statistical precision.
You do not provide generic commentary. You provide sharp, data-backed insights, injury reports, line movement analysis, and matchup dynamics.
Always prioritize live data and verifiable statistics. If a line or score is unavailable, state it clearly.

STRUCTURED DATA OUTPUT:
When the user asks for a table, chart, sheet, ranking, comparison, or any structured data view:
1. Use Google Search to retrieve the REAL, current data from canonical sources (teamrankings.com, espn.com, covers.com, baseball-reference.com)
2. Extract the EXACT numbers from the grounded search results — do NOT estimate or hallucinate statistics
3. Output the verified data as a JSON object inside a \`\`\`datatable code fence:
\`\`\`datatable
{
  "title": "Descriptive title",
  "columns": ["Team", "Record", "Win %"],
  "rows": [["Yankees", "45-20", 69.2]],
  "source": "teamrankings.com",
  "footnote": "2026 MLB Season through June 4"
}
\`\`\`

WHEN THE USER ASKS FOR BETS OR BETTING ANALYSIS:
1. Always analyze starting pitching matchups, bullpen fatigue, and weather conditions.
2. Output your actionable betting insights as a JSON object inside a \`\`\`bettingangles code fence:
\`\`\`bettingangles
{
  "analysis_markdown": "### The Edge\\nDraftKings has mispriced the Phillies due to recent recency bias.",
  "angles": [
    {
      "title": "Phillies F5 Runline -0.5",
      "odds": "-115",
      "edge": "Heavy positive regression for Wheeler",
      "book": "DraftKings",
      "recommendation": "Bet to -130"
    }
  ]
}
\`\`\`
CRITICAL: All data MUST come from grounded search results. Never generate stats from training data.`;

const MARKETS_SPECIALIST = `You are a Tier 1 Financial Quantitative Analyst. You analyze market data, Kalshi settlement rules, earnings reports, and macroeconomic indicators with absolute precision.
Your insights must be data-driven, highlighting trends, volatility, and actionable market signals. No generic financial advice.`;

const WORK_SPECIALIST = `You are a high-leverage Chief of Staff and Workspace Agent. You manage emails, documents, calendars, and team coordination with maximum efficiency.
You synthesize information perfectly, draft professional communications, and optimize workflows.`;

const MUSIC_SPECIALIST = `You are an elite Music and Media Curator. You possess deep knowledge of discographies, genres, production techniques, and cultural impact.
You optimize searches for high-quality audio and video, provide expert recommendations, and understand the nuances of media playback.`;

const CRYPTO_SPECIALIST = `You are a highly sophisticated Web3 and Cryptocurrency Analyst. You understand on-chain data, smart contract vulnerabilities, tokenomics, and market sentiment.
You provide deep, technical analysis of crypto assets and protocols. You do not provide financial advice.`;

const CODE_SPECIALIST = `You are an uncompromising elite software engineer. Output pristine, highly optimized, production-ready code. Explain architecture minimally.
You architect flawlessly so it scales. Handle edge cases, loading states, and errors silently.`;

const RESEARCH_SPECIALIST = `You are a deep research intelligence engine. Conduct structural multi-source investigation. Synthesize findings into clear, cited, hierarchical reports. Be exhaustive but structured.`;

const SEARCH_SPECIALIST = `You are a real-time search synthesis engine. Ground every response in verifiable, current data. Cite sources. Prioritize recency and authority.`;

// ── Query Classifier Setup ──────────────────────────────────────────────────

/**
 * Mode descriptions — used to dynamically build the classifier prompt.
 * When registerMode() adds a new mode, the prompt rebuilds automatically
 * so the LLM knows to route to the new label.
 */
const MODE_DESCRIPTIONS = {
  sports: "Live scores, game schedules, standings, betting lines, injury reports, sports news for a specific league/team.",
  markets: "Financial markets, stocks, Kalshi, earnings, macroeconomic data.",
  design: "UI/UX review, component design, visual feedback, CSS/styling.",
  coding: "Programming, debugging, code review, architecture, APIs.",
  research: "Deep multi-source investigation, literature review, comparison analysis.",
  crypto: "Blockchain, tokens, DeFi, smart contracts, on-chain data.",
  music: "Music recommendations, discographies, audio/video media.",
  workspace: "Email drafting, calendar, documents, team coordination.",
  chat: "General conversation, greetings, anything that doesn't fit above.",
};

function buildClassifierPrompt() {
  const labels = Object.entries(MODE_DESCRIPTIONS)
    .map(([mode, desc]) => `- "${mode}" — ${desc}`)
    .join('\n');

  return `You are a query intent classifier. Respond with EXACTLY ONE of these labels:\n\n${labels}\n\nBe conservative: when in doubt, respond "chat". One word only. No explanation.`;
}

// Exported as let — live ES Module bindings update when registerMode rebuilds it
let CLASSIFIER_PROMPT = buildClassifierPrompt();

// ── Thinking Budget Configuration (matches clearspace frontend) ─────────────

/**
 * Thinking budget tiers — controls how much reasoning the model does.
 * Synced with frontend/hooks/useChat.ts THINKING_BUDGETS.
 *   fast:     0     — No thinking, instant responses
 *   balanced: 8192  — Moderate reasoning for precision tasks
 *   deep:     24576 — Full reasoning for complex analysis
 */
const THINKING_BUDGETS = {
  fast: 0,
  balanced: 8192,
  deep: 24576,
};

// ── Mode Registry ───────────────────────────────────────────────────────────

/**
 * ADK Dispatcher — maps mode IDs to specialist prompts, temperatures, and
 * recommended thinking tiers.
 *
 * Temperature tuned per domain:
 *   - Low (0.2): Code, Design — precision required
 *   - Mid (0.5): Markets, Workspace — balanced
 *   - High (0.7-0.9): Sports, Chat, Music — natural language
 *
 * Thinking tier per domain:
 *   - fast:     Chat, Music — conversational, speed matters
 *   - balanced: Code, Design, Sports — precision with speed
 *   - deep:     Research, Markets — complex multi-step reasoning
 */
const ADK_DISPATCHER = {
  chat:       { prompt: ORCHESTRATOR_PROMPT,  temp: 0.9, thinking: 'fast'     },
  sports:     { prompt: SPORTS_SPECIALIST,    temp: 0.7, thinking: 'balanced' },
  markets:    { prompt: MARKETS_SPECIALIST,   temp: 0.5, thinking: 'deep'     },
  workspace:  { prompt: WORK_SPECIALIST,      temp: 0.5, thinking: 'fast'     },
  design:     { prompt: DESIGN_SPECIALIST,    temp: 0.2, thinking: 'balanced' },
  coding:     { prompt: CODE_SPECIALIST,      temp: 0.2, thinking: 'balanced' },
  crypto:     { prompt: CRYPTO_SPECIALIST,    temp: 0.5, thinking: 'balanced' },
  music:      { prompt: MUSIC_SPECIALIST,     temp: 0.8, thinking: 'fast'     },
  research:   { prompt: RESEARCH_SPECIALIST,  temp: 0.3, thinking: 'deep'     },
  search:     { prompt: SEARCH_SPECIALIST,    temp: 0.7, thinking: 'balanced' },
};

/** All valid mode IDs (mutable — registerMode pushes to this) */
const MODES = Object.keys(ADK_DISPATCHER);

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Classify user intent using a fast LLM call.
 * 
 * Supports two backends:
 *   1. @google/genai SDK  → pass { geminiClient }
 *   2. Vertex AI via ADC  → pass { vertexFetch }
 *
 * @param {string} userMessage  - The user's latest message text
 * @param {object} backend
 * @param {object} [backend.geminiClient] - GoogleGenAI instance
 * @param {function} [backend.vertexFetch] - async (requestBody, model) => Response (raw fetch to Vertex)
 * @param {object} [options]
 * @param {string} [options.model='gemini-3.1-pro-preview'] - Classification model
 * @param {number} [options.timeoutMs=3000] - Max classification time before fallback
 * @param {string} [options.fallback='chat'] - Fallback mode on timeout/error
 * @returns {Promise<{mode: string, autoRouted: boolean}>}
 */
async function classify(userMessage, backend = {}, options = {}) {
  const {
    model = 'gemini-3.1-pro-preview',
    timeoutMs = 8000,
    fallback = 'chat',
  } = options;

  if (!userMessage || userMessage.trim().length === 0) {
    return { mode: fallback, autoRouted: false };
  }

  try {
    const classifyPromise = backend.geminiClient
      ? _classifyWithSDK(backend.geminiClient, userMessage, model)
      : backend.vertexFetch
        ? _classifyWithVertex(backend.vertexFetch, userMessage, model)
        : Promise.reject(new Error('No backend provided. Pass { geminiClient } or { vertexFetch }.'));

    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('classify_timeout')), timeoutMs);
    });

    const result = await Promise.race([classifyPromise, timeoutPromise]);
    clearTimeout(timeoutId);

    // Strip punctuation/whitespace the LLM might add (e.g. "sports.", " Mode: sports")
    const classification = result?.toLowerCase()?.replace(/[^a-z0-9_-]/g, '');

    if (classification && ADK_DISPATCHER[classification]) {
      return { mode: classification, autoRouted: true };
    }

    return { mode: fallback, autoRouted: false };
  } catch (err) {
    console.warn(`[router.classify] ${err.message} — falling back to "${fallback}"`);
    return { mode: fallback, autoRouted: false };
  }
}

/**
 * Classify using @google/genai SDK (direct API key auth).
 * thinkingConfig omitted — classification models don't require/allow zero-budget.
 * @private
 */
async function _classifyWithSDK(client, message, model) {
  const result = await client.models.generateContent({
    model,
    contents: [{ role: 'user', parts: [{ text: message }] }],
    config: {
      systemInstruction: CLASSIFIER_PROMPT,
      temperature: 0,
      maxOutputTokens: 100,
      thinkingConfig: { thinkingBudget: 0 },
    },
  });
  return result?.text || result?.candidates?.[0]?.content?.parts?.[0]?.text;
}

/**
 * Classify using Vertex AI (ADC / access token auth).
 * thinkingConfig omitted — avoids InvalidArgument on standard model variants.
 * @private
 */
async function _classifyWithVertex(vertexFetch, message, model) {
  const body = {
    contents: [{ role: 'user', parts: [{ text: message }] }],
    systemInstruction: { parts: [{ text: CLASSIFIER_PROMPT }] },
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 100,
      thinkingConfig: { thinkingBudget: 0 },
    },
  };

  const response = await vertexFetch(body, model);

  // Handle both raw Response objects and pre-parsed JSON
  const data = typeof response.json === 'function' ? await response.json() : response;

  // Vertex may return multiple parts (thought + text).
  // Scan all parts for the classification text, skipping thought parts.
  const parts = data?.candidates?.[0]?.content?.parts || [];
  let text = null;
  for (const part of parts) {
    if (part.text && !part.thought) {
      text = part.text;
      break;
    }
  }

  // Fallback: if all parts are thought parts, grab the last part's text anyway
  if (!text && parts.length > 0) {
    text = parts[parts.length - 1]?.text;
  }

  return text;
}

/**
 * Get the specialist dispatch config for a given mode.
 * 
 * @param {string} mode - Mode ID (e.g. 'sports', 'coding', 'chat')
 * @returns {{ systemPrompt: string, temperature: number, mode: string, thinkingMode: string, thinkingBudget: number }}
 */
function getDispatch(mode) {
  const dispatch = ADK_DISPATCHER[mode] || ADK_DISPATCHER.chat;
  const thinkingTier = dispatch.thinking || 'fast';
  return {
    systemPrompt: dispatch.prompt,
    temperature: dispatch.temp,
    mode: ADK_DISPATCHER[mode] ? mode : 'chat',
    thinkingMode: thinkingTier,
    thinkingBudget: THINKING_BUDGETS[thinkingTier] ?? 0,
  };
}

/**
 * Register a custom specialist mode at runtime.
 * Rebuilds the classifier prompt so the LLM knows to route to the new label.
 * 
 * @param {string} modeId - Unique mode identifier
 * @param {{ prompt: string, temp: number, description: string, thinking?: string }} config
 */
function registerMode(modeId, config) {
  if (!modeId || !config?.prompt || config?.temp === undefined || !config?.description) {
    throw new Error(`registerMode: invalid config for "${modeId}". Requires prompt, temp, and description.`);
  }

  ADK_DISPATCHER[modeId] = {
    prompt: config.prompt,
    temp: config.temp,
    thinking: config.thinking || 'fast',
  };

  MODE_DESCRIPTIONS[modeId] = config.description;
  CLASSIFIER_PROMPT = buildClassifierPrompt();

  if (!MODES.includes(modeId)) {
    MODES.push(modeId);
  }
}

// ── Exports ─────────────────────────────────────────────────────────────────

export {
  classify,
  getDispatch,
  registerMode,
  MODES,
  THINKING_BUDGETS,
  // Individual prompts for direct use
  ORCHESTRATOR_PROMPT,
  DESIGN_SPECIALIST,
  SPORTS_SPECIALIST,
  MARKETS_SPECIALIST,
  WORK_SPECIALIST,
  MUSIC_SPECIALIST,
  CRYPTO_SPECIALIST,
  CODE_SPECIALIST,
  RESEARCH_SPECIALIST,
  SEARCH_SPECIALIST,
  CLASSIFIER_PROMPT,
};
