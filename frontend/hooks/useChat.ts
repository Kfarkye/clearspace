import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { Message } from '../types';
import * as dataService from '../services/dataService';
import * as mutationQueue from '../services/mutationQueue';

export type ChatMode = 'operator' | 'standard';
export type ThinkingMode = 'fast' | 'balanced' | 'deep' | 'web';
export type ChatState = 'idle' | 'submitted' | 'thinking' | 'tool_running' | 'streaming' | 'stalled' | 'error' | 'done';

function chatModeForThinking(mode: ThinkingMode): ChatMode {
  return mode === 'web' ? 'standard' : 'operator';
}

export function useChat(workspaceToken: string | null) {
  const [chatMode, setChatMode] = useState<ChatMode>('operator');
  const [thinkingMode, setThinkingModeState] = useState<ThinkingMode>('normal');
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [failedSaveIds, setFailedSaveIds] = useState<Set<string>>(new Set());
  const [saveStatuses, setSaveStatuses] = useState<Record<string, string>>({});
  const [conversationTitle, setConversationTitle] = useState<string | null>(null);
  
  const [rawMessages, setRawMessages] = useState<any[]>([]);
  const [chatState, setChatState] = useState<ChatState>('idle');
  const [executionPhase, setExecutionPhase] = useState<string | null>(null);
  const [activeToolName, setActiveToolName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isPersistenceReady = useRef(false);
  const isFirstExchange = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  const chatModeRef = useRef(chatMode);
  const thinkingModeRef = useRef(thinkingMode);
  const conversationIdRef = useRef(conversationId);
  const rawMessagesRef = useRef(rawMessages);
  const chatStateRef = useRef(chatState);
  const activeToolNameRef = useRef(activeToolName);
  const lastEventTimeRef = useRef<number>(0);
  const firstTokenTimeRef = useRef<number | null>(null);

  useEffect(() => { chatModeRef.current = chatMode; }, [chatMode]);
  useEffect(() => { thinkingModeRef.current = thinkingMode; }, [thinkingMode]);
  useEffect(() => { conversationIdRef.current = conversationId; }, [conversationId]);
  useEffect(() => { rawMessagesRef.current = rawMessages; }, [rawMessages]);
  useEffect(() => { chatStateRef.current = chatState; }, [chatState]);
  useEffect(() => { activeToolNameRef.current = activeToolName; }, [activeToolName]);

  useEffect(() => {
    if (!['submitted', 'thinking', 'tool_running', 'stalled'].includes(chatState)) return;
    const interval = setInterval(() => {
      const elapsed = Date.now() - lastEventTimeRef.current;
      if (chatStateRef.current === 'streaming') return;

      if (elapsed > 12000) {
        setChatState('stalled');
        setExecutionPhase('This is taking longer than usual.');
      } else if (elapsed > 6000 && !activeToolNameRef.current) {
        setExecutionPhase('Still working — checking tools/search...');
      } else if (elapsed > 2000 && !activeToolNameRef.current) {
        setChatState(prev => prev === 'submitted' ? 'thinking' : prev);
        setExecutionPhase('Still thinking...');
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [chatState]);

  const resetSession = useCallback(() => {
    setRawMessages([]);
    setConversationId(null);
    isFirstExchange.current = true;
    setConversationTitle(null);
    setFailedSaveIds(new Set());
    setSaveStatuses({});
    setError(null);
  }, []);

  const handleNewChat = useCallback(async () => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    resetSession();
    if (isPersistenceReady.current) {
      try {
        const newId = await dataService.createConversation(chatModeRef.current);
        setConversationId(newId);
      } catch (e: any) {
        setConversationId(null);
      }
    }
  }, [resetSession]);

  const setThinkingMode = useCallback((mode: ThinkingMode) => {
    setThinkingModeState(mode);
    const nextChatMode = chatModeForThinking(mode);
    if (nextChatMode !== chatModeRef.current) {
      setChatMode(nextChatMode);
      resetSession();
    }
  }, [resetSession]);

  const handleModeSwitch = useCallback((mode: ChatMode) => {
    if (mode === chatModeRef.current) return;
    setChatMode(mode);
    resetSession();
  }, [resetSession]);

  const handleSendMessage = useCallback(async (input: string, imageBase64?: string, imageMime?: string) => {
    const isLoading = chatState !== 'idle' && chatState !== 'done' && chatState !== 'error';
    if ((!input.trim() && !imageBase64) || isLoading) return;

    const userMsgId = `user_${Date.now()}`;
    const userMessage = {
      id: userMsgId,
      role: 'user' as const,
      content: input,
      createdAt: new Date(),
    };

    setRawMessages(prev => [...prev, userMessage]);

    const convId = conversationIdRef.current;
    if (isPersistenceReady.current && convId) {
      setSaveStatuses(prev => ({ ...prev, [userMsgId]: 'pending' }));
      mutationQueue.enqueue(userMsgId, convId, { role: 'user', content: input, hasImage: !!imageBase64 }).catch(() => {});

      if (isFirstExchange.current) {
        isFirstExchange.current = false;
        const title = input.slice(0, 30).trim() + (input.length > 30 ? '...' : '');
        setConversationTitle(title);
        dataService.updateConversationTitle(convId, title).catch(() => {});
      }
    }

    setChatState('submitted');
    setExecutionPhase('Thinking...');
    setActiveToolName(null);
    lastEventTimeRef.current = Date.now();
    firstTokenTimeRef.current = null;
    setError(null);

    const modelMsgId = `model_${Date.now()}`;
    let modelContent = '';
    
    setRawMessages(prev => [...prev, { id: modelMsgId, role: 'model', content: modelContent, createdAt: new Date() }]);

    abortControllerRef.current = new AbortController();

    try {
      // Deep Think sports triggers (analysis, betting, reasoning)
      const sportsRegex = /\b(edge|pick|bet|betting|parlay|prop|props|over\/under|total|spread|ats|moneyline value|model|projection|prediction|trend|trends|compare|why|confidence|last 5|last 10|split|matchup|sharp|best play)\b/i;
      const isSports = sportsRegex.test(input);
      const targetMode = isSports ? 'deep' : thinkingModeRef.current;
      
      let endpoint = targetMode === 'deep' ? 'http://localhost:5001/api/chat' : 'http://localhost:5002/api/chat';
      
      if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        endpoint = '/api/chat'; 
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortControllerRef.current.signal,
        body: JSON.stringify({
          messages: [...rawMessagesRef.current, userMessage],
          workspaceToken,
          agentMode: targetMode === 'deep' ? 'deep_think' : 'auto'
        })
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      if (!response.body) throw new Error("No response body");
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        lastEventTimeRef.current = Date.now();
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.startsWith('0:')) {
            try {
               const chunkText = JSON.parse(line.slice(2));
               
               const toolMatch = chunkText.match(/\*\*\[tool\]\s+(.*?)\*\*/);
               if (toolMatch) {
                 const toolName = toolMatch[1];
                 setChatState('tool_running');
                 setActiveToolName(toolName);
                 
                 let label = `Running tool: ${toolName}`;
                 if (toolName === 'query_spanner_readonly') label = 'Checking database...';
                 else if (toolName === 'list_spanner_databases') label = 'Listing databases...';
                 else if (toolName === 'get_spanner_database_ddl') label = 'Fetching schema...';
                 else if (toolName === 'googleSearch') label = 'Searching the web...';
                 else if (toolName === 'codeExecution') label = 'Running analysis...';
                 setExecutionPhase(label);
                 continue; // Skip appending meta-text
               }
               
               if (!firstTokenTimeRef.current && chunkText.trim()) {
                   firstTokenTimeRef.current = Date.now();
                   setChatState('streaming');
                   setExecutionPhase(null);
               }
               
               modelContent += chunkText;
               
               setRawMessages(prev => prev.map(m => m.id === modelMsgId ? { ...m, content: modelContent } : m));
            } catch (e) {
               // Malformed chunk or partial string, skip logging to avoid noise
            }
          }
        }
      }
      
      // Final persistence step
      const persistId = conversationIdRef.current;
      if (isPersistenceReady.current && persistId) {
        mutationQueue.enqueue(modelMsgId, persistId, { role: 'model', content: modelContent }).catch(() => {});
        mutationQueue.flush((cId, msg) => dataService.appendMessage(cId, msg)).then(failedIds => {
          if (failedIds.size > 0) {
            setFailedSaveIds(prev => new Set([...prev, ...failedIds]));
            setSaveStatuses(prev => {
              const next = { ...prev };
              failedIds.forEach(id => { next[id] = 'failed'; });
              return next;
            });
          }
        }).catch(() => {});
      }
      
      setChatState('done');
      setExecutionPhase(null);
    } catch(e: any) {
       if (e.name !== 'AbortError') {
         setError(e.message);
         setChatState('error');
         setExecutionPhase('The response connection dropped. Try again.');
       } else {
         setChatState('done');
         setExecutionPhase(null);
       }
    }
  }, [chatState, workspaceToken]);

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
            });
            if (res.ok) authed = true;
          } catch (e) { /* Ignore */ }
        }
        isPersistenceReady.current = authed;
        if (authed && !conversationIdRef.current) {
          const newId = await dataService.createConversation(chatModeRef.current);
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
      if (!result) return;

      setRawMessages(result.messages.map((m: any) => ({
        id: m.id,
        role: m.role === 'user' ? 'user' : 'model',
        content: m.content,
        createdAt: m.createdAt ? new Date(m.createdAt) : new Date()
      })));

      setConversationId(targetConversationId);
      setConversationTitle(result.conversation.title || null);
      isFirstExchange.current = false;
    } catch (e) {
      console.error('Failed to load conversation:', e);
    }
  }, []);

  const clearHistory = useCallback(async () => {
    await handleNewChat();
  }, [handleNewChat]);

  const removeFailedMessage = useCallback((id: string) => {
    setRawMessages(prev => prev.filter(m => m.id !== id));
    setFailedSaveIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const handleStop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setChatState('done');
      setExecutionPhase(null);
    }
  }, []);

  const mappedMessages = useMemo(() => {
    return rawMessages.map(m => {
      return {
        id: m.id,
        role: m.role === 'model' ? 'model' : 'user',
        content: m.content || '',
        toolResults: [],
        timestamp: m.createdAt?.toLocaleTimeString() || '',
        saveStatus: saveStatuses[m.id],
      };
    }) as Message[];
  }, [rawMessages, saveStatuses]);

  return {
    messages: mappedMessages,
    isLoading: chatState !== 'idle' && chatState !== 'done' && chatState !== 'error',
    error,
    chatMode,
    thinkingMode,
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
    chatState,
    handleStop,
  };
}
