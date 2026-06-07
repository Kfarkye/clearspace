// ============================================================================
// Layout — Shared glass header + navigation for all routes
//
// Pulls all state from AppContext. Renders the ambient background,
// floating header, mode switcher, nav links, and <Outlet />.
// ============================================================================

import React from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { Plus, RefreshCw, Cloud, Clock, Settings, PanelLeft } from 'lucide-react';
import { useAppContext } from '../context/AppContext';

const Layout: React.FC = () => {
  const {
    chatMode,
    handleNewChat,
    initChat,
    error,
    isWorkspaceConnected,
    handleConnectWorkspace,
    setIsSidebarOpen,
    isSidebarOpen,
  } = useAppContext();

  const location = useLocation();
  const isChat = location.pathname === '/';

  return (
    <div className="relative flex h-[100dvh] max-w-[100vw] bg-sand text-charcoal font-sans overflow-hidden justify-center pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
      {/* Ambient Background Glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(250,249,246,1)_0%,transparent_100%)] pointer-events-none z-0" />

      <div className="relative w-full max-w-3xl flex flex-col h-full z-10">
        {/* ─── Floating Glass Header ─────────────────────────────── */}
        <header className="absolute top-0 left-0 right-0 h-14 px-4 sm:px-6 flex items-center justify-between bg-alabaster/50 backdrop-blur-2xl z-50 border-b border-white/40 shadow-[0_4px_24px_rgba(140,122,107,0.03)]">
          {/* Left: Status + Brand */}
          <div className="flex items-center gap-3 w-1/3">
            {isChat && (
              <button
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="relative flex items-center justify-center w-7 h-7 rounded-full bg-white/40 backdrop-blur-xl border border-white/50 shadow-btn hover:shadow-btn-hover hover:bg-white/60 active:scale-90 transition-all duration-300 text-taupe hover:text-charcoal group"
                title="Toggle Sidebar"
              >
                <span className="absolute inset-0 rounded-full shadow-btn-inner pointer-events-none" />
                <PanelLeft size={12} strokeWidth={2} className="transition-transform duration-300" />
              </button>
            )}
            <NavLink to="/" className="flex items-center gap-3 group">
              <div className="relative flex items-center justify-center w-2 h-2">
                <span className="relative w-1.5 h-1.5 rounded-full bg-bronze" />
              </div>
              <span className="text-[11px] font-medium tracking-[0.25em] text-taupe select-none group-hover:text-charcoal transition-colors">
                TRUTH
              </span>
            </NavLink>
          </div>

          {/* Center: Brand or Route Title */}
          <div className="flex justify-center w-1/3">
            {isChat ? (
              null
            ) : (
              <span className="text-[11px] font-medium tracking-[0.2em] text-taupe uppercase select-none">
                {location.pathname === '/settings' ? 'Settings' : 'History'}
              </span>
            )}
          </div>

          {/* Right: Navigation + Actions */}
          <div className="flex items-center justify-end gap-2 w-1/3">
            {error && (
              <span className="text-bronze text-[10px] font-mono uppercase tracking-wider mr-1 truncate max-w-[100px]">
                {error}
              </span>
            )}

            {/* History Nav */}
            <NavLink
              to="/history"
              className={({ isActive }) =>
                `relative flex items-center justify-center w-7 h-7 rounded-full backdrop-blur-xl border shadow-btn transition-all duration-300 active:scale-90 group ${
                  isActive 
                    ? 'bg-white/70 border-bronze/30 text-charcoal shadow-btn-hover' 
                    : 'bg-white/40 border-white/50 text-taupe hover:text-charcoal hover:bg-white/60 hover:shadow-btn-hover'
                }`
              }
              title="History"
            >
              <span className="absolute inset-0 rounded-full shadow-btn-inner pointer-events-none" />
              <Clock size={12} strokeWidth={2} className="transition-transform group-hover:rotate-[-20deg] duration-300" />
            </NavLink>

            {/* Settings Nav */}
            <NavLink
              to="/settings"
              className={({ isActive }) =>
                `relative flex items-center justify-center w-7 h-7 rounded-full backdrop-blur-xl border shadow-btn transition-all duration-300 active:scale-90 group ${
                  isActive 
                    ? 'bg-white/70 border-bronze/30 text-charcoal shadow-btn-hover' 
                    : 'bg-white/40 border-white/50 text-taupe hover:text-charcoal hover:bg-white/60 hover:shadow-btn-hover'
                }`
              }
              title="Settings"
            >
              <span className="absolute inset-0 rounded-full shadow-btn-inner pointer-events-none" />
              <Settings size={12} strokeWidth={2} className="transition-transform group-hover:rotate-90 duration-300" />
            </NavLink>

            {/* Connect Workspace — on chat when disconnected */}
            {isChat && !isWorkspaceConnected && (
              <button 
                onClick={handleConnectWorkspace}
                className="relative flex items-center justify-center px-3 h-7 rounded-full backdrop-blur-xl border bg-white/40 border-white/50 text-taupe hover:text-charcoal hover:bg-white/60 shadow-btn transition-all duration-300 active:scale-95 group"
                title="Connect Workspace"
              >
                <span className="absolute inset-0 rounded-full shadow-btn-inner pointer-events-none" />
                <Cloud size={13} strokeWidth={2} className="mr-1.5" />
                <span className="text-[10px] font-medium tracking-wide">Connect</span>
              </button>
            )}

            {/* New Session */}
            <button 
              onClick={handleNewChat}
              className="relative flex items-center justify-center w-7 h-7 rounded-full bg-white/40 backdrop-blur-xl border border-white/50 shadow-btn hover:shadow-btn-hover hover:bg-white/60 active:scale-90 transition-all duration-300 text-taupe hover:text-charcoal group"
              title="New Session ⌘N"
            >
              <span className="absolute inset-0 rounded-full shadow-btn-inner pointer-events-none" />
              <Plus size={14} strokeWidth={2} className="transition-transform group-hover:rotate-90 duration-300" />
            </button>
            
            {/* Reconnect */}
            <button 
              onClick={initChat}
              className="relative flex items-center justify-center w-7 h-7 rounded-full bg-white/40 backdrop-blur-xl border border-white/50 shadow-btn hover:shadow-btn-hover hover:bg-white/60 active:scale-90 transition-all duration-300 text-taupe hover:text-charcoal group"
              title="Reconnect ⌘R"
            >
              <span className="absolute inset-0 rounded-full shadow-btn-inner pointer-events-none" />
              <RefreshCw size={12} strokeWidth={2} className="transition-transform group-hover:rotate-180 duration-500" />
            </button>
          </div>
        </header>

        {/* ─── Routed Content ────────────────────────────────────── */}
        <main className="flex-1 h-full w-full overflow-y-auto overflow-x-hidden overscroll-y-contain pt-14 pb-[env(safe-area-inset-bottom)]">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;
