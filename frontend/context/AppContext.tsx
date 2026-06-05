// ============================================================================
// AppContext — Root-level state provider
//
// Hoists useChat + auth state above the router so it survives navigation.
// All views pull from this context instead of receiving props.
// ============================================================================

import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import { useChat, type ChatMode, type ThinkingMode } from '../hooks/useChat';
import { API_ENDPOINTS } from '../config/apiEndpoints';

// ── Types ───────────────────────────────────────────────────────────────────

interface AppContextType {
  // Chat (from useChat hook)
  messages: any[];
  isLoading: boolean;
  error: string | null;
  chatMode: ChatMode;
  thinkingMode: ThinkingMode;
  conversationId: string | null;
  setThinkingMode: (mode: ThinkingMode) => void;
  handleModeSwitch: (mode: ChatMode) => void;
  handleNewChat: () => void;
  handleSendMessage: (message: string, images?: any[]) => void;
  loadConversation: (id: string) => void;
  retryFailedSaves: () => void;
  initChat: () => void;

  // Google Workspace Auth
  workspaceToken: string | null;
  isWorkspaceConnected: boolean;
  handleConnectWorkspace: () => void;

  // GitHub Auth
  isGitHubConnected: boolean;
  githubUser: string | undefined;
  handleConnectGitHub: () => void;
  handleDisconnectGitHub: () => void;

  // Sidebar
  isSidebarOpen: boolean;
  setIsSidebarOpen: (open: boolean) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// ── Provider ────────────────────────────────────────────────────────────────

export function AppProvider({ children }: { children: ReactNode }) {
  // --- Google Workspace ---
  const [workspaceToken, setWorkspaceToken] = useState<string | null>(null);
  const [isWorkspaceConnected, setIsWorkspaceConnected] = useState(false);

  // --- GitHub ---
  const [isGitHubConnected, setIsGitHubConnected] = useState(false);
  const [githubUser, setGithubUser] = useState<string | undefined>();

  // --- Sidebar ---
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Check GitHub status on mount
  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/github/status')
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        setIsGitHubConnected(data.connected);
        if (data.username) setGithubUser(data.username);
      }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const handleConnectGitHub = useCallback(() => {
    fetch('/api/auth/github/url')
      .then(r => r.json())
      .then(data => {
        if (!data.url) return;
        const width = 500, height = 650;
        const left = window.screenX + (window.outerWidth - width) / 2;
        const top = window.screenY + (window.outerHeight - height) / 2;
        const popup = window.open(data.url, 'github-auth', `width=${width},height=${height},left=${left},top=${top},scrollbars=yes`);
        if (!popup) { console.error('OAuth popup blocked.'); return; }

        let checkClosed: ReturnType<typeof setInterval>;
        const listener = (e: MessageEvent) => {
          if (e.origin !== window.location.origin) return;
          if (e.data?.type === 'GITHUB_AUTH_SUCCESS') {
            setIsGitHubConnected(true);
            fetch('/api/auth/github/status')
              .then(r => r.json())
              .then(d => { if (d.username) setGithubUser(d.username); });
            window.removeEventListener('message', listener);
            clearInterval(checkClosed);
          }
        };
        window.addEventListener('message', listener);
        checkClosed = setInterval(() => {
          if (popup.closed) {
            clearInterval(checkClosed);
            window.removeEventListener('message', listener);
          }
        }, 1000);
      });
  }, []);

  const handleDisconnectGitHub = useCallback(() => {
    fetch('/api/auth/github/disconnect', { method: 'POST' })
      .then(() => { setIsGitHubConnected(false); setGithubUser(undefined); })
      .catch(err => console.error('Failed to disconnect:', err));
  }, []);

  // --- Chat (survives route changes) ---
  const chat = useChat(workspaceToken);

  // --- Google Workspace OAuth ---
  const handleConnectWorkspace = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      if (tokenResponse.access_token) {
        setWorkspaceToken(tokenResponse.access_token);
        try {
          await fetch(API_ENDPOINTS.AUTH_SESSION, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ access_token: tokenResponse.access_token }),
            credentials: 'same-origin',
          });
        } catch (err) {
          console.error('[Auth] Failed to establish session:', err);
        }
        setIsWorkspaceConnected(true);
      }
    },
    onError: (err) => console.error('OAuth error:', err),
    scope: [
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.compose',
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/tasks.readonly',
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/documents.readonly',
      'https://www.googleapis.com/auth/spreadsheets.readonly',
      'https://www.googleapis.com/auth/presentations.readonly',
    ].join(' '),
  });

  // --- Keyboard Shortcuts ---
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      if (e.key === 'k') { e.preventDefault(); setIsSidebarOpen(prev => !prev); }
      else if (e.key === 'n') { e.preventDefault(); chat.handleNewChat(); }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [chat.handleNewChat]);

  const value: AppContextType = {
    ...chat,
    workspaceToken,
    isWorkspaceConnected,
    handleConnectWorkspace,
    isGitHubConnected,
    githubUser,
    handleConnectGitHub,
    handleDisconnectGitHub,
    isSidebarOpen,
    setIsSidebarOpen,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within <AppProvider>');
  return ctx;
}
