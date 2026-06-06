import { useState, useCallback, useRef, useEffect } from 'react';
import { Message } from '../types';
import * as dataService from '../services/dataService';
import * as mutationQueue from '../services/mutationQueue';

export type ChatMode = 'operator' | 'standard';
export type ThinkingMode = 'fast' | 'balanced' | 'deep' | 'web';

// --- Source Routing: URL Normalization ---
const DOMAIN_PATTERN = /(?<![@\w])([a-zA-Z0-9-]+\.(to|com|org|net|io|co|app|dev|ai|gg|tv|live|bet|sports|xyz))(?!\S*@)\b/gi;

function normalizeUrls(input: string): string {
  if (/https?:\/\//i.test(input)) return input;
  return input.replace(DOMAIN_PATTERN, (match) => `https://${match}`);
}

function createTimestamp(): string {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

function createMessage(role: 'user' | 'model', content: string, image?: string): Message {
  return { id: `${role}_${Date.now()}`, role, content, timestamp: createTimestamp(), ...(image ? { image } : {}) };
}

export function useChat(workspaceToken: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chatMode, setChatMode] = useState<ChatMode>('operator');
  const [thinkingModeRaw, setThinkingModeRaw] = useState<ThinkingMode>('fast');

  const setThinkingMode = useCallback((mode: ThinkingMode) => {
    setThinkingModeRaw(mode);
    const newChatMode: ChatMode = mode === 'web' ? 'standard' : 'operator';
    setChatMode(prev => {
      if (prev !== newChatMode) {
        setMessages([]);
        setIsLoading(false);
        setConversationId(null);
      }
      return newChatMode;
    });
  }, []);
  
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [failedSaveIds, setFailedSaveIds] = useState<Set<string>>(new Set());
  const [conversationTitle, setConversationTitle] = useState<string | null>(null);
  const [executionPhase, setExecutionPhase] = useState<string | null>(null);

  const isPersistenceReady = useRef(false);
  const isFirstExchange = useRef(true);

  const handleNewChat = useCallback(async () => {
    setMessages([]);
    setIsLoading(false);
    isFirstExchange.current = true;
    setConversationTitle(null);

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
  }, [chatMode]);

  const handleModeSwitch = useCallback((mode: ChatMode) => {
    if (mode === chatMode) return;
    setChatMode(mode);
    setMessages([]);
    setIsLoading(false);
    setConversationId(null);
  }, [chatMode]);

  const updateLastMessage = useCallback((text: string) => {
    setMessages(prev => {
      if (prev.length === 0) return prev;
      const next = [...prev];
      next[next.length - 1] = { ...next[next.length - 1], content: text };
      return next;
    });
  }, []);

  const handleServerChat = useCallback(async (input: string, imageBase64?: string, imageMime?: string): Promise<string> => {
    const history = messages.reduce<Array<{ role: string; content: string }>>((acc, m) => {
      if ((m.role === 'user' || m.role === 'model') && m.content) {
        acc.push({ role: m.role, content: m.content });
      }
      return acc;
    }, []);

    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: input, history, mode: chatMode, thinkingMode: thinkingModeRaw, imageBase64, imageMime }),
    });

    if (!response.ok) throw new Error(`Server error: ${response.status}`);
    const data = await response.json();
    if (!data.artifacts || data.artifacts.length === 0) {
      if (data.error) throw new Error(data.error);
      return 'No response from the server.';
    }

    const parts: string[] = [];
    for (const asset of data.artifacts) {
      const eventsList = asset.payload?.data?.events || asset.payload?.events || asset.payload?.games;
      if (asset.type === 'SCOREBOARD' && eventsList && eventsList.length > 0) {
        const games = eventsList.map((ev: any) => ({
          id: ev.game_id || ev.id || String(Math.random()),
          status: (ev.status_state || ev.status || '').replace(/^STATUS_/i, '').toLowerCase(),
          date: ev.short_status || ev.date || ev.start_time || '',
          broadcast: ev.broadcast,
          note: ev.series_summary || ev.game_notes || '',
          league: ev.league || asset.payload.league || 'mlb',
          away_team: { name: ev.away_team?.name, abbr: ev.away_team?.abbreviation || ev.away_team?.abbr, score: ev.away_team?.score, record: ev.away_team?.record },
          home_team: { name: ev.home_team?.name, abbr: ev.home_team?.abbreviation || ev.home_team?.abbr, score: ev.home_team?.score, record: ev.home_team?.record },
          situation: ev.live_situation || ev.situation || ev.live,
          leaders: ev.leaders,
        }));
        parts.push('```scoreboard\n' + JSON.stringify({ games, sources: asset.sources, summary_markdown: asset.payload.summary_markdown }) + '\n```');
      } else if (asset.type === 'BETTING_ANALYSIS') {
        const raw = asset.payload || {};
        let transformed = raw;
        if (raw.best_bets && !raw.analysis_markdown) {
          transformed = {
            analysis_markdown: raw.best_bets.map((b: any) => `### ${b.game}\n**${b.market}** (${b.odds})\n\n${b.rationale}`).join('\n\n---\n\n'),
            angles: raw.best_bets.map((b: any) => ({
              title: `${b.game} — ${b.market}`, odds: b.odds, edge: 'Sharp', book: b.book || 'DraftKings', deepLink: b.deepLink || '', description: b.rationale, recommendation: `${b.market} ${b.odds}`,
            })),
          };
        }
        parts.push('```bettingangles\n' + JSON.stringify({ ...transformed, sources: asset.sources }) + '\n```');
      } else if (asset.type === 'DATA_TABLE') {
        parts.push('```datatable\n' + JSON.stringify({ ...asset.payload, sources: asset.sources }) + '\n```');
      } else if (asset.type === 'WORKSPACE_DOC') {
        if (asset.payload?.text) {
          parts.push(asset.payload.text);
        } else if (asset.payload?.videos) {
          parts.push('```youtube_media\n' + JSON.stringify(asset.payload) + '\n```');
        } else {
          parts.push(JSON.stringify(asset.payload));
        }
      } else {
        parts.push(JSON.stringify(asset.payload || {}));
      }
    }

    const result = parts.join('\n\n');
    updateLastMessage(result);
    return result;
  }, [messages, updateLastMessage, chatMode, thinkingModeRaw]);

  const handleSendMessage = useCallback(async (input: string, imageBase64?: string, imageMime?: string) => {
    if ((!input.trim() && !imageBase64) || isLoading) return;

    setError(null);
    setIsLoading(true);
    setExecutionPhase('[ dispatching payload ]');

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
      await handleServerChat(normalizeUrls(input), imageBase64, imageMime);
    } catch (e: any) {
      const errDetail = e?.message || String(e);
      
      // Agentic Diagnostic Loop
      try {
        setExecutionPhase('[ diagnostic reasoning... ]');
        const diagnosticPrompt = `SYSTEM FAULT: ${errDetail}. Analyze the failure context and output a diagnostic payload using the \`\`\`diagnostic\`\`\` code block. Ensure it includes a JSON with root_cause, proposed_fix, invalidation_condition, risk_flag, and patch_code.`;
        await handleServerChat(diagnosticPrompt);
      } catch (nestedError) {
        const userMsg = errDetail.includes('timed out') ? 'Request timed out. Try again.' : errDetail.includes('not connected') ? 'Workspace not connected. Click Connect to authenticate.' : `Error: ${errDetail}`;
        setError(userMsg);
        updateLastMessage(`Error: ${userMsg}`);
      }
    } finally {
      setIsLoading(false);
      setExecutionPhase(null);

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

      if (isFirstExchange.current && isPersistenceReady.current && conversationId) {
        isFirstExchange.current = false;
        const title = input.slice(0, 30).trim() + (input.length > 30 ? '...' : '');
        setConversationTitle(title);
        dataService.updateConversationTitle(conversationId, title).catch(() => { });
      }
    }
  }, [isLoading, handleServerChat, updateLastMessage, conversationId]);

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

    } catch (e) {
      console.error('Failed to load conversation:', e);
      setError('Failed to load conversation history.');
    }
  }, []);

  const clearHistory = useCallback(async () => {
    setMessages([]);
    setIsLoading(false);
    isFirstExchange.current = true;
    setConversationTitle(null);

    if (isPersistenceReady.current && conversationId) {
      try {
        await dataService.deleteConversation(conversationId);
        const newId = await dataService.createConversation(chatMode);
        setConversationId(newId);
      } catch (e) {
        console.error('Failed to clear conversation:', e);
      }
    }
  }, [conversationId, chatMode]);

  const removeFailedMessage = useCallback((id: string) => {
    setMessages(prev => prev.filter(m => m.id !== id));
    setFailedSaveIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  return {
    messages,
    isLoading,
    error,
    chatMode,
    thinkingMode: thinkingModeRaw,
    setThinkingMode,
    executionPhase,
    handleSendMessage,
    handleNewChat,
    handleModeSwitch,
    conversationId,
    conversationTitle,
    loadConversation,
    clearHistory,
    failedSaveIds,
    removeFailedMessage,
  };
}
