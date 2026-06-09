// ============================================================================
// SettingsView — Connectors with real brand logos (route: "/settings")
// ============================================================================

import React from 'react';
import { useAppContext } from '../context/AppContext';

// ── Real Brand Logos (inline SVG) ───────────────────────────────────────────

const GoogleLogo = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A11.96 11.96 0 0 0 1 12c0 1.93.46 3.77 1.18 5.07l3.66-2.98z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);

const GitHubLogo = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
  </svg>
);

const KalshiLogo = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
    <rect width="32" height="32" rx="6" fill="#00D26A"/>
    <path d="M10 8v16M10 16l8-8M10 16l8 8" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const SettingsView: React.FC = () => {
  const {
    isWorkspaceConnected,
    handleConnectWorkspace,
    isGitHubConnected,
    githubUser,
    handleConnectGitHub,
    handleDisconnectGitHub,
  } = useAppContext();

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-md mx-auto px-6 py-12">
        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-taupe/50 mb-6">
          Connections
        </p>

        <div className="space-y-3">
          {/* Google Workspace */}
          <div className="rounded-2xl bg-transparent border border-white/10 overflow-hidden">
            <div className="px-6 py-5 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-[#111113] border border-white/10 flex items-center justify-center">
                  <GoogleLogo size={22} />
                </div>
                <div>
                  <p className="text-[15px] font-medium text-slate-200 tracking-tight">Google Workspace</p>
                  <p className="text-[12px] text-slate-400 mt-0.5">
                    {isWorkspaceConnected ? 'Gmail, Calendar, Drive, Docs, Sheets' : 'Connect your Google account'}
                  </p>
                </div>
              </div>
              {isWorkspaceConnected ? (
                <span className="text-[11px] font-mono text-emerald-400/80 tracking-wide">Connected</span>
              ) : (
                <button
                  onClick={handleConnectWorkspace}
                  className="px-5 py-2 rounded-xl text-[12px] font-medium bg-white text-black hover:bg-slate-200 transition-all duration-200 active:scale-[0.97]"
                >
                  Connect
                </button>
              )}
            </div>
          </div>

          {/* GitHub */}
          <div className="rounded-2xl bg-transparent border border-white/10 overflow-hidden">
            <div className="px-6 py-5 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-[#111113] border border-white/10 flex items-center justify-center text-slate-200">
                  <GitHubLogo size={22} />
                </div>
                <div>
                  <p className="text-[15px] font-medium text-slate-200 tracking-tight">GitHub</p>
                  <p className="text-[12px] text-slate-400 mt-0.5">
                    {isGitHubConnected ? `@${githubUser}` : 'Connect your repositories'}
                  </p>
                </div>
              </div>
              {isGitHubConnected ? (
                <button
                  onClick={handleDisconnectGitHub}
                  className="text-[11px] font-mono text-slate-500 hover:text-red-400 transition-colors tracking-wide"
                >
                  Disconnect
                </button>
              ) : (
                <button
                  onClick={handleConnectGitHub}
                  className="px-5 py-2 rounded-xl text-[12px] font-medium bg-white text-black hover:bg-slate-200 transition-all duration-200 active:scale-[0.97]"
                >
                  Connect
                </button>
              )}
            </div>
          </div>

          {/* Kalshi */}
          <div className="rounded-2xl bg-transparent border border-white/10 overflow-hidden">
            <div className="px-6 py-5 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-[#111113] border border-white/10 flex items-center justify-center">
                  <KalshiLogo size={24} />
                </div>
                <div>
                  <p className="text-[15px] font-medium text-slate-200 tracking-tight">Kalshi</p>
                  <p className="text-[12px] text-slate-400 mt-0.5">Event contracts and prediction markets</p>
                </div>
              </div>
              <button
                className="px-5 py-2 rounded-xl text-[12px] font-medium bg-[#00D26A] text-white hover:bg-[#00b85c] transition-all duration-200 active:scale-[0.97]"
              >
                Connect
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsView;
