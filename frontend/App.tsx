import React, { useState, useEffect } from 'react';
import { Plus, RefreshCw, Cloud, Clock } from 'lucide-react';
import TruthChat from './components/TruthChat';
import { ConversationSidebar } from './components/ConversationSidebar';
import { useGoogleLogin } from '@react-oauth/google';
import { useChat } from './hooks/useChat';
import { API_ENDPOINTS } from './config/apiEndpoints';

const App: React.FC = () => {
  const [workspaceToken, setWorkspaceToken] = useState<string | null>(null);
  const [isWorkspaceConnected, setIsWorkspaceConnected] = useState<boolean>(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const {
    messages,
    isLoading,
    error,
    chatMode,
    thinkingMode,
    conversationId,
    setThinkingMode,
    handleModeSwitch,
    handleNewChat,
    handleSendMessage,
    loadConversation,
    retryFailedSaves,
    initChat,
  } = useChat(workspaceToken);

  // --- Keyboard Shortcuts ---
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;

      if (e.key === 'k') {
        e.preventDefault();
        setIsSidebarOpen(prev => !prev);
      } else if (e.key === 'n') {
        e.preventDefault();
        handleNewChat();
      } else if (e.key === '1') {
        e.preventDefault();
        handleModeSwitch('operator');
      } else if (e.key === '2') {
        e.preventDefault();
        handleModeSwitch('standard');
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNewChat, handleModeSwitch]);

  const handleConnectWorkspace = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      if (tokenResponse.access_token) {
        setWorkspaceToken(tokenResponse.access_token);
        // Establish server-side session (sets httpOnly cookie for proxy auth)
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
    onError: (err) => {
      console.error("OAuth error:", err);
    },
    scope: 'https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.compose https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/tasks.readonly https://www.googleapis.com/auth/drive.file',
  });

  return (
    <div className="relative flex h-screen w-screen bg-sand text-charcoal font-sans overflow-hidden justify-center">
      {/* Ambient Background Glow to make the glass pop */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(250,249,246,1)_0%,transparent_100%)] pointer-events-none z-0" />

      <div className="relative w-full max-w-3xl flex flex-col h-full z-10">
        {/* Floating Glass Header */}
        <header className="absolute top-0 left-0 right-0 h-14 px-6 flex items-center justify-between bg-alabaster/50 backdrop-blur-2xl z-50 border-b border-white/40 shadow-[0_4px_24px_rgba(140,122,107,0.03)]">
          <div className="flex items-center gap-3 w-1/3">
            <div className="relative flex items-center justify-center w-2 h-2">
              <span className={`absolute w-full h-full rounded-full opacity-40 animate-ping ${chatMode === 'operator' ? 'bg-bronze' : 'bg-blue-500'}`}></span>
              <span className={`relative w-1.5 h-1.5 rounded-full ${chatMode === 'operator' ? 'bg-bronze' : 'bg-blue-500'}`}></span>
            </div>
            <span className="text-[11px] font-medium tracking-[0.25em] text-taupe select-none">
              {chatMode === 'operator' ? 'TRUTH' : 'GEMINI'}
            </span>
          </div>

          {/* Mode Switcher — Sliding Highlight */}
          <div className="flex justify-center w-1/3">
            <div className="relative flex items-center bg-clay/30 p-1 rounded-full border border-clay/50 backdrop-blur-md">
              {/* Sliding highlight */}
              <div 
                className="absolute top-1 h-[calc(100%-8px)] w-[calc(50%-4px)] bg-white rounded-full shadow-sm transition-all duration-300 ease-[0.16,1,0.3,1]"
                style={{ left: chatMode === 'operator' ? '4px' : 'calc(50%)' }}
              />
              <button 
                onClick={() => handleModeSwitch('operator')} 
                className={`relative z-10 px-3 py-1 rounded-full text-[10px] font-mono uppercase tracking-wider transition-colors duration-300 ${
                  chatMode === 'operator' ? 'text-charcoal font-semibold' : 'text-taupe hover:text-charcoal'
                }`}
              >
                Operator
              </button>
              <button 
                onClick={() => handleModeSwitch('standard')} 
                className={`relative z-10 px-3 py-1 rounded-full text-[10px] font-mono uppercase tracking-wider transition-colors duration-300 ${
                  chatMode === 'standard' ? 'text-charcoal font-semibold' : 'text-taupe hover:text-charcoal'
                }`}
              >
                Standard
              </button>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 w-1/3">
            {error && (
              <span className="text-bronze text-[10px] font-mono uppercase tracking-wider mr-2 truncate max-w-[120px]">
                {error}
              </span>
            )}
            
            {/* Conversation History Toggle — only when signed in */}
            {isWorkspaceConnected && (
              <button
                onClick={() => setIsSidebarOpen(true)}
                className="relative flex items-center justify-center w-7 h-7 rounded-full bg-white/40 backdrop-blur-xl border border-white/50 shadow-btn hover:shadow-btn-hover hover:bg-white/60 active:scale-90 transition-all duration-300 text-taupe hover:text-charcoal group"
                aria-label="Conversation History"
                title="History"
              >
                <span className="absolute inset-0 rounded-full shadow-btn-inner pointer-events-none"></span>
                <Clock size={12} strokeWidth={2} className="transition-transform group-hover:rotate-[-20deg] duration-300" />
              </button>
            )}
            
            {/* Workspace Connection Toggle - Only show in Operator mode when not connected */}
            {chatMode === 'operator' && !isWorkspaceConnected && (
              <button 
                onClick={handleConnectWorkspace}
                className="hidden sm:flex relative items-center justify-center px-3 h-7 rounded-full backdrop-blur-xl border bg-white/40 border-white/50 text-taupe hover:text-charcoal hover:bg-white/60 shadow-btn transition-all duration-300 active:scale-95 group"
                title="Connect Workspace"
              >
                <span className="absolute inset-0 rounded-full shadow-btn-inner pointer-events-none"></span>
                <Cloud size={13} strokeWidth={2} className="mr-1.5" />
                <span className="text-[10px] font-medium tracking-wide">Connect</span>
              </button>
            )}

            {/* Glassmorphic Hardware Buttons */}
            <button 
              onClick={handleNewChat}
              className="relative flex items-center justify-center w-7 h-7 rounded-full bg-white/40 backdrop-blur-xl border border-white/50 shadow-btn hover:shadow-btn-hover hover:bg-white/60 active:scale-90 transition-all duration-300 text-taupe hover:text-charcoal group"
              aria-label="New Session"
              title="New Session ⌘N"
            >
              <span className="absolute inset-0 rounded-full shadow-btn-inner pointer-events-none"></span>
              <Plus size={14} strokeWidth={2} className="transition-transform group-hover:rotate-90 duration-300" />
            </button>
            
            <button 
              onClick={initChat}
              className="relative flex items-center justify-center w-7 h-7 rounded-full bg-white/40 backdrop-blur-xl border border-white/50 shadow-btn hover:shadow-btn-hover hover:bg-white/60 active:scale-90 transition-all duration-300 text-taupe hover:text-charcoal group"
              aria-label="Reconnect"
              title="Reconnect ⌘R"
            >
              <span className="absolute inset-0 rounded-full shadow-btn-inner pointer-events-none"></span>
              <RefreshCw size={12} strokeWidth={2} className="transition-transform group-hover:rotate-180 duration-500" />
            </button>
          </div>
        </header>

        {/* Chat Interface */}
        <div className="flex-1 overflow-hidden pt-14">
          <TruthChat 
            messages={messages} 
            isLoading={isLoading} 
            onSendMessage={handleSendMessage} 
            chatMode={chatMode}
            thinkingMode={thinkingMode}
            onThinkingModeChange={setThinkingMode}
            workspaceToken={workspaceToken}
            onRetrySave={retryFailedSaves}
          />
        </div>
      </div>

      {/* Conversation History Sidebar */}
      <ConversationSidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        onSelectConversation={loadConversation}
        activeConversationId={conversationId}
      />
    </div>
  );
};

export default App;
