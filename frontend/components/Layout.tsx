import React, { useState } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { CaretDown, CaretUp } from '@phosphor-icons/react';
import { useAppContext } from '../context/AppContext';

const Layout: React.FC = () => {
  const {
    handleNewChat,
    isWorkspaceConnected,
    handleConnectWorkspace,
    isGitHubConnected,
    githubUser,
    handleConnectGitHub,
  } = useAppContext();

  const location = useLocation();
  const [connectAppsOpen, setConnectAppsOpen] = useState(true);

  // Clean minimalist navigation
  const navItems = [
    { name: 'Chat', path: '/' },
    { name: 'Agents', path: '/agents' },
    { name: 'History', path: '/history' },
  ];

  console.log("Layout component is executing!");

  return (
    <div className="pwa-shell flex-row w-full bg-[#000000] text-slate-200 font-sans">
      
      {/* ─── Left Sidebar ────────────────────────────────────────── */}
      <aside className="w-[260px] flex-shrink-0 flex flex-col border-r border-white/[0.08] bg-[#000000] z-20">
        
        {/* Brand & New Chat */}
        <div className="p-5 flex flex-col gap-6">
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center w-5 h-5 rounded-full border-[2.5px] border-white">
              <span className="w-1.5 h-1.5 rounded-full bg-white"></span>
            </div>
            <span className="text-[14px] font-bold tracking-widest text-white uppercase select-none">
              TRUTH
            </span>
          </div>

          <button 
            onClick={handleNewChat}
            className="w-full bg-white/[0.03] border border-white/[0.05] hover:bg-white/[0.06] text-white py-2 rounded-full text-[12px] font-medium transition-colors shadow-sm flex justify-center items-center gap-2"
          >
            <span className="text-white/40 text-[14px] font-light leading-none mb-[2px]">+</span> New Chat
          </button>
        </div>

        {/* Primary Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5 no-scrollbar">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path || (item.path === '/agents' && location.pathname.startsWith('/agents'));
            return (
              <NavLink
                key={item.name}
                to={item.path}
                className={`block w-full px-3 py-2.5 rounded-lg text-[13px] transition-colors select-none ${
                  isActive 
                    ? 'bg-white/10 text-white font-medium' 
                    : 'text-zinc-400 hover:text-slate-200 hover:bg-white/[0.04]'
                }`}
              >
                {item.name}
              </NavLink>
            );
          })}
        </nav>

        {/* Bottom Section: Connect Apps & Settings */}
        <div className="px-4 py-5 flex flex-col gap-6 mt-auto">
          
          {/* Connect Apps Accordion */}
          <div className="flex flex-col gap-3">
            <button 
              onClick={() => setConnectAppsOpen(!connectAppsOpen)}
              className="flex items-center gap-2 text-[12px] font-medium text-white select-none hover:opacity-80 transition-opacity w-full text-left"
            >
              Integrations
              {connectAppsOpen ? (
                <CaretUp weight="bold" className="text-zinc-400" />
              ) : (
                <CaretDown weight="bold" className="text-zinc-400" />
              )}
            </button>
            
            {connectAppsOpen && (
              <div className="flex flex-col gap-3 pl-1">
                {/* Google Workspace */}
                <div className="flex items-center justify-between text-[11px] group">
                  <div className="flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full transition-colors ${isWorkspaceConnected ? 'bg-emerald-500' : 'bg-zinc-600 group-hover:bg-zinc-400'}`}></div>
                    <span className={`transition-colors ${isWorkspaceConnected ? 'text-zinc-400' : 'text-zinc-400 group-hover:text-slate-200'}`}>Google Workspace</span>
                  </div>
                  {isWorkspaceConnected ? (
                    <span className="text-zinc-600">Authed</span>
                  ) : (
                    <button 
                      onClick={handleConnectWorkspace}
                      className="text-zinc-500 hover:text-white transition-colors cursor-pointer"
                    >
                      Connect
                    </button>
                  )}
                </div>
                
                {/* GitHub */}
                <div className="flex items-center justify-between text-[11px] group">
                  <div className="flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full transition-colors ${isGitHubConnected ? 'bg-emerald-500' : 'bg-zinc-600 group-hover:bg-zinc-400'}`}></div>
                    <span className={`transition-colors ${isGitHubConnected ? 'text-zinc-400' : 'text-zinc-400 group-hover:text-slate-200'}`}>GitHub</span>
                  </div>
                  {isGitHubConnected ? (
                    <span className="text-zinc-600 truncate max-w-[80px]" title={githubUser}>{githubUser || 'Authed'}</span>
                  ) : (
                    <button 
                      onClick={handleConnectGitHub}
                      className="text-zinc-500 hover:text-white transition-colors cursor-pointer"
                    >
                      Connect
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Settings */}
          <NavLink
            to="/settings"
            className={({ isActive }) => `text-[12px] font-medium transition-colors select-none ${isActive ? 'text-white' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Settings
          </NavLink>
        </div>
      </aside>

      {/* ─── Main Content Area ───────────────────────────────────── */}
      <main className="flex-1 relative h-full overflow-y-auto overflow-x-hidden z-10 bg-[#000000] pwa-content-scroll no-scrollbar">
        {/* Subtle cinematic glow inside main area */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.03)_0%,transparent_60%)] pointer-events-none mix-blend-screen" />
        
        <Outlet />
      </main>

    </div>
  );
};

export default Layout;
