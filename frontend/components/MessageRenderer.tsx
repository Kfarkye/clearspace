import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { z } from 'zod';
import { 
  AlertTriangle, 
  Activity, 
  Play, 
  TrendingUp, 
  CheckCircle, 
  ExternalLink,
  ShieldAlert,
  Zap
} from 'lucide-react';
import { JobManifestArtifact } from './JobManifestArtifact';
import { ScoreboardArtifact } from './ScoreboardArtifact';
import { WorkspaceArtifact } from './WorkspaceArtifact';
import { SidebarArtifact } from './SidebarArtifact';
import { HtmlArtifact } from './HtmlArtifact';
import { EmailViewerArtifact } from './EmailViewerArtifact';
import { MLBScoreboard } from './MLBScoreboard';
import { DataTableArtifact } from './DataTableArtifact';
import { WorldCupArtifact } from './WorldCupArtifact';
import { WorldCupGroupArtifact } from './WorldCupGroupArtifact';
import { PlayerPropArtifact } from './PlayerPropArtifact';
import { DiagnosticArtifact } from './DiagnosticArtifact';
import { MlbCoreLedgerArtifact } from './MlbCoreLedgerArtifact';
import { MlbSpannerMatchupCard } from './MlbSpannerMatchupCard';
import { MlbSpannerChatResults } from './MlbSpannerChatResults';
import { WorldCupSpannerChatResults } from './WorldCupSpannerChatResults';

// ============================================================================
// 1. ZOD SCHEMAS (RUNTIME TYPE SAFETY)
// ============================================================================

const DiagnosticSchema = z.object({
  status: z.enum(['SUCCESS', 'WARNING', 'ERROR']).default('WARNING'),
  latencyMs: z.number().default(0),
  engine: z.string().default('AURA_ENGINE'),
  steps: z.array(
    z.object({
      name: z.string(),
      duration: z.number(),
      passed: z.boolean(),
    })
  ).default([]),
});

const YoutubeMediaSchema = z.object({
  query: z.string(),
  embedUrl: z.string().optional(),
  title: z.string().optional(),
});

const BettingAngleSchema = z.object({
  title: z.string().default(''),
  description: z.string().default(''),
  edge: z.preprocess((val) => {
    if (typeof val !== 'string') return 'Neutral';
    const capitalized = val.charAt(0).toUpperCase() + val.slice(1).toLowerCase();
    if (['High', 'Medium', 'Low', 'Neutral'].includes(capitalized)) {
      return capitalized;
    }
    return 'Neutral';
  }, z.enum(['High', 'Medium', 'Low', 'Neutral'])).default('Neutral'),
  odds: z.string().default(''),
  recommendation: z.string().default(''),
  image_url: z.string().optional(),
});

const BettingAnglesPayloadSchema = z.object({
  analysis_markdown: z.string().optional(),
  angles: z.array(BettingAngleSchema).default([]),
  consensus: z.object({
    game_name: z.string().default('Matchup'),
    splits: z.array(
      z.object({
        betType: z.string().default('Spread'),
        selectionHome: z.string().default('Home'),
        selectionAway: z.string().default('Away'),
        homeTickets: z.preprocess((val) => {
          if (typeof val === 'number') return val;
          if (typeof val === 'string') {
            const clean = val.replace(/[^0-9.-]/g, '');
            const num = parseFloat(clean);
            return isNaN(num) ? 50 : num;
          }
          return 50;
        }, z.number()).default(50),
        homeMoney: z.preprocess((val) => {
          if (typeof val === 'number') return val;
          if (typeof val === 'string') {
            const clean = val.replace(/[^0-9.-]/g, '');
            const num = parseFloat(clean);
            return isNaN(num) ? 50 : num;
          }
          return 50;
        }, z.number()).default(50),
        awayTickets: z.preprocess((val) => {
          if (typeof val === 'number') return val;
          if (typeof val === 'string') {
            const clean = val.replace(/[^0-9.-]/g, '');
            const num = parseFloat(clean);
            return isNaN(num) ? 50 : num;
          }
          return 50;
        }, z.number()).default(50),
        awayMoney: z.preprocess((val) => {
          if (typeof val === 'number') return val;
          if (typeof val === 'string') {
            const clean = val.replace(/[^0-9.-]/g, '');
            const num = parseFloat(clean);
            return isNaN(num) ? 50 : num;
          }
          return 50;
        }, z.number()).default(50),
        sharpSignal: z.string().optional(),
      })
    ).default([]),
  }).optional(),
});

const EngineeringDiagnosticSchema = z.object({
  root_cause: z.string(),
  proposed_fix: z.string(),
  invalidation_condition: z.string().optional(),
  risk_flag: z.string().optional(),
  patch_code: z.string().optional(),
});

const SystemErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  retryable: z.boolean().optional(),
  traceId: z.string().optional(),
});

type DiagnosticPayload = z.infer<typeof DiagnosticSchema>;
type YoutubeMediaPayload = z.infer<typeof YoutubeMediaSchema>;
type BettingAnglesPayload = z.infer<typeof BettingAnglesPayloadSchema>;
type EngineeringDiagnosticPayload = z.infer<typeof EngineeringDiagnosticSchema>;
type SystemErrorPayload = z.infer<typeof SystemErrorSchema>;

// ============================================================================
// 2. INTERACTIVE SUB-COMPONENTS (CLEARSPACE DESIGN SYSTEM)
// ============================================================================

const DiagnosticRenderer: React.FC<{ payload: DiagnosticPayload }> = ({ payload }) => {
  const statusConfig = {
    SUCCESS: 'border-[#34C759]/30 bg-[#34C759]/10 text-[#34C759]',
    WARNING: 'border-[#FF9500]/30 bg-[#FF9500]/10 text-[#FF9500]',
    ERROR: 'border-[#FF3B30]/30 bg-[#FF3B30]/10 text-[#FF3B30]',
  };

  return (
    <div className={`my-4 rounded-xl border p-4 font-mono text-xs shadow-glass ${statusConfig[payload.status]}`}>
      <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 animate-pulse" />
          <span className="font-bold tracking-wider">SYSTEM DIAGNOSTIC ({payload.status})</span>
        </div>
        <div className="opacity-70">
          <span>{payload.engine}</span> • <span>{payload.latencyMs}ms</span>
        </div>
      </div>
      <div className="space-y-1.5">
        {payload.steps.map((step, idx) => (
          <div key={idx} className="flex items-center justify-between">
            <span className="opacity-80">└─ {step.name}</span>
            <span className={step.passed ? "text-[#34C759]" : "text-[#FF3B30]"}>
              {step.passed ? "● PASSED" : "○ FAILED"} ({step.duration}ms)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

const YoutubeMediaRenderer: React.FC<{ payload: YoutubeMediaPayload }> = ({ payload }) => {
  return (
    <div className="my-4 overflow-hidden rounded-xl border border-white/10 bg-[#161618] shadow-glass">
      <div className="bg-[#000000] p-3 flex items-center justify-between border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className="rounded bg-[#FF3B30] p-1 text-white">
            <Play className="h-3 w-3 fill-current" />
          </div>
          <span className="text-xs font-medium text-[#F5F5F7] uppercase tracking-wider">Media Request</span>
        </div>
        <ExternalLink className="h-4 w-4 text-[#86868B] hover:text-[#F5F5F7] transition-colors cursor-pointer" />
      </div>
      <div className="p-4">
        {payload.embedUrl ? (
          <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-white/5 bg-black shadow-inset">
            <iframe
              src={payload.embedUrl}
              title={payload.title || "YouTube Video"}
              className="absolute inset-0 h-full w-full border-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-white/10 bg-[#000000]/50 py-10 text-center">
            <div className="relative mb-3">
              <div className="absolute inset-0 animate-ping rounded-full bg-[#FF3B30]/20" />
              <Play className="relative h-8 w-8 text-[#86868B]" />
            </div>
            <p className="text-sm font-medium text-[#F5F5F7]">Resolving Media Stream</p>
            <p className="mt-1 text-xs text-[#86868B] font-mono">Query: "{payload.query}"</p>
          </div>
        )}
      </div>
    </div>
  );
};

const TEAM_LOGO_MAP: Record<string, string> = {
  // MLB
  'yankees': 'https://a.espncdn.com/i/teamlogos/mlb/500/nyy.png',
  'new york yankees': 'https://a.espncdn.com/i/teamlogos/mlb/500/nyy.png',
  'red sox': 'https://a.espncdn.com/i/teamlogos/mlb/500/bos.png',
  'boston red sox': 'https://a.espncdn.com/i/teamlogos/mlb/500/bos.png',
  'dodgers': 'https://a.espncdn.com/i/teamlogos/mlb/500/lad.png',
  'los angeles dodgers': 'https://a.espncdn.com/i/teamlogos/mlb/500/lad.png',
  'phillies': 'https://a.espncdn.com/i/teamlogos/mlb/500/phi.png',
  'philadelphia phillies': 'https://a.espncdn.com/i/teamlogos/mlb/500/phi.png',
  'guardians': 'https://a.espncdn.com/i/teamlogos/mlb/500/cle.png',
  'cleveland guardians': 'https://a.espncdn.com/i/teamlogos/mlb/500/cle.png',
  'brewers': 'https://a.espncdn.com/i/teamlogos/mlb/500/mil.png',
  'milwaukee brewers': 'https://a.espncdn.com/i/teamlogos/mlb/500/mil.png',
  'athletics': 'https://a.espncdn.com/i/teamlogos/mlb/500/oak.png',
  'oakland athletics': 'https://a.espncdn.com/i/teamlogos/mlb/500/oak.png',
  'giants': 'https://a.espncdn.com/i/teamlogos/mlb/500/sf.png',
  'san francisco giants': 'https://a.espncdn.com/i/teamlogos/mlb/500/sf.png',
  'mets': 'https://a.espncdn.com/i/teamlogos/mlb/500/nym.png',
  'new york mets': 'https://a.espncdn.com/i/teamlogos/mlb/500/nym.png',
  'cubs': 'https://a.espncdn.com/i/teamlogos/mlb/500/chc.png',
  'chicago cubs': 'https://a.espncdn.com/i/teamlogos/mlb/500/chc.png',
  'white sox': 'https://a.espncdn.com/i/teamlogos/mlb/500/chw.png',
  'chicago white sox': 'https://a.espncdn.com/i/teamlogos/mlb/500/chw.png',
  'astros': 'https://a.espncdn.com/i/teamlogos/mlb/500/hou.png',
  'houston astros': 'https://a.espncdn.com/i/teamlogos/mlb/500/hou.png',
  'angels': 'https://a.espncdn.com/i/teamlogos/mlb/500/laa.png',
  'los angeles angels': 'https://a.espncdn.com/i/teamlogos/mlb/500/laa.png',
  'padres': 'https://a.espncdn.com/i/teamlogos/mlb/500/sd.png',
  'san diego padres': 'https://a.espncdn.com/i/teamlogos/mlb/500/sd.png',
  'mariners': 'https://a.espncdn.com/i/teamlogos/mlb/500/sea.png',
  'seattle mariners': 'https://a.espncdn.com/i/teamlogos/mlb/500/sea.png',
  'rangers': 'https://a.espncdn.com/i/teamlogos/mlb/500/tex.png',
  'texas rangers': 'https://a.espncdn.com/i/teamlogos/mlb/500/tex.png',
  'blue jays': 'https://a.espncdn.com/i/teamlogos/mlb/500/tor.png',
  'toronto blue jays': 'https://a.espncdn.com/i/teamlogos/mlb/500/tor.png',
  'braves': 'https://a.espncdn.com/i/teamlogos/mlb/500/atl.png',
  'atlanta braves': 'https://a.espncdn.com/i/teamlogos/mlb/500/atl.png',
  'marlins': 'https://a.espncdn.com/i/teamlogos/mlb/500/mia.png',
  'miami marlins': 'https://a.espncdn.com/i/teamlogos/mlb/500/mia.png',
  'nationals': 'https://a.espncdn.com/i/teamlogos/mlb/500/wsh.png',
  'washington nationals': 'https://a.espncdn.com/i/teamlogos/mlb/500/wsh.png',
  'reds': 'https://a.espncdn.com/i/teamlogos/mlb/500/cin.png',
  'cincinnati reds': 'https://a.espncdn.com/i/teamlogos/mlb/500/cin.png',
  'pirates': 'https://a.espncdn.com/i/teamlogos/mlb/500/pit.png',
  'pittsburgh pirates': 'https://a.espncdn.com/i/teamlogos/mlb/500/pit.png',
  'cardinals': 'https://a.espncdn.com/i/teamlogos/mlb/500/stl.png',
  'st. louis cardinals': 'https://a.espncdn.com/i/teamlogos/mlb/500/stl.png',
  'rockies': 'https://a.espncdn.com/i/teamlogos/mlb/500/col.png',
  'colorado rockies': 'https://a.espncdn.com/i/teamlogos/mlb/500/col.png',
  'diamondbacks': 'https://a.espncdn.com/i/teamlogos/mlb/500/ari.png',
  'arizona diamondbacks': 'https://a.espncdn.com/i/teamlogos/mlb/500/ari.png',
  'rays': 'https://a.espncdn.com/i/teamlogos/mlb/500/tb.png',
  'tampa bay rays': 'https://a.espncdn.com/i/teamlogos/mlb/500/tb.png',
  'orioles': 'https://a.espncdn.com/i/teamlogos/mlb/500/bal.png',
  'baltimore orioles': 'https://a.espncdn.com/i/teamlogos/mlb/500/bal.png',
  'tigers': 'https://a.espncdn.com/i/teamlogos/mlb/500/det.png',
  'detroit tigers': 'https://a.espncdn.com/i/teamlogos/mlb/500/det.png',
  'twins': 'https://a.espncdn.com/i/teamlogos/mlb/500/min.png',
  'minnesota twins': 'https://a.espncdn.com/i/teamlogos/mlb/500/min.png',
  'royals': 'https://a.espncdn.com/i/teamlogos/mlb/500/kc.png',
  'kansas city royals': 'https://a.espncdn.com/i/teamlogos/mlb/500/kc.png',
  
  // Soccer / World Cup
  'argentina': 'https://a.espncdn.com/i/teamlogos/soccer/500/202.png',
  'brazil': 'https://a.espncdn.com/i/teamlogos/soccer/500/205.png',
  'france': 'https://a.espncdn.com/i/teamlogos/soccer/500/342.png',
  'england': 'https://a.espncdn.com/i/teamlogos/soccer/500/448.png',
  'usa': 'https://a.espncdn.com/i/teamlogos/soccer/500/110.png',
  'united states': 'https://a.espncdn.com/i/teamlogos/soccer/500/110.png',
  'germany': 'https://a.espncdn.com/i/teamlogos/soccer/500/381.png',
  'spain': 'https://a.espncdn.com/i/teamlogos/soccer/500/474.png',
  'italy': 'https://a.espncdn.com/i/teamlogos/soccer/500/389.png',
  'mexico': 'https://a.espncdn.com/i/teamlogos/soccer/500/203.png',
  'netherlands': 'https://a.espncdn.com/i/teamlogos/soccer/500/449.png',
  'portugal': 'https://a.espncdn.com/i/teamlogos/soccer/500/470.png',
  'croatia': 'https://a.espncdn.com/i/teamlogos/soccer/500/472.png',
  'morocco': 'https://a.espncdn.com/i/teamlogos/soccer/500/220.png',
  'japan': 'https://a.espncdn.com/i/teamlogos/soccer/500/302.png',
  'senegal': 'https://a.espncdn.com/i/teamlogos/soccer/500/654.png',
  
  // Leagues
  'mlb': 'https://a.espncdn.com/i/teamlogos/leagues/500/mlb.png',
  'nfl': 'https://a.espncdn.com/i/teamlogos/leagues/500/nfl.png',
  'nba': 'https://a.espncdn.com/i/teamlogos/leagues/500/nba.png',
};

const resolveTeamLogo = (input: string | undefined): string | undefined => {
  if (!input) return undefined;
  if (input.startsWith('http://') || input.startsWith('https://')) {
    return input;
  }
  const normalized = input.toLowerCase().trim();
  if (TEAM_LOGO_MAP[normalized]) {
    return TEAM_LOGO_MAP[normalized];
  }
  for (const [key, value] of Object.entries(TEAM_LOGO_MAP)) {
    if (normalized.includes(key)) {
      return value;
    }
  }
  if (normalized.includes('mlb')) return TEAM_LOGO_MAP['mlb'];
  if (normalized.includes('nfl')) return TEAM_LOGO_MAP['nfl'];
  if (normalized.includes('nba')) return TEAM_LOGO_MAP['nba'];
  return undefined;
};

const EDGE_COLOR_MAP: Record<string, string> = {
  'High': '#D4AF37', // Champagne Gold
  'Medium': '#E2E8F0', // Muted Platinum
  'Low': '#94A3B8', // Darker Slate
  'Neutral': '#64748B', // Neutral Gray
};

const EDGE_BADGE_STYLES: Record<string, { text: string; bg: string; border: string }> = {
  'High': { text: '#D4AF37', bg: 'rgba(212, 175, 55, 0.08)', border: 'rgba(212, 175, 55, 0.15)' },
  'Medium': { text: '#E2E8F0', bg: 'rgba(226, 232, 240, 0.08)', border: 'rgba(226, 232, 240, 0.15)' },
  'Low': { text: '#94A3B8', bg: 'rgba(148, 163, 184, 0.08)', border: 'rgba(148, 163, 184, 0.15)' },
  'Neutral': { text: '#64748B', bg: 'rgba(100, 116, 139, 0.08)', border: 'rgba(100, 116, 139, 0.15)' },
};

const BettingAnglesRenderer: React.FC<{ payload: BettingAnglesPayload }> = ({ payload }) => {
  return (
    <div className="my-8 space-y-8 font-tight antialiased">
      {payload.analysis_markdown && (
        <div className="text-base text-[#E2E8F0] leading-relaxed mb-6 font-tight">
          <ReactMarkdown>{payload.analysis_markdown}</ReactMarkdown>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {payload.angles.map((angle, idx) => {
          const logoUrl = angle.image_url 
            ? resolveTeamLogo(angle.image_url) 
            : (resolveTeamLogo(angle.title) || resolveTeamLogo(angle.description));

          const badgeStyle = EDGE_BADGE_STYLES[angle.edge] || EDGE_BADGE_STYLES.Neutral;

          return (
            <div key={idx} className="group relative flex flex-col rounded-xl transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-1 p-6 sm:p-8"
                 style={{
                   background: 'rgba(18, 18, 18, 0.6)',
                   backdropFilter: 'blur(20px)',
                   borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                   borderLeft: '1px solid rgba(255, 255, 255, 0.03)',
                   borderRight: '1px solid rgba(255, 255, 255, 0.03)',
                   borderBottom: '1px solid rgba(255, 255, 255, 0.01)',
                   boxShadow: '0px 1px 2px rgba(0, 0, 0, 0.3), 0px 8px 16px rgba(0, 0, 0, 0.2), 0px 24px 48px rgba(0, 0, 0, 0.15)',
                   overflow: 'visible'
                 }}>
                 
              <div className="mb-5 flex items-start justify-between gap-6">
                <div className="flex flex-col gap-3">
                  <div>
                    <span className="text-[10px] font-semibold uppercase tracking-wider font-tight px-2.5 py-0.5 rounded border"
                          style={{
                            color: badgeStyle.text,
                            backgroundColor: badgeStyle.bg,
                            borderColor: badgeStyle.border
                          }}>
                      {angle.edge} Edge
                    </span>
                  </div>
                  <h4 className="font-serif text-2xl tracking-tight text-[#F5F5F7] leading-snug">{angle.title}</h4>
                </div>
                
                {logoUrl && (
                  <div className="shrink-0 transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-105">
                    <img src={logoUrl} alt={angle.title} className="h-12 w-12 object-contain opacity-100 aspect-square drop-shadow-[0_0_8px_rgba(255,255,255,0.2)]" />
                  </div>
                )}
              </div>
              
              <div className="mb-6 flex-grow border-l border-white/5 pl-4">
                <p className="text-sm leading-relaxed text-[#94A3B8] tracking-normal font-tight">{angle.description}</p>
              </div>
              
              <div className="mt-auto flex items-center justify-between font-tight border-t border-white/5 pt-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full transition-all duration-500 group-hover:scale-105 group-hover:shadow-[0_0_12px_rgba(52,199,89,0.25)]"
                       style={{
                         background: 'rgba(52, 199, 89, 0.08)',
                         boxShadow: 'inset 0 1px 0 rgba(52, 199, 89, 0.15)',
                         border: '1px solid rgba(52, 199, 89, 0.2)'
                       }}>
                    <CheckCircle className="h-3.5 w-3.5 text-[#34C759] fill-[#34C759]/10" />
                  </div>
                  <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-[#E2E8F0] font-tight">Play: <span className="text-[#34C759] font-semibold">{angle.recommendation}</span></span>
                </div>
                <span className="font-mono text-sm font-medium text-[#E2E8F0] tracking-tighter">{angle.odds}</span>
              </div>
            </div>
          );
        })}
      </div>

      {payload.consensus && (
        <div className="mt-8 transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-1 rounded-xl p-6 sm:p-8"
             style={{
                 background: 'rgba(18, 18, 18, 0.6)',
                 backdropFilter: 'blur(20px)',
                 borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                 borderLeft: '1px solid rgba(255, 255, 255, 0.03)',
                 borderRight: '1px solid rgba(255, 255, 255, 0.03)',
                 borderBottom: '1px solid rgba(255, 255, 255, 0.01)',
                 boxShadow: '0px 1px 2px rgba(0, 0, 0, 0.3), 0px 8px 16px rgba(0, 0, 0, 0.2), 0px 24px 48px rgba(0, 0, 0, 0.15)',
                 overflow: 'visible'
             }}>
          <div className="mb-6 flex items-center justify-between border-b border-white/5 pb-4">
            <h4 className="font-serif text-2xl tracking-tight text-[#E2E8F0]">Market Consensus</h4>
            <span className="text-[11px] font-medium uppercase tracking-[0.05em] text-[#94A3B8] font-tight">{payload.consensus.game_name}</span>
          </div>
          <div className="space-y-4">
            {payload.consensus.splits.map((split, idx) => {
              const totalMoney = split.homeMoney + split.awayMoney;
              const homeMoneyPct = totalMoney > 0 ? Math.round((split.homeMoney / totalMoney) * 100) : 50;
              const awayMoneyPct = totalMoney > 0 ? 100 - homeMoneyPct : 50;

              const totalTickets = split.homeTickets + split.awayTickets;
              const homeTicketsPct = totalTickets > 0 ? Math.round((split.homeTickets / totalTickets) * 100) : 50;
              const awayTicketsPct = totalTickets > 0 ? 100 - homeTicketsPct : 50;

              return (
                <div key={idx} className="group relative flex flex-col sm:flex-row sm:items-center justify-between gap-6 py-4 border-b border-white/5 last:border-0 last:pb-0">
                  {/* Monolithic Active State Indicator (on hover) */}
                  <div className="absolute -left-6 sm:-left-8 top-1/2 -translate-y-1/2 h-8 w-[2px] bg-white opacity-0 rounded-full transition-opacity duration-300 group-hover:opacity-100 shadow-[0_0_8px_rgba(255,255,255,0.4)]" />
                  
                  <div className="flex flex-col gap-1.5 min-w-[160px] font-tight">
                    <span className="text-sm font-medium tracking-tight text-[#F5F5F7] font-tight">{split.betType}</span>
                    {split.sharpSignal && (
                      <div className="flex items-start gap-1.5 text-xs text-[#D4AF37] font-tight">
                        <Zap className="h-3.5 w-3.5 shrink-0" />
                        <span className="leading-snug font-medium">{split.sharpSignal}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-1 items-center gap-10">
                    <div className="flex-1">
                      <div className="flex justify-between text-xs mb-2.5 font-tight">
                        <span className="text-[#94A3B8] uppercase tracking-wider font-tight">{split.selectionHome}</span>
                        <span className="text-[#F5F5F7] font-mono tracking-tighter">{homeMoneyPct}% <span className="text-[10px] text-[#86868B] font-tight">Cash</span> • {homeTicketsPct}% <span className="text-[10px] text-[#86868B] font-tight">Bets</span></span>
                      </div>
                      <div className="h-[2px] w-full bg-white/5 overflow-visible relative">
                        <div className="absolute top-0 left-0 h-full bg-[#E2E8F0] transition-all duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)]" style={{ width: `${homeMoneyPct}%`, boxShadow: '0 0 6px rgba(226, 232, 240, 0.6)' }} />
                      </div>
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between text-xs mb-2.5 font-tight">
                        <span className="text-[#94A3B8] uppercase tracking-wider font-tight">{split.selectionAway}</span>
                        <span className="text-[#F5F5F7] font-mono tracking-tighter">{awayMoneyPct}% <span className="text-[10px] text-[#86868B] font-tight">Cash</span> • {awayTicketsPct}% <span className="text-[10px] text-[#86868B] font-tight">Bets</span></span>
                      </div>
                      <div className="h-[2px] w-full bg-white/5 overflow-visible relative">
                        <div className="absolute top-0 left-0 h-full bg-[#94A3B8] transition-all duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)]" style={{ width: `${awayMoneyPct}%`, boxShadow: '0 0 6px rgba(148, 163, 184, 0.6)' }} />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

const EngineeringDiagnosticRenderer: React.FC<{ payload: EngineeringDiagnosticPayload }> = ({ payload }) => {
  return (
    <div className="my-6 rounded-xl border border-[#FF9500]/30 bg-[#161618] shadow-glass overflow-hidden">
      <div className="bg-[#FF9500]/10 p-3 flex items-center gap-2 border-b border-[#FF9500]/20">
        <Activity className="h-4 w-4 text-[#FF9500]" />
        <span className="text-xs font-bold uppercase tracking-wider text-[#FF9500]">Engineering Diagnostic</span>
        {payload.risk_flag && (
          <span className="ml-auto rounded bg-[#FF3B30]/20 px-2 py-0.5 text-[10px] font-bold text-[#FF3B30]">
            RISK: {payload.risk_flag}
          </span>
        )}
      </div>
      <div className="p-5 space-y-4 font-sans text-sm">
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-[#86868B]">Root Cause</h4>
          <p className="text-[#F5F5F7] leading-relaxed">{payload.root_cause}</p>
        </div>
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-[#86868B]">Proposed Fix</h4>
          <p className="text-[#F5F5F7] leading-relaxed">{payload.proposed_fix}</p>
        </div>
        {payload.invalidation_condition && (
          <div>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-[#86868B]">Invalidation Condition</h4>
            <p className="text-[#FF9500] leading-relaxed">{payload.invalidation_condition}</p>
          </div>
        )}
        {payload.patch_code && (
          <div className="mt-4">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#86868B]">Suggested Patch</h4>
            <pre className="overflow-x-auto rounded-lg border border-white/5 bg-[#000000] p-3 text-xs font-mono text-[#34C759]">
              <code>{payload.patch_code}</code>
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};

const SystemErrorRenderer: React.FC<{ payload: SystemErrorPayload }> = ({ payload }) => {
  return (
    <div className="my-4 rounded-xl border border-[#FF3B30]/30 bg-[#161618] shadow-glass overflow-hidden">
      <div className="bg-[#FF3B30]/10 p-3 flex items-center gap-2 border-b border-[#FF3B30]/20">
        <ShieldAlert className="h-4 w-4 text-[#FF3B30]" />
        <span className="text-xs font-bold uppercase tracking-wider text-[#FF3B30]">System Fault ({payload.code})</span>
      </div>
      <div className="p-4 space-y-3 font-sans text-sm">
        <p className="text-[#F5F5F7]">{payload.message}</p>
        <div className="flex items-center gap-4 text-xs text-[#86868B] font-mono border-t border-white/5 pt-3">
          {payload.traceId && <span>Trace: {payload.traceId.slice(0, 8)}...</span>}
          {payload.retryable ? (
            <span className="text-[#FF9500]">● Retryable</span>
          ) : (
            <span className="text-[#FF3B30]">● Fatal</span>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 3. MAIN AST INTERCEPTOR
// ============================================================================

interface MessageRendererProps {
  content: string;
  onSendMessage?: (input: string) => void;
  workspaceToken?: string | null;
}

export const PROSE_CLASS = `prose max-w-none text-[15px] leading-relaxed text-[#F5F5F7] space-y-4
  prose-p:my-3 prose-headings:text-white prose-headings:font-medium prose-headings:tracking-tight prose-headings:my-5
  prose-ul:list-disc prose-ul:pl-5 prose-ol:list-decimal prose-ol:pl-5 prose-li:my-1.5
  prose-a:text-[#0A84FF] hover:prose-a:text-[#0A84FF]/80 prose-a:underline-offset-4 transition-colors
  prose-strong:font-semibold prose-strong:text-white
  prose-code:bg-[#161618] prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:text-[13px] prose-code:font-mono prose-code:border prose-code:border-white/5
  prose-table:w-full prose-table:border-collapse prose-table:text-[13px] prose-table:text-left prose-table:my-4
  prose-th:border-b prose-th:border-white/10 prose-th:py-2.5 prose-th:px-3 prose-th:font-semibold prose-th:text-[#86868B] prose-th:uppercase prose-th:tracking-wider prose-th:bg-[#161618]
  prose-td:border-b prose-td:border-white/5 prose-td:py-2.5 prose-td:px-3 prose-td:text-[#F5F5F7]`;

const CUSTOM_ARTIFACT_LANGS = ['diagnostic', 'youtube_media', 'bettingangles', 'engineering_diagnostic', 'system_error', 'jobmanifest', 'scoreboard', 'workspace', 'sidebar', 'emailviewer', 'datatable', 'world_cup_profile', 'world_cup_group', 'playerprops', 'html', 'mlbscoreboard', 'mlbcoreledger', 'mlbspannercontext', 'mlbspannerresults', 'worldcupspannerresults', 'legacy_diagnostic'];
const HIDDEN_ARTIFACT_LANGS = ['system_prompt', 'thought'];

export const MessageRenderer: React.FC<MessageRendererProps> = ({ content, onSendMessage, workspaceToken }) => {
  return (
    <div className={PROSE_CLASS}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
        p({ children, ...props }) {
          return <div className="mb-4 last:mb-0" {...props}>{children}</div>;
        },
        pre({ children, ...props }) {
          // Check if this pre contains a custom artifact code block
          const child = React.Children.toArray(children)[0];
          if (React.isValidElement(child) && typeof (child.props as any).className === 'string') {
            const match = /language-(\w+)/.exec((child.props as any).className);
            if (match) {
              const lang = match[1];
              if (CUSTOM_ARTIFACT_LANGS.includes(lang)) {
                // Return the custom artifact directly WITHOUT a <pre> wrapper to prevent <pre><div> nesting
                return <div className="artifact-wrapper my-4">{children}</div>;
              }
              if (HIDDEN_ARTIFACT_LANGS.includes(lang)) {
                return null;
              }
            }
          }
          // Standard markdown code block wrapper
          return (
            <pre className="my-4 overflow-x-auto rounded-xl border border-white/5 bg-[#000000] p-4 shadow-inset" {...props}>
              {children}
            </pre>
          );
        },
        code({ node, className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '');
          const language = match ? match[1] : null;
          const rawContent = String(children).replace(/\n$/, '');

          if (language) {
            if (CUSTOM_ARTIFACT_LANGS.includes(language)) {
              try {
                const parsedJson = JSON.parse(rawContent);

                // Route to specific Zod validators based on language tag
                switch (language) {
                  case 'diagnostic': {
                    const result = DiagnosticSchema.safeParse(parsedJson);
                    if (result.success) return <DiagnosticRenderer payload={result.data} />;
                    break;
                  }
                  case 'youtube_media': {
                    const result = YoutubeMediaSchema.safeParse(parsedJson);
                    if (result.success) return <YoutubeMediaRenderer payload={result.data} />;
                    break;
                  }
                  case 'bettingangles': {
                    const result = BettingAnglesPayloadSchema.safeParse(parsedJson);
                    if (result.success) return <BettingAnglesRenderer payload={result.data} />;
                    break;
                  }
                  case 'engineering_diagnostic': {
                    const result = EngineeringDiagnosticSchema.safeParse(parsedJson);
                    if (result.success) return <EngineeringDiagnosticRenderer payload={result.data} />;
                    break;
                  }
                  case 'system_error': {
                    const result = SystemErrorSchema.safeParse(parsedJson);
                    if (result.success) return <SystemErrorRenderer payload={result.data} />;
                    break;
                  }
                  case 'jobmanifest': {
                    return <JobManifestArtifact dataString={rawContent} />;
                  }
                  case 'scoreboard': return <ScoreboardArtifact dataString={rawContent} />;
                  case 'workspace': return <WorkspaceArtifact dataString={rawContent} onEmailClick={(msgId, subject) => onSendMessage?.(`Open email "${subject}" (message_id: ${msgId})`)} />;
                  case 'sidebar': return <SidebarArtifact dataString={rawContent} onAction={onSendMessage!} />;
                  case 'emailviewer': return <EmailViewerArtifact dataString={rawContent} onReply={onSendMessage!} />;
                  case 'datatable': return <DataTableArtifact dataString={rawContent} />;
                  case 'world_cup_profile': return <WorldCupArtifact dataString={rawContent} />;
                  case 'world_cup_group': return <WorldCupGroupArtifact dataString={rawContent} />;
                  case 'playerprops': return <PlayerPropArtifact dataString={rawContent} />;
                  case 'html': return <HtmlArtifact dataString={rawContent} workspaceToken={workspaceToken} />;
                  case 'mlbscoreboard': return <MLBScoreboard />;
                  case 'mlbcoreledger': return <MlbCoreLedgerArtifact dataString={rawContent} />;
                  case 'mlbspannercontext': return <MlbSpannerMatchupCard dataString={rawContent} />;
                  case 'mlbspannerresults': return <MlbSpannerChatResults dataString={rawContent} />;
                  case 'worldcupspannerresults': return <WorldCupSpannerChatResults dataString={rawContent} />;
                  case 'legacy_diagnostic': return <DiagnosticArtifact dataString={rawContent} onRecover={() => onSendMessage?.('Apply the proposed diagnostic patch.')} />;
                }
              } catch (e) {
                // JSON parsing failed (likely streaming in progress). Render a skeleton.
                return (
                  <div className="my-4 h-24 w-full animate-pulse rounded-xl border border-white/5 bg-[#161618] shadow-glass flex items-center justify-center">
                    <Activity className="h-5 w-5 text-[#86868B] animate-spin" />
                  </div>
                );
              }

              // If validation fails but JSON is valid, render a safe error block
              return (
                <div className="my-4 rounded-xl border border-[#FF3B30]/30 bg-[#FF3B30]/10 p-4 flex items-start gap-3">
                  <ShieldAlert className="h-5 w-5 text-[#FF3B30] shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-semibold text-[#FF3B30]">Data Display Error</h4>
                    <p className="text-xs text-[#FF3B30]/80 mt-1">This result couldn't be displayed properly. The data shape didn't match the expected format.</p>
                  </div>
                </div>
              );
            }
            
            if (HIDDEN_ARTIFACT_LANGS.includes(language)) {
              return null;
            }

            // If it's a non-JSON language (like 'javascript', 'python', etc), just render it normally
            return (
              <code className={`text-sm font-mono text-[#F5F5F7] ${className || ''}`} {...props}>
                {children}
              </code>
            );
          }

          // Inline Code Block Rendering
          return (
            <code className="rounded bg-[#161618] px-1.5 py-0.5 font-mono text-[13px] text-[#34C759] border border-white/5" {...props}>
              {children}
            </code>
          );
        }
      }}
    >
      {content}
    </ReactMarkdown>
    </div>
  );
};
