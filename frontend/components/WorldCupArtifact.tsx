// ============================================================================
// WorldCupArtifact — Premium Team Profile Card
// Design: Porsche Catalog / Leica aesthetic. High-end minimalism.
// Features: Zero bloat, SWR stream-safe, ELO Gauge, Trends, Injuries, Lineups.
// ============================================================================

import React, { useMemo, useRef, useState } from 'react';
import { Globe2, Shirt, History, Users, ArrowUpRight, Activity, TrendingUp, ShieldAlert, Clock, UserPlus } from 'lucide-react';
import { motion } from 'framer-motion';

// ─── Interfaces & Physics ──────────────────────────────────────────────────

interface PowerRating {
  rating: number;
  source: string;
  updated_at?: string;
}

interface Trend {
  trend_type: string;
  wins: number;
  losses: number;
  pushes: number;
  percentage: number | string;
  source?: string;
}

interface Injury {
  player_name?: string;
  player?: string; // Support both naming styles
  position?: string;
  status: string;
  description?: string;
  impact?: 'High' | 'Medium' | 'Low'; // Support both naming styles
}

interface LineupPlayer {
  player_name?: string;
  name?: string; // Support both naming styles
  position: string;
  is_projected_starter: boolean;
  jersey_number?: number;
  number?: number; // Support both naming styles
  headshot_url?: string;
  headshotUrl?: string; // Support both naming styles
}

interface LineupProjections {
  match_id?: string;
  matchId?: string;
  opponent_code?: string;
  opponentCode?: string;
  players: LineupPlayer[];
}

interface PlayerProp {
  player: string;
  market: string;
  line: string;
  odds: string;
  trend?: 'up' | 'down' | 'neutral';
  headshot_url?: string;
  headshotUrl?: string;
}

interface TimeToFirstGoal {
  average_minutes?: number;
  averageMinutes?: number;
  bands: { label: string; odds: string }[];
}

interface WorldCupProfile {
  team?: string;
  teamName?: string;
  nickname?: string;
  manager?: string;
  summary?: string;
  tactical_outlook?: string;
  the_drip?: string;
  world_cup_history?: string;
  key_players?: string[];
  source_url?: string;
  fifa_ranking?: number;
  group_letter?: string;
  worldCupGroup?: string;
  confederation?: string;
  
  // Power Rating bindings
  power_ratings?: PowerRating[];
  powerRating?: number; // Reverted to user requested binding
  
  // Trends bindings
  trends?: Trend[];
  teamTrends?: string[] | Trend[]; // Reverted to user requested binding
  
  // Injuries bindings
  injuries?: Injury[];
  activeInjuryReport?: Injury[]; // Reverted to user requested binding
  
  lineup_projections?: LineupProjections;
  lineupProjections?: LineupProjections;
  
  // Props & TTFG
  player_props?: PlayerProp[];
  playerProps?: PlayerProp[];
  
  time_to_first_goal?: TimeToFirstGoal;
  timeToFirstGoal?: TimeToFirstGoal;
}

const SPRING = { type: 'spring', bounce: 0, duration: 0.6, mass: 1, damping: 20 };

// ISO Alpha-2 Mapping — autonomous high-res flags via flagcdn.com
const FLAG_MAP: Record<string, string> = {
  brazil: 'br', argentina: 'ar', france: 'fr', england: 'gb-eng', spain: 'es',
  germany: 'de', portugal: 'pt', italy: 'it', usa: 'us', 'united states': 'us',
  mexico: 'mx', canada: 'ca', 'south korea': 'kr', japan: 'jp', senegal: 'sn',
  uruguay: 'uy', croatia: 'hr', colombia: 'co', netherlands: 'nl', belgium: 'be',
  switzerland: 'ch', morocco: 'ma', 'costa rica': 'cr', ecuador: 'ec', peru: 'pe',
  chile: 'cl', australia: 'au', ghana: 'gh', cameroon: 'cm', nigeria: 'ng',
  'saudi arabia': 'sa', qatar: 'qa', iran: 'ir', wales: 'gb-wls', scotland: 'gb-sct',
  poland: 'pl', denmark: 'dk', sweden: 'se', norway: 'no', austria: 'at',
  serbia: 'rs', turkey: 'tr', egypt: 'eg', tunisia: 'tn', algeria: 'dz',
  'ivory coast': 'ci', paraguay: 'py', bolivia: 'bo', venezuela: 've',
  honduras: 'hn', panama: 'pa', jamaica: 'jm', 'trinidad and tobago': 'tt',
  iceland: 'is', 'czech republic': 'cz', czechia: 'cz', romania: 'ro', hungary: 'hu',
  ukraine: 'ua', greece: 'gr', ireland: 'ie', 'new zealand': 'nz',
  'congo dr': 'cd', kongo: 'cd', mali: 'ml', 'burkina faso': 'bf', guatemala: 'gt',
  'el salvador': 'sv', cuba: 'cu', haiti: 'ht', china: 'cn', indonesia: 'id',
  algeria_dz: 'dz', bosnia: 'ba', 'bosnia-herz': 'ba', cape_verde: 'cv', 'cape verde': 'cv',
  curacao: 'cw', turkey_tr: 'tr', turkiye: 'tr', uzbekistan: 'uz'
};

const getFlagUrl = (teamName?: string) => {
  if (!teamName) return null;
  const code = FLAG_MAP[teamName.toLowerCase().trim()];
  return code ? `https://flagcdn.com/w160/${code}.png` : null;
};

// ─── Pure Parsing Utility ─────────────────────────────────

const parseProfileData = (raw: string): WorldCupProfile | null => {
  if (!raw) return null;
  try {
    const match = raw.match(/```[a-zA-Z_]*\n([\s\S]*?)(?:```|$)/);
    let clean = match ? match[1] : raw;
    clean = clean.trim().replace(/,\s*([\]}])/g, '$1');
    return JSON.parse(clean);
  } catch {
    return null;
  }
};

// ─── Main Component ────────────────────────────────────────────────────────

export const WorldCupArtifact: React.FC<{ dataString: string }> = ({ dataString }) => {
  const cache = useRef<WorldCupProfile | null>(null);
  const [flagError, setFlagError] = useState(false);

  const data = useMemo(() => {
    const parsed = parseProfileData(dataString);
    if (parsed) cache.current = parsed;
    return parsed || cache.current;
  }, [dataString]);

  if (!data) {
    return (
      <div className="my-8 py-5 px-6 bg-black/[0.01] border border-black/[0.03] rounded-[24px] flex items-center justify-center gap-3 w-fit mx-auto">
        <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}>
          <Globe2 size={15} className="text-black/30" />
        </motion.div>
        <span className="text-[12px] font-medium tracking-tight text-black/40 font-sans">Scouting team profile...</span>
      </div>
    );
  }

  const teamName = data.team || data.teamName || 'Team';
  const players = Array.isArray(data.key_players) ? data.key_players : [];
  const flagUrl = !flagError ? getFlagUrl(teamName) : null;

  // Power Rating ELO calculation (Supports powerRating and power_ratings list)
  const powerRatingValue = useMemo(() => {
    if (data.powerRating !== undefined) {
      // Normalize down if ELO is on 1000-3000 scale
      return data.powerRating > 500 ? (data.powerRating / 3000) * 100 : data.powerRating;
    }
    const latestRating = data.power_ratings?.[0];
    if (latestRating) {
      const rating = parseFloat(String(latestRating.rating));
      return rating > 500 ? (rating / 3000) * 100 : rating;
    }
    return null;
  }, [data.powerRating, data.power_ratings]);

  const powerRatingDisplay = useMemo(() => {
    if (data.powerRating !== undefined) return data.powerRating;
    const latestRating = data.power_ratings?.[0];
    return latestRating ? parseFloat(String(latestRating.rating)) : null;
  }, [data.powerRating, data.power_ratings]);

  const powerRatingSource = data.power_ratings?.[0]?.source || 'elo_market_sentiment';

  // Trends calculation
  const trendsList = useMemo(() => {
    if (Array.isArray(data.teamTrends)) return data.teamTrends;
    return Array.isArray(data.trends) ? data.trends : [];
  }, [data.teamTrends, data.trends]);

  // Injuries calculation
  const injuriesList = useMemo(() => {
    if (Array.isArray(data.activeInjuryReport)) return data.activeInjuryReport;
    return Array.isArray(data.injuries) ? data.injuries : [];
  }, [data.activeInjuryReport, data.injuries]);

  // Lineups processing
  const lineup = data.lineup_projections || data.lineupProjections;
  const starters = lineup?.players ? lineup.players.filter(p => p.is_projected_starter) : [];
  const bench = lineup?.players ? lineup.players.filter(p => !p.is_projected_starter) : [];

  // Group starters by tactical positions (GK, DF, MF, FW) and assign numbers/headshots
  const gkStarters = useMemo(() => {
    return starters.filter(p => p.position === 'GK').map((p, idx) => ({
      ...p,
      resolvedName: p.name || p.player_name || 'GK',
      resolvedNumber: p.number || p.jersey_number || 1,
      resolvedHeadshot: p.headshotUrl || p.headshot_url
    }));
  }, [starters]);

  const dfStarters = useMemo(() => {
    return starters.filter(p => p.position === 'DF' || p.position === 'DEF').map((p, idx) => ({
      ...p,
      resolvedName: p.name || p.player_name || 'DF',
      resolvedNumber: p.number || p.jersey_number || (idx + 2),
      resolvedHeadshot: p.headshotUrl || p.headshot_url
    }));
  }, [starters]);

  const mfStarters = useMemo(() => {
    return starters.filter(p => p.position === 'MF' || p.position === 'MID').map((p, idx) => ({
      ...p,
      resolvedName: p.name || p.player_name || 'MF',
      resolvedNumber: p.number || p.jersey_number || (idx + dfStarters.length + 2),
      resolvedHeadshot: p.headshotUrl || p.headshot_url
    }));
  }, [starters, dfStarters]);

  const fwStarters = useMemo(() => {
    return starters.filter(p => p.position === 'FW' || p.position === 'FWD').map((p, idx) => ({
      ...p,
      resolvedName: p.name || p.player_name || 'FW',
      resolvedNumber: p.number || p.jersey_number || (idx + dfStarters.length + mfStarters.length + 2),
      resolvedHeadshot: p.headshotUrl || p.headshot_url
    }));
  }, [starters, dfStarters, mfStarters]);

  // Player Props & TTFG
  const playerPropsList = data.playerProps || data.player_props || [];
  const ttfg = data.timeToFirstGoal || data.time_to_first_goal;

  const resolvedGroup = data.worldCupGroup || (data.group_letter ? `Group ${data.group_letter}` : 'Tournament');

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING}
      className="my-8 w-full bg-[#FAF9F6] rounded-[28px] shadow-[0_24px_50px_rgba(26,26,24,0.04),0_0_1px_rgba(26,26,24,0.08)] border border-black/[0.03] overflow-hidden isolate font-sans selection:bg-bronze/10"
    >
      {/* ─── Premium Header ───────────────────────────────────────────── */}
      <div className="px-8 pt-9 pb-7 border-b border-black/[0.03] relative overflow-hidden bg-gradient-to-b from-black/[0.01] to-transparent">
        {/* Ambient Flag Watermark */}
        {flagUrl && (
          <div className="absolute -right-6 -top-6 w-52 h-52 opacity-[0.02] pointer-events-none select-none overflow-hidden blur-md">
            <img src={flagUrl} alt="" className="w-full h-full object-cover" />
          </div>
        )}

        <div className="relative z-10 flex items-start justify-between gap-5">
          <div className="flex items-start gap-5">
            {/* Elegant double-ringed flag circle */}
            <div className="relative p-[3px] rounded-full bg-gradient-to-tr from-black/[0.08] via-white to-black/[0.03] shadow-[0_4px_12px_rgba(0,0,0,0.03)] shrink-0">
              <div className="w-14 h-14 rounded-full bg-white flex items-center justify-center overflow-hidden border border-black/[0.02]">
                {flagUrl ? (
                  <img src={flagUrl} alt={`${teamName} flag`} onError={() => setFlagError(true)} className="w-full h-full object-cover scale-[1.05]" />
                ) : (
                  <Globe2 size={20} className="text-black/30" />
                )}
              </div>
            </div>

            <div className="flex flex-col justify-center min-w-0 pt-0.5">
              <h3 className="text-[28px] font-normal text-charcoal tracking-tight leading-tight">
                {teamName}
              </h3>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] font-mono font-medium tracking-widest text-[#706E6B] uppercase">
                  {data.nickname || 'National Team'}
                </span>
                {data.manager && (
                  <>
                    <span className="text-black/10 text-[9px]">•</span>
                    <span className="text-[10px] text-black/45 tracking-tight font-medium">
                      Manager: {data.manager}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Group and FIFA Badges */}
          <div className="flex flex-col items-end gap-1.5 shrink-0 pt-1">
            {data.fifa_ranking && (
              <span className="px-2.5 py-0.5 rounded-full border border-black/[0.06] text-black/55 text-[9px] font-mono tracking-widest uppercase bg-black/[0.01]">
                FIFA #{data.fifa_ranking}
              </span>
            )}
            {resolvedGroup && (
              <span className="px-2.5 py-0.5 rounded-full border border-black/[0.06] text-[#8C7A6B] text-[9px] font-mono tracking-widest uppercase bg-[#8C7A6B]/[0.02]">
                {resolvedGroup}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="p-8 space-y-8">
        {/* ─── Summary Overview ───────────────────────────────── */}
        {data.summary && (
          <p className="text-[14.5px] leading-[1.65] tracking-tight text-charcoal/80 pl-6 border-l border-bronze/40 font-light text-pretty">
            {data.summary}
          </p>
        )}

        {/* ─── ELO Power Ratings Gauge ────────────────────────── */}
        {powerRatingDisplay !== null && powerRatingValue !== null && (
          <div className="bg-[#FAF9F6] rounded-[20px] p-6 border border-black/[0.03] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <TrendingUp size={14} className="text-[#8C7A6B]" strokeWidth={2} />
                <span className="text-[10px] font-mono font-medium text-black/40 uppercase tracking-wider">Power Rating</span>
              </div>
              <span className="text-[16px] font-semibold text-charcoal tracking-tight">
                {powerRatingDisplay.toFixed(0)}
                {data.powerRating === undefined && <span className="text-black/35 font-light text-[13px]"> / 100</span>}
              </span>
            </div>
            
            {/* Minimalist Chronometer Linear Gauge */}
            <div className="relative pt-2 pb-5">
              <div className="w-full h-[1.5px] bg-black/[0.06] relative">
                {/* Highlight active rating segment */}
                <div
                  className="absolute top-[-0.25px] h-[2px] bg-gradient-to-r from-bronze to-warm-gold"
                  style={{ width: `${Math.min(100, Math.max(0, powerRatingValue))}%` }}
                />
                
                {/* Precision Floating Needle Dot */}
                <div 
                  className="absolute -top-[5px] -translate-x-1/2 flex flex-col items-center group cursor-default"
                  style={{ left: `${Math.min(100, Math.max(0, powerRatingValue))}%` }}
                >
                  <div className="w-3 h-3 rounded-full bg-white border border-black/15 shadow-md flex items-center justify-center">
                    <div className="w-1.5 h-1.5 rounded-full bg-warm-gold" />
                  </div>
                </div>
              </div>

              {/* Gauge Tick Marks */}
              <div className="absolute inset-x-0 bottom-0 flex justify-between px-0.5">
                {data.powerRating !== undefined ? (
                  [1000, 1500, 2000, 2500, 3000].map((tick) => (
                    <div key={tick} className="flex flex-col items-center">
                      <div className="h-1 w-[1px] bg-black/[0.08]" />
                      <span className="text-[8px] font-mono text-black/25 mt-1">{tick}</span>
                    </div>
                  ))
                ) : (
                  [0, 25, 50, 75, 100].map((tick) => (
                    <div key={tick} className="flex flex-col items-center">
                      <div className="h-1 w-[1px] bg-black/[0.08]" />
                      <span className="text-[8px] font-mono text-black/25 mt-1">{tick}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {data.powerRating === undefined && (
              <span className="text-[9px] text-[#706E6B]/50 font-mono block mt-1">
                PROVENANCE: {powerRatingSource}
              </span>
            )}
          </div>
        )}

        {/* ─── The Drip & Tactical Intel (Grid) ───────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {data.the_drip && (
            <div className="bg-white/40 rounded-[20px] p-6 border border-black/[0.02] shadow-[0_2px_12px_rgba(140,122,107,0.01)]">
              <div className="flex items-center gap-2 mb-3">
                <Shirt size={14} className="text-bronze" strokeWidth={2} />
                <span className="text-[10px] font-mono font-medium text-black/40 uppercase tracking-wider">The Drip (Culture & Kits)</span>
              </div>
              <p className="text-[13px] font-light text-charcoal/90 leading-[1.65] text-pretty">
                {data.the_drip}
              </p>
            </div>
          )}

          {data.tactical_outlook && (
            <div className="bg-white/40 rounded-[20px] p-6 border border-black/[0.02] shadow-[0_2px_12px_rgba(140,122,107,0.01)]">
              <div className="flex items-center gap-2 mb-3">
                <Activity size={14} className="text-[#929B87]" strokeWidth={2} />
                <span className="text-[10px] font-mono font-medium text-black/40 uppercase tracking-wider">Tactical Outlook</span>
              </div>
              <p className="text-[13px] font-light text-charcoal/90 leading-[1.65] text-pretty">
                {data.tactical_outlook}
              </p>
            </div>
          )}
        </div>

        {/* ─── Team Trends Ledger ────────────────────────────── */}
        {trendsList.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-[10px] font-mono font-medium text-black/30 uppercase tracking-widest">Team Trends Ledger</h4>
            {typeof trendsList[0] === 'string' ? (
              // If teamTrends is string[]
              <div className="bg-white/40 border border-black/[0.02] rounded-[20px] p-6 shadow-[0_2px_12px_rgba(140,122,107,0.01)]">
                <ul className="space-y-3">
                  {(trendsList as string[]).map((trend, idx) => (
                    <li key={idx} className="flex items-start text-[13.5px] text-charcoal/80">
                      <span className="w-1.5 h-1.5 rounded-full bg-bronze/70 mt-2 mr-3 shrink-0" />
                      <span className="leading-relaxed font-light">{trend}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              // If trends is Trend[] objects
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                {(trendsList as Trend[]).map((t, idx) => {
                  const isNA = t.wins === 0 && t.losses === 0 && t.pushes === 0;
                  const pctVal = typeof t.percentage === 'number' ? (t.percentage * 100).toFixed(1) : parseFloat(t.percentage) ? (parseFloat(t.percentage) * 100).toFixed(1) : null;
                  return (
                    <div key={idx} className="bg-white/30 border border-black/[0.02] rounded-[18px] p-4.5 shadow-[0_2px_10px_rgba(0,0,0,0.01)] flex flex-col justify-between">
                      <div>
                        <p className="text-[8.5px] font-mono font-medium text-black/40 uppercase tracking-wider truncate mb-1.5">{t.trend_type.replace(/_/g, ' ')}</p>
                        <p className="text-[18px] font-light text-charcoal tracking-tight">
                          {isNA ? '—' : `${t.wins}-${t.losses}-${t.pushes}`}
                        </p>
                      </div>
                      {pctVal && (
                        <p className="text-[11px] font-medium text-sage mt-2">
                          {pctVal}% Cover
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ─── Active Injury Report ───────────────────────────── */}
        {injuriesList.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <ShieldAlert size={14} className="text-bronze/70" strokeWidth={2} />
              <h4 className="text-[10px] font-mono font-medium text-black/30 uppercase tracking-widest">Active Injury Report</h4>
            </div>
            <div className="space-y-3">
              {injuriesList.map((i, idx) => {
                const isOut = i.status.toLowerCase().includes('out') || i.impact === 'High';
                const playerDisplayName = i.player || i.player_name || 'Player';
                const injuryDetails = i.description || `Impact: ${i.impact || 'Low'} - Status: ${i.status}`;
                return (
                  <div key={idx} className="flex items-start gap-4 p-4.5 rounded-[18px] bg-white/30 border border-black/[0.02] relative overflow-hidden">
                    {/* Minimalist status bar */}
                    <div className={`absolute left-0 inset-y-0 w-[3px] ${isOut ? 'bg-bronze/60' : 'bg-warm-gold/60'}`} />
                    
                    <div className="space-y-1 pl-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-[9px] font-mono font-bold tracking-wider uppercase px-2 py-0.5 rounded ${isOut ? 'bg-bronze/10 text-bronze' : 'bg-warm-gold/10 text-warm-gold'}`}>
                          {i.status.replace(/ - .*$/, '')}
                        </span>
                        <p className="text-[13.5px] font-medium text-charcoal leading-none">
                          {playerDisplayName} {i.position && <span className="text-[10px] font-mono text-black/30 font-light">({i.position})</span>}
                        </p>
                      </div>
                      <p className="text-[12px] font-light text-charcoal/70 leading-relaxed pt-1">{injuryDetails}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ─── Starting XI Pitch Blueprint ────────────────── */}
        {lineup && (
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between">
              <h4 className="text-[10px] font-mono font-medium text-black/30 uppercase tracking-widest">Starting XI vs {lineup.opponent_code || lineup.opponentCode}</h4>
              <span className="text-[9px] font-mono text-[#706E6B]/50 uppercase tracking-wider">Tactical Projection</span>
            </div>

            {/* Premium Slate Chalkboard Soccer Pitch */}
            <div className="relative w-full aspect-[1.35] bg-gradient-to-b from-sand to-clay/20 rounded-[24px] border border-clay p-5 flex flex-col justify-between overflow-hidden shadow-glass-sm select-none">
              
              {/* Slate Grid Field Lines */}
              <div className="absolute inset-0 opacity-[0.4] pointer-events-none bg-[radial-gradient(ellipse_at_center,rgba(26,26,24,0.05)_0%,transparent_80%)]" />
              
              {/* Field Markings */}
              <div className="absolute inset-x-0 top-0 h-1/2 border-b border-clay/50 pointer-events-none" />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 rounded-full border border-clay/50 pointer-events-none" />
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-44 h-20 border-x border-b border-clay/50 rounded-b-[18px] pointer-events-none" />
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-44 h-20 border-x border-t border-clay/50 rounded-t-[18px] pointer-events-none" />

              {/* FW Row */}
              <div className="flex justify-around items-center w-full z-10 pt-3">
                {fwStarters.map((p, i) => (
                  <div key={i} className="flex flex-col items-center">
                    <motion.div 
                      whileHover={{ scale: 1.08 }}
                      className={`relative w-9 h-9 rounded-full flex items-center justify-center text-[10px] font-mono font-medium shadow-md bg-white border border-clay`}
                    >
                      {p.resolvedHeadshot ? (
                        <>
                          <img 
                            src={p.resolvedHeadshot} 
                            alt={p.resolvedName} 
                            className="w-full h-full object-cover rounded-full" 
                          />
                          <div className="absolute -bottom-1 -right-1 bg-alabaster text-[8px] rounded-full w-4 h-4 flex items-center justify-center border border-clay text-charcoal font-mono leading-none">
                            {p.resolvedNumber}
                          </div>
                        </>
                      ) : (
                        <span className="text-charcoal">{p.resolvedNumber}</span>
                      )}
                    </motion.div>
                    <span className="text-[9px] font-medium text-charcoal bg-white/80 backdrop-blur-md border border-clay shadow-sm px-2.5 py-0.5 rounded-full mt-1.5 tracking-tight text-center max-w-[85px] truncate">{p.resolvedName.split(' ').pop()}</span>
                  </div>
                ))}
              </div>

              {/* MF Row */}
              <div className="flex justify-around items-center w-full z-10 py-1">
                {mfStarters.map((p, i) => (
                  <div key={i} className="flex flex-col items-center">
                    <motion.div 
                      whileHover={{ scale: 1.08 }}
                      className={`relative w-9 h-9 rounded-full flex items-center justify-center text-[10px] font-mono font-medium shadow-md bg-white border border-clay`}
                    >
                      {p.resolvedHeadshot ? (
                        <>
                          <img 
                            src={p.resolvedHeadshot} 
                            alt={p.resolvedName} 
                            className="w-full h-full object-cover rounded-full" 
                          />
                          <div className="absolute -bottom-1 -right-1 bg-alabaster text-[8px] rounded-full w-4 h-4 flex items-center justify-center border border-clay text-charcoal font-mono leading-none">
                            {p.resolvedNumber}
                          </div>
                        </>
                      ) : (
                        <span className="text-charcoal">{p.resolvedNumber}</span>
                      )}
                    </motion.div>
                    <span className="text-[9px] font-medium text-charcoal bg-white/80 backdrop-blur-md border border-clay shadow-sm px-2.5 py-0.5 rounded-full mt-1.5 tracking-tight text-center max-w-[85px] truncate">{p.resolvedName.split(' ').pop()}</span>
                  </div>
                ))}
              </div>

              {/* DF Row */}
              <div className="flex justify-around items-center w-full z-10 py-1">
                {dfStarters.map((p, i) => (
                  <div key={i} className="flex flex-col items-center">
                    <motion.div 
                      whileHover={{ scale: 1.08 }}
                      className={`relative w-9 h-9 rounded-full flex items-center justify-center text-[10px] font-mono font-medium shadow-md bg-white border border-clay`}
                    >
                      {p.resolvedHeadshot ? (
                        <>
                          <img 
                            src={p.resolvedHeadshot} 
                            alt={p.resolvedName} 
                            className="w-full h-full object-cover rounded-full" 
                          />
                          <div className="absolute -bottom-1 -right-1 bg-alabaster text-[8px] rounded-full w-4 h-4 flex items-center justify-center border border-clay text-charcoal font-mono leading-none">
                            {p.resolvedNumber}
                          </div>
                        </>
                      ) : (
                        <span className="text-charcoal">{p.resolvedNumber}</span>
                      )}
                    </motion.div>
                    <span className="text-[9px] font-medium text-charcoal bg-white/80 backdrop-blur-md border border-clay shadow-sm px-2.5 py-0.5 rounded-full mt-1.5 tracking-tight text-center max-w-[85px] truncate">{p.resolvedName.split(' ').pop()}</span>
                  </div>
                ))}
              </div>

              {/* GK Row */}
              <div className="flex justify-center items-center w-full z-10 pb-2">
                {gkStarters.map((p, i) => (
                  <div key={i} className="flex flex-col items-center">
                    <motion.div 
                      whileHover={{ scale: 1.08 }}
                      className={`relative w-9 h-9 rounded-full flex items-center justify-center text-[10px] font-mono font-medium shadow-md bg-white border border-clay`}
                    >
                      {p.resolvedHeadshot ? (
                        <>
                          <img 
                            src={p.resolvedHeadshot} 
                            alt={p.resolvedName} 
                            className="w-full h-full object-cover rounded-full" 
                          />
                          <div className="absolute -bottom-1 -right-1 bg-alabaster text-[8px] rounded-full w-4 h-4 flex items-center justify-center border border-clay text-charcoal font-mono leading-none">
                            {p.resolvedNumber}
                          </div>
                        </>
                      ) : (
                        <span className="text-charcoal">{p.resolvedNumber}</span>
                      )}
                    </motion.div>
                    <span className="text-[9px] font-medium text-charcoal bg-white/80 backdrop-blur-md border border-clay shadow-sm px-2.5 py-0.5 rounded-full mt-1.5 tracking-tight text-center max-w-[85px] truncate">{p.resolvedName.split(' ').pop()}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Substitutes / Bench Section */}
            {bench.length > 0 && (
              <div className="bg-white/20 rounded-[20px] p-5 border border-black/[0.01]">
                <h5 className="text-[9px] font-mono font-medium text-black/30 uppercase tracking-widest mb-3">Available Substitutes</h5>
                <div className="flex flex-wrap gap-2">
                  {bench.map((p, idx) => (
                    <span key={idx} className="px-3 py-1 bg-white/70 border border-black/[0.03] shadow-[0_1px_4px_rgba(0,0,0,0.01)] rounded-xl text-[11px] font-medium text-[#1A1A18]/80 font-sans">
                      {p.name || p.player_name} <span className="text-[9px] font-mono text-black/30 font-light">({p.position})</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── Match Markets: Props & TTFG (Grid Layout) ────────────────── */}
        {(playerPropsList.length > 0 || ttfg) && (
          <div className="bg-[#FAF9F6] border border-black/[0.03] rounded-[24px] overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
            <div className="bg-black/[0.01] px-6 py-4.5 border-b border-black/[0.03] flex items-center justify-between">
              <h3 className="text-[13.5px] font-normal uppercase tracking-wider text-charcoal flex items-center">
                <UserPlus className="w-4 h-4 mr-2 text-bronze" strokeWidth={2} />
                Key Player Props & Market Intelligence
              </h3>
            </div>
            
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Player Props */}
              {playerPropsList.length > 0 && (
                <div className="space-y-4">
                  <p className="text-[10px] text-black/35 font-mono uppercase tracking-wider">Targeted Props</p>
                  <div className="space-y-2.5">
                    {playerPropsList.map((prop, idx) => {
                      const headshot = prop.headshotUrl || prop.headshot_url;
                      return (
                        <div key={idx} className="flex items-center justify-between p-3.5 rounded-2xl bg-white/40 border border-black/[0.02] shadow-[0_1px_3px_rgba(0,0,0,0.01)] hover:border-black/[0.06] transition-colors">
                          <div className="flex items-center space-x-3.5">
                            {headshot ? (
                              <img 
                                src={headshot} 
                                alt={prop.player} 
                                className="w-9 h-9 rounded-full border border-black/[0.06] object-cover shrink-0" 
                              />
                            ) : (
                              <div className="w-9 h-9 rounded-full border border-black/[0.06] bg-black/[0.02] flex items-center justify-center shrink-0">
                                <Shirt size={14} className="text-black/30" />
                              </div>
                            )}
                            <div>
                              <p className="text-[13.5px] font-semibold text-charcoal leading-snug">{prop.player}</p>
                              <p className="text-[11.5px] text-black/50">{prop.market} ({prop.line})</p>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="inline-block px-2.5 py-1 rounded-lg bg-sage/10 text-[#7C8870] font-mono text-[12.5px] border border-sage/10">
                              {prop.odds}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Time to First Goal (TTFG) */}
              {ttfg && (
                <div className="space-y-4">
                  <div className="flex justify-between items-end">
                    <p className="text-[10px] text-black/35 font-mono uppercase tracking-wider">Time to First Goal (TTFG)</p>
                    {ttfg.averageMinutes !== undefined || ttfg.average_minutes !== undefined ? (
                      <p className="text-[11px] text-black/50 flex items-center">
                        <Clock className="w-3.5 h-3.5 mr-1" /> Avg: {ttfg.averageMinutes || ttfg.average_minutes} mins
                      </p>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-1 gap-2.5">
                    {ttfg.bands.map((band, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3.5 rounded-2xl bg-white/40 border border-black/[0.02] shadow-[0_1px_3px_rgba(0,0,0,0.01)]">
                        <span className="text-[13px] font-mono text-charcoal/80">{band.label}</span>
                        <span className="text-[13px] font-mono font-medium text-[#8C7A6B]">{band.odds}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[9.5px] text-black/35 italic">
                    *TTFG analysis based on prior 12 competitive international fixtures.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── History & Key Players ──────────────────────────── */}
        <div className="space-y-6 pt-2">
          {data.world_cup_history && (
            <div className="flex items-start gap-4">
              <div className="p-2 rounded-full bg-black/[0.02] border border-black/[0.04] shrink-0 mt-0.5">
                <History size={13} className="text-black/40" strokeWidth={2} />
              </div>
              <div className="min-w-0">
                <h4 className="text-[10px] font-mono font-medium text-black/30 uppercase tracking-widest mb-1.5">Tournament History</h4>
                <p className="text-[13.5px] font-light text-charcoal/80 leading-relaxed text-pretty">{data.world_cup_history}</p>
              </div>
            </div>
          )}

          {players.length > 0 && (
            <div className="flex items-start gap-4">
              <div className="p-2 rounded-full bg-black/[0.02] border border-black/[0.04] shrink-0 mt-0.5">
                <Users size={13} className="text-black/40" strokeWidth={2} />
              </div>
              <div className="w-full">
                <h4 className="text-[10px] font-mono font-medium text-black/30 uppercase tracking-widest mb-3.5">Key Players</h4>
                <div className="flex flex-wrap gap-2.5">
                  {players.map((player, idx) => (
                    <motion.div 
                      key={idx} 
                      whileHover={{ y: -1, scale: 1.01 }}
                      className="px-3.5 py-1.5 bg-white border border-black/[0.04] shadow-[0_2px_8px_rgba(26,26,24,0.02)] rounded-[12px] flex items-center justify-center"
                    >
                      <span className="text-[12.5px] font-medium text-charcoal tracking-tight">{player}</span>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─── Premium Footer (Deep Link CTA) ───────────── */}
      {data.source_url && (
        <div className="px-8 py-6 bg-black/[0.01] border-t border-black/[0.03] flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="text-[11px] font-mono text-black/40 tracking-tight flex items-center gap-2">
            <span>💧</span>
            <span>SOURCE: THEDRIP.TO</span>
          </span>
          <motion.a
            whileHover={{ scale: 1.015 }}
            whileTap={{ scale: 0.985 }}
            href={data.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-charcoal text-white text-[12.5px] font-medium tracking-tight shadow-btn-primary hover:bg-ink transition-all duration-300 w-full sm:w-auto justify-center shrink-0"
          >
            Read Official Team Guide
            <ArrowUpRight size={13} strokeWidth={2} className="text-white/60" />
          </motion.a>
        </div>
      )}
    </motion.div>
  );
};
