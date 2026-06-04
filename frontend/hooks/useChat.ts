import { useState, useCallback, useRef, useEffect } from 'react';
import { GoogleGenAI, Chat } from '@google/genai';
import { Message } from '../types';
import { TRUTH_SYSTEM_INSTRUCTION, GEMINI_SYSTEM_INSTRUCTION, MODEL_ID } from '../constants';
import { useToolCalls } from './useToolCalls';
import * as dataService from '../services/dataService';
import * as mutationQueue from '../services/mutationQueue';

export type ChatMode = 'operator' | 'standard';
export type ThinkingMode = 'fast' | 'balanced' | 'deep';

// Thinking budget configuration for different thinking modes
const THINKING_BUDGETS: Record<ThinkingMode, number> = {
  fast: 0,
  balanced: 8192,
  deep: 24576,
};

// --- Source Routing: URL Normalization ---
const DOMAIN_PATTERN = /(?<![@\w])([a-zA-Z0-9-]+\.(to|com|org|net|io|co|app|dev|ai|gg|tv|live|bet|sports|xyz))(?!\S*@)\b/gi;

function normalizeUrls(input: string): string {
  if (/https?:\/\//i.test(input)) return input;
  return input.replace(DOMAIN_PATTERN, (match) => `https://${match}`);
}

// --- Artifact Format Schemas ---
const SPORTS_ANALYSIS_FORMAT = `FORMAT YOUR RESPONSE AS A \`\`\`bettingangles JSON code block.
{
  "analysis_markdown": "### The Setup\\nContext...\\n\\n### By the Numbers\\n* **Stat:** value\\n\\n### The Angle\\nRecommended play...",
  "angles": [{ "title": "Team/Bet", "description": "Why...", "edge": "High|Medium|Low", "odds": "from data or N/A", "book": "DraftKings|Kalshi|Polymarket", "deepLink": "https://sportsbook.draftkings.com", "recommendation": "Bet/Fade/Pass/Watch" }]
}
Optional: "chart" (trend data), "consensus" (splits — ONLY if odds exist in tool data), "image_url" (ESPN logo).
Rules: analysis_markdown uses ### headings, * bullets, **bold**. angles[].odds from tool data only. angles[].book MUST be the sportsbook name with the best line. If tool data includes a books[] array, pick the book with the best value odds. Output ONLY the JSON block.`;

const SCOREBOARD_FORMAT = `FORMAT YOUR RESPONSE AS A \`\`\`scoreboard JSON code block.
{
  "summary_markdown": "A 1-2 sentence summary of today's action.",
  "games": [
    {
      "id": "401815580",
      "status": "In Progress",
      "period": "Bottom 6th",
      "broadcast": "MLB.TV",
      "note": "Key performance or headline in natural language",
      "away_team": { "name": "Tigers", "abbr": "DET", "score": 8, "record": "22-38", "odds": "+150" },
      "home_team": { "name": "Rays", "abbr": "TB", "score": 5, "record": "36-20", "odds": "-170" }
    }
  ]
}
Rules:
- Every game from the tool response MUST be included. Do not omit games.
- status: Use the exact status string from the data ("In Progress", "Scheduled", "Final").
- period: Use the detail field. For scheduled games, use game time in user's local timezone.
- score: Use numeric scores for in-progress/final games. Omit for scheduled.
- odds: Use moneyline from odds data. If null, omit.
- note: For in-progress games, write a natural language key performance. For final, write the headline.
- id: Use the event id from the tool data.
- Output ONLY the JSON block.`;

const WORKSPACE_FORMAT = `FORMAT YOUR RESPONSE AS A \`\`\`workspace JSON code block.
{
  "summary_markdown": "### Workspace Brief\\nUrgent items first...",
  "emails": [{ "id": "msg_id_from_tool_data", "sender": "Name", "subject": "...", "snippet": "...", "time": "10:42 AM", "is_urgent": true }],
  "schedule": [{ "title": "Meeting", "time": "11:00 AM - 12:30 PM", "attendees": ["Name"], "is_next": true }],
  "action_items": [{ "task": "...", "due": "Today, 5:00 PM", "priority": "High" }]
}
Rules: Lead with urgent items. summary_markdown uses ### headings, * bullets, **bold**. ALWAYS include the email "id" from the tool response data — it is required for click-to-open. Output ONLY the JSON block.`;

function getSportsArtifact(mode: 'operator' | 'standard', query: string): { format: string; schema: string } | null {
  const intent = detectSportsIntent(query);
  if (intent === 'analysis') return { format: 'bettingangles', schema: SPORTS_ANALYSIS_FORMAT };
  if (mode === 'operator') return { format: 'scoreboard', schema: SCOREBOARD_FORMAT };
  return null;
}

const TOOL_ARTIFACT_MAP: Record<string, { format: string; schema: string }> = {
  get_workspace_context: { format: 'workspace', schema: WORKSPACE_FORMAT },
};

const ANALYSIS_SIGNALS = /\b(angle|angles|sharp|betting\s+angle|value\s+play|betting\s+pick|prop\s+bet|props|edge|edges|fade|parlay|spread|moneyline|handicap|bets?|best\s+bets?|picks?|plays?|wager|over\s*\/?\s*under|o\s*\/?\s*u|totals?|locks?)(?:\b|$)/i;

function detectSportsIntent(query: string): 'analysis' | 'informational' {
  return ANALYSIS_SIGNALS.test(query) ? 'analysis' : 'informational';
}

// --- Thread Memory ---
interface ThreadEntry {
  toolName: string;
  timestamp: number;
  data: any;
  summary: string;
}

function buildSportsSummary(data: any): string {
  if (!data?.events || !Array.isArray(data.events)) return '';
  const games = data.events.map((event: any) => {
    const comp = event.competitions?.[0];
    if (!comp) return null;
    const teams = comp.competitors?.map((c: any) => {
      const record = c.records?.[0]?.summary || '';
      return `${c.team?.displayName || c.team?.name} (${record})${c.score ? ' ' + c.score : ''}`;
    }).join(' vs ') || 'Unknown';
    const status = event.status?.type?.description || '';
    const odds = comp.odds?.[0];
    const oddsStr = odds
      ? ` | Spread: ${odds.spread || 'N/A'}, O/U: ${odds.overUnder || 'N/A'}, ML: ${odds.homeTeamOdds?.moneyLine || 'N/A'}/${odds.awayTeamOdds?.moneyLine || 'N/A'}`
      : '';
    return `- ${teams} | ${status}${oddsStr} | ID: ${event.id}`;
  }).filter(Boolean);
  return `THREAD MEMORY (${games.length} games from last sports query):\n${games.join('\n')}`;
}

function buildWorkspaceSummary(data: any): string {
  const parts: string[] = [];
  if (data?.emails?.length) parts.push(`${data.emails.length} emails`);
  if (data?.schedule?.length) parts.push(`${data.schedule.length} calendar events`);
  if (data?.tasks?.length) parts.push(`${data.tasks.length} tasks`);
  return parts.length ? `THREAD MEMORY (workspace): ${parts.join(', ')}` : '';
}

function createTimestamp(): string {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

function createMessage(role: 'user' | 'model', content: string, image?: string): Message {
  return { id: `${role}_${Date.now()}`, role, content, timestamp: createTimestamp(), ...(image ? { image } : {}) };
}

function buildDateContext(): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-US');
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const tzAbbr = now.toLocaleTimeString('en-US', { timeZoneName: 'short' }).split(' ').pop();
  return `Today is ${dateStr}. Current time: ${timeStr} (${tzAbbr}, ${tz}). Convert all game times to this timezone.\n\n`;
}

export function useChat(workspaceToken: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chatMode, setChatMode] = useState<ChatMode>('operator');
  const [thinkingMode, setThinkingMode] = useState<ThinkingMode>('fast');
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [failedSaveIds, setFailedSaveIds] = useState<Set<string>>(new Set());
  const [conversationTitle, setConversationTitle] = useState<string | null>(null);

  const chatRef = useRef<Chat | null>(null);
  const genAiClientRef = useRef<GoogleGenAI | null>(null);
  const isPersistenceReady = useRef(false);
  const isFirstExchange = useRef(true);
  const threadMemory = useRef<ThreadEntry[]>([]);
  const pendingHistory = useRef<any[] | null>(null); // Prevents hydration race conditions

  const { dispatchToolCall, tools } = useToolCalls(workspaceToken);

  const cacheToolResponse = useCallback((toolName: string, data: any) => {
    const summary = toolName === 'get_sports_data'
      ? buildSportsSummary(data)
      : toolName === 'get_workspace_context'
        ? buildWorkspaceSummary(data)
        : toolName === 'read_email'
          ? `Full email: "${data.subject}" from ${data.sender}. ThreadId: ${data.threadId}`
          : toolName === 'send_email' || toolName === 'create_draft'
            ? `Email action successful. ID: ${data.messageId || data.draftId}`
            : toolName === 'trash_email'
              ? `Email ${data.action}: ${data.messageId}`
              : '';

    threadMemory.current = [
      ...threadMemory.current.filter(e => e.toolName !== toolName),
      { toolName, timestamp: Date.now(), data, summary },
    ].slice(-3);
  }, []);

  const getThreadContext = useCallback((): string => {
    const STALE_MS = 3 * 60 * 1000;
    const entries = threadMemory.current.filter(e => e.summary && (Date.now() - e.timestamp) < STALE_MS);
    return entries.length ? entries.map(e => e.summary).join('\n\n') : '';
  }, []);

  const initChat = useCallback(async () => {
    try {
      if (!process.env.API_KEY) {
        setError("API key not found.");
        return;
      }
      if (!genAiClientRef.current) {
        genAiClientRef.current = new GoogleGenAI({ apiKey: process.env.API_KEY, vertexai: true });
      }

      const ai = genAiClientRef.current;
      const isOperator = chatMode === 'operator';
      const systemInstruction = buildDateContext() + (isOperator ? TRUTH_SYSTEM_INSTRUCTION : GEMINI_SYSTEM_INSTRUCTION);

      // Consume pending history if a conversation was just loaded
      let history = pendingHistory.current;
      if (!history && chatRef.current) {
        try { history = await chatRef.current.getHistory(); } catch (e) { /* Ignore */ }
      }
      pendingHistory.current = null; // Clear to prevent reuse

      chatRef.current = ai.chats.create({
        model: MODEL_ID,
        history: history || [],
        config: {
          systemInstruction,
          thinkingConfig: { thinkingBudget: THINKING_BUDGETS[thinkingMode] },
          tools: isOperator ? [{ functionDeclarations: tools }] : [{ googleSearch: {} }, { urlContext: {} }],
        },
      });
      setError(null);
    } catch (e) {
      console.error(e);
      setError("Initialization failed.");
    }
  }, [chatMode, thinkingMode, tools]);

  useEffect(() => { initChat(); }, [initChat]);

  const handleNewChat = useCallback(async () => {
    setMessages([]);
    setIsLoading(false);
    threadMemory.current = [];
    isFirstExchange.current = true;
    setConversationTitle(null);
    chatRef.current = null;

    if (isPersistenceReady.current) {
      try {
        const newId = await dataService.createConversation(chatMode);
        setConversationId(newId);
      } catch (e: any) {
        if (e.message !== 'AUTH_REQUIRED') console.warn('[Persistence] Error:', e);
        setConversationId(null);
      }
    } else {
      setConversationId(null);
    }
    initChat();
  }, [chatMode, initChat]);

  const handleModeSwitch = useCallback((mode: ChatMode) => {
    if (mode === chatMode) return;
    setChatMode(mode);
    setMessages([]);
    setIsLoading(false);
    threadMemory.current = [];
    setConversationId(null);
    chatRef.current = null;
  }, [chatMode]);

  // P1 FIX: Pure functional state update — avoids React Concurrent Mode violations
  const updateLastMessage = useCallback((text: string) => {
    setMessages(prev => {
      if (prev.length === 0) return prev;
      const next = [...prev];
      next[next.length - 1] = { ...next[next.length - 1], content: text };
      return next;
    });
  }, []);

  // P2 FIX: Graceful stream interruption — returns partial text on network/parse errors
  const streamResponse = useCallback(async (
    stream: AsyncIterable<any>,
    baseText: string = '',
  ): Promise<{ text: string; functionCalls: any[] }> => {
    let responseText = baseText;
    const functionCalls: any[] = [];
    try {
      for await (const chunk of stream) {
        if (chunk.functionCalls) functionCalls.push(...chunk.functionCalls);
        if (chunk.text) {
          responseText += chunk.text;
          updateLastMessage(responseText);
        }
      }
    } catch (err) {
      console.error("[Stream] Interrupted:", err);
      // Fail gracefully — return what we have so far
    }
    return { text: responseText, functionCalls };
  }, [updateLastMessage]);

  const handleChatMessage = useCallback(async (
    input: string,
    imageBase64?: string,
    imageMime?: string
  ): Promise<string> => {
    if (!chatRef.current) throw new Error("Chat not initialized.");

    const FOLLOW_UP_SIGNALS = /^(show|open|read|more|that|this|the first|the second|the last|next|previous|delete|trash|reply|forward|send|draft|download|save|deploy|yes|no|ok|sure|do it)\b/i;
    const isFollowUp = input.length < 80 && FOLLOW_UP_SIGNALS.test(input.trim());
    const threadContext = isFollowUp ? getThreadContext() : '';
    const enrichedInput = threadContext
      ? `${input}\n\n[THREAD CONTEXT — reference this data for follow-ups, do not ask the user for IDs or parameters you already have]\n${threadContext}`
      : input || (imageBase64 ? "Analyze the image." : "");

    let messagePayload: any = enrichedInput;
    if (imageBase64 && imageMime) {
      messagePayload = [{ inlineData: { data: imageBase64, mimeType: imageMime } }, { text: enrichedInput }];
    }

    const stream = await chatRef.current.sendMessageStream({ message: messagePayload });
    const { text: responseText, functionCalls } = await streamResponse(stream);

    // P1 FIX: Parallel tool execution + batched functionResponse in single turn
    if (chatMode === 'operator' && functionCalls.length > 0 && chatRef.current) {
      let fullText = responseText;
      let pendingCalls = functionCalls;
      const MAX_TOOL_ITERATIONS = 8;
      let iteration = 0;

      while (pendingCalls.length > 0 && iteration < MAX_TOOL_ITERATIONS) {
        iteration++;

        // Execute tool calls in parallel to support concurrent SDK function calling
        const toolResponses = await Promise.all(pendingCalls.map(async (call) => {
          let toolResult;
          try {
            toolResult = await dispatchToolCall(call);
          } catch (e: any) {
            console.error(`[ToolLoop] Error in ${call.name}:`, e);
            toolResult = { error: e.message || "Internal error executing tool." };
          }

          cacheToolResponse(call.name, toolResult);

          const artifact = call.name === 'get_sports_data'
            ? getSportsArtifact(chatMode, input)
            : TOOL_ARTIFACT_MAP[call.name] || null;

          const formatInstruction = artifact ? artifact.schema : '';
          const annotatedResult = formatInstruction
            ? { ...toolResult, _format_instruction: formatInstruction }
            : toolResult;

          return { functionResponse: { name: call.name, response: annotatedResult } };
        }));

        // Send batched concurrent responses in a single turn
        const toolStream = await chatRef.current.sendMessageStream({ message: toolResponses });
        const { text: newText, functionCalls: newCalls } = await streamResponse(toolStream, fullText);

        fullText = newText;
        pendingCalls = newCalls;
      }
      return fullText;
    }

    const HEDGE_SIGNALS = /\b(not among the sports|cannot access|can't access|not available through|don't have access|unable to provide|not supported|I can only provide information on sports available through)\b/i;
    const isHedge = chatMode === 'operator' && functionCalls.length === 0 && responseText && HEDGE_SIGNALS.test(responseText);

    if (chatMode === 'operator' && functionCalls.length === 0 && responseText) {
      try {
        if (isHedge) updateLastMessage('');
        const ai = genAiClientRef.current;
        if (!ai) throw new Error("GenAI client missing.");

        const groundedResponse = await ai.models.generateContent({
          model: MODEL_ID,
          contents: { role: 'user', parts: [{ text: input }] },
          config: {
            systemInstruction: buildDateContext() + TRUTH_SYSTEM_INSTRUCTION,
            thinkingConfig: { thinkingBudget: THINKING_BUDGETS[thinkingMode] },
            tools: [{ googleSearch: {} }],
          },
        });

        const groundedText = groundedResponse.text || '';
        if (groundedText && (isHedge || groundedText.length > responseText.length * 0.5)) {
          updateLastMessage(groundedText);
          return groundedText;
        }
      } catch (e) {
        if (isHedge) updateLastMessage(responseText);
      }
    }
    return responseText;
  }, [chatMode, thinkingMode, dispatchToolCall, streamResponse, getThreadContext, updateLastMessage]);

  const handleServerChat = useCallback(async (input: string): Promise<string> => {
    const history = messages.reduce<Array<{ role: string; content: string }>>((acc, m) => {
      if ((m.role === 'user' || m.role === 'model') && m.content) {
        acc.push({ role: m.role, content: m.content });
      }
      return acc;
    }, []);

    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: input, history }),
    });

    if (!response.ok) throw new Error(`Server error: ${response.status}`);
    const data = await response.json();
    if (!data.artifacts || data.artifacts.length === 0) return 'No response from the server.';

    const parts: string[] = [];
    for (const artifact of data.artifacts) {
      if (artifact.type === 'SPORTS_ARTIFACT' && artifact.data?.events) {
        const games = artifact.data.events.map((ev: any) => ({
          id: ev.game_id,
          status: (ev.status || '').replace('STATUS_', '').toLowerCase(),
          date: ev.short_status,
          broadcast: ev.broadcast,
          note: ev.series_summary || ev.game_notes || '',
          away_team: { name: ev.away_team?.name, abbr: ev.away_team?.abbreviation || ev.away_team?.abbr, score: ev.away_team?.score, record: ev.away_team?.record },
          home_team: { name: ev.home_team?.name, abbr: ev.home_team?.abbreviation || ev.home_team?.abbr, score: ev.home_team?.score, record: ev.home_team?.record },
        }));
        parts.push('```scoreboard\n' + JSON.stringify({ games }) + '\n```');
      } else if (artifact.type === 'BETTING_ANALYSIS' || artifact.type === 'BETTING_TRENDS') {
        const raw = artifact.data || {};
        let transformed = raw;
        if (raw.best_bets && !raw.analysis_markdown) {
          transformed = {
            analysis_markdown: raw.best_bets.map((b: any) => `### ${b.game}\n**${b.market}** (${b.odds})\n\n${b.rationale}`).join('\n\n---\n\n'),
            angles: raw.best_bets.map((b: any) => ({
              title: `${b.game} — ${b.market}`, odds: b.odds, edge: 'Sharp', book: b.book || 'DraftKings', deepLink: b.deepLink || '', description: b.rationale, recommendation: `${b.market} ${b.odds}`,
            })),
          };
        }
        parts.push('```bettingangles\n' + JSON.stringify(transformed) + '\n```');
      } else if (artifact.type === 'WIN_PROBABILITY_ARTIFACT') {
        const latest = artifact.data?.probabilities?.slice(-1)[0];
        parts.push(latest ? `**Win Probability** — ${artifact.data.homeTeam?.name}: ${latest.homeWinPercentage?.toFixed(1)}% | ${artifact.data.awayTeam?.name}: ${latest.awayWinPercentage?.toFixed(1)}%` : 'Win probability not available.');
      } else if (artifact.type === 'PLAYER_PROP_ARTIFACT') {
        const propLines = (artifact.data?.props || []).map((p: any) => `- **${p.playerName}** (${p.teamAbbreviation}): ${p.statName} ${p.currentValue} | Line: ${p.propLine} ${p.overPrice}/${p.underPrice}`).join('\n');
        parts.push(`**Player Props**\n${propLines || 'No props available.'}`);
      } else if (artifact.type === 'DATA_TABLE') {
        parts.push('```datatable\n' + JSON.stringify(artifact.data || {}) + '\n```');
      } else {
        parts.push(artifact.context_summary || JSON.stringify(artifact.data || {}));
      }
    }

    const result = parts.join('\n\n');
    updateLastMessage(result);
    return result;
  }, [messages, updateLastMessage]);

  const handleSendMessage = useCallback(async (input: string, imageBase64?: string, imageMime?: string) => {
    const needsChat = chatMode === 'operator';
    if ((!input.trim() && !imageBase64) || isLoading || (needsChat && !chatRef.current)) return;

    setError(null);
    setIsLoading(true);

    const userMessage = createMessage('user', input, imageBase64 ? `data:${imageMime};base64,${imageBase64}` : undefined);
    const modelMessage = createMessage('model', '');
    setMessages(prev => [...prev, userMessage, modelMessage]);

    if (isPersistenceReady.current && conversationId) {
      mutationQueue.enqueue(userMessage.id, conversationId, { role: 'user', content: input, hasImage: !!imageBase64 }).catch(() => { });
      setMessages(prev => {
        const next = [...prev];
        const userIdx = next.findIndex(m => m.id === userMessage.id);
        if (userIdx >= 0) next[userIdx] = { ...next[userIdx], saveStatus: 'pending' };
        return next;
      });
    }

    try {
      if (chatMode === 'standard') {
        await handleServerChat(input);
      } else {
        await handleChatMessage(normalizeUrls(input), imageBase64, imageMime);
      }
    } catch (e: any) {
      const errDetail = e?.message || String(e);
      const userMsg = errDetail.includes('timed out') ? 'Request timed out. Try again.' : errDetail.includes('not connected') ? 'Workspace not connected. Click Connect to authenticate.' : `Error: ${errDetail}`;
      setError(userMsg);
      updateLastMessage(`Error: ${userMsg}`);
    } finally {
      setIsLoading(false);

      if (isPersistenceReady.current && conversationId) {
        setMessages(prev => {
          const lastMsg = prev[prev.length - 1];
          if (lastMsg?.role === 'model' && lastMsg.content) {
            mutationQueue.enqueue(lastMsg.id, conversationId, { role: 'model', content: lastMsg.content }).catch(() => { });
          }
          return prev;
        });

        mutationQueue.flush((convId, msg) => dataService.appendMessage(convId, msg)).then(failedIds => {
          if (failedIds.size > 0) {
            setFailedSaveIds(prev => new Set([...prev, ...failedIds]));
            setMessages(prev => prev.map(m => failedIds.has(m.id) ? { ...m, saveStatus: 'failed' } : m));
          } else {
            setMessages(prev => prev.map(m => m.saveStatus === 'pending' ? { ...m, saveStatus: 'saved' } : m));
          }
        }).catch(() => { });
      }

      if (isFirstExchange.current && isPersistenceReady.current && conversationId && genAiClientRef.current) {
        isFirstExchange.current = false;
        const titleConvId = conversationId;

        (async () => {
          try {
            const ai = genAiClientRef.current!;
            const titleResult = await ai.models.generateContent({
              model: MODEL_ID,
              contents: `Identify the core subject of this user message. Output 2 to 3 words max. Use Title Case. Do not use punctuation. Do not use filler words like "about" or "regarding".\n\nUser message: "${input.slice(0, 200)}"`,
              config: { thinkingConfig: { thinkingBudget: 0 }, temperature: 0, maxOutputTokens: 20 },
            });
            const title = titleResult?.text?.trim();
            if (title && title.length > 0 && title.length < 60) {
              setConversationTitle(title);
              dataService.updateConversationTitle(titleConvId, title).catch(() => { });
            }
          } catch { /* Suppress background auto-title errors */ }
        })();
      }
    }
  }, [isLoading, chatMode, handleChatMessage, handleServerChat, updateLastMessage, conversationId]);

  useEffect(() => {
    async function checkPersistence() {
      try {
        let authed = await dataService.isAuthenticated();
        if (!authed && workspaceToken) {
          try {
            const res = await fetch('/api/auth/session', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ access_token: workspaceToken }),
              credentials: 'same-origin',
            });
            if (res.ok) authed = true;
          } catch (e) { /* Ignore */ }
        }
        isPersistenceReady.current = authed;
        if (authed && !conversationId) {
          const newId = await dataService.createConversation(chatMode);
          setConversationId(newId);
        }
      } catch {
        isPersistenceReady.current = false;
      }
    }
    checkPersistence();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceToken]);

  // P1 FIX: pendingHistory ref prevents race condition during history hydration
  const loadConversation = useCallback(async (targetConversationId: string) => {
    try {
      const result = await dataService.getConversation(targetConversationId);
      if (!result) { setError('Conversation not found.'); return; }

      const restoredMode = (result.conversation.chatMode === 'operator' ? 'operator' : 'standard') as ChatMode;
      const restoredMessages: Message[] = result.messages.map(m => ({
        id: m.id, role: m.role as 'user' | 'model', content: m.content, timestamp: m.createdAt,
      }));

      setMessages(restoredMessages);
      setConversationId(targetConversationId);
      setConversationTitle(result.conversation.title || null);
      isFirstExchange.current = false;
      threadMemory.current = [];

      if (genAiClientRef.current && result.messages.length > 0) {
        const MAX_HISTORY_TURNS = 20;
        let historyMessages = result.messages;
        if (historyMessages.length > MAX_HISTORY_TURNS * 2) {
          historyMessages = historyMessages.slice(-MAX_HISTORY_TURNS * 2);
        }

        const history = historyMessages
          .filter(m => m.content && m.content.trim().length > 0)
          .map(m => ({ role: m.role as 'user' | 'model', parts: [{ text: m.content }] }));

        while (history.length > 0 && history[0].role !== 'user') history.shift();
        while (history.length > 0 && history[history.length - 1].role !== 'model') history.pop();

        // Queue history for immediate consumption by initChat
        pendingHistory.current = history.length > 0 ? history : undefined;
        setChatMode(restoredMode);

        // If mode didn't change, trigger initChat manually as useEffect won't fire
        if (restoredMode === chatMode) initChat();

        setError(null);
      }
    } catch (e) {
      console.error('[Persistence] Failed to load:', e);
      setError('Failed to load conversation.');
    }
  }, [chatMode, initChat]);

  const retryFailedSaves = useCallback(async () => {
    if (!conversationId) return;
    await mutationQueue.retryFailed(conversationId);
    setFailedSaveIds(new Set());

    setMessages(prev => prev.map(m => m.saveStatus === 'failed' ? { ...m, saveStatus: 'pending' } : m));

    const failedIds = await mutationQueue.flush((convId, msg) => dataService.appendMessage(convId, msg));
    if (failedIds.size > 0) {
      setFailedSaveIds(failedIds);
      setMessages(prev => prev.map(m => failedIds.has(m.id) ? { ...m, saveStatus: 'failed' } : m));
    } else {
      setMessages(prev => prev.map(m => m.saveStatus === 'pending' ? { ...m, saveStatus: 'saved' } : m));
    }
  }, [conversationId]);

  useEffect(() => {
    if (!isPersistenceReady.current) return;
    mutationQueue.flush((convId, msg) => dataService.appendMessage(convId, msg)).catch(() => { });
  }, []);

  return {
    messages, isLoading, error, chatMode, thinkingMode, conversationId, conversationTitle, failedSaveIds,
    setThinkingMode, handleModeSwitch, handleNewChat, handleSendMessage, loadConversation, retryFailedSaves, initChat,
  };
}
