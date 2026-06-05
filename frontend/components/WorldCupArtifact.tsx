// ============================================================================
// WorldCupArtifact — Premium Team Profile Card
// Design: Apple Wallet / visionOS aesthetic. Deep materiality.
// Features: Zero bloat, SWR stream-safe, Autonomous Flags, Deep-linking.
// ============================================================================

import React, { useMemo, useRef, useState } from 'react';
import { Globe2, Shirt, History, Users, ArrowUpRight, Activity } from 'lucide-react';
import { motion } from 'framer-motion';

// ─── Interfaces & Physics ──────────────────────────────────────────────────

interface WorldCupProfile {
  team?: string;
  nickname?: string;
  manager?: string;
  summary?: string;
  tactical_outlook?: string;
  the_drip?: string;
  world_cup_history?: string;
  key_players?: string[];
  source_url?: string;
}

const SPRING = { type: 'spring', bounce: 0, duration: 0.5, mass: 0.8, damping: 18 };

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
  'congo dr': 'cd', mali: 'ml', 'burkina faso': 'bf', guatemala: 'gt',
  'el salvador': 'sv', cuba: 'cu', haiti: 'ht', china: 'cn', indonesia: 'id',
};

const getFlagUrl = (teamName?: string) => {
  if (!teamName) return null;
  const code = FLAG_MAP[teamName.toLowerCase().trim()];
  return code ? `https://flagcdn.com/w160/${code}.png` : null;
};

// ─── Pure Parsing Utility (Zero-Bloat SWR) ─────────────────────────────────

const parseProfileData = (raw: string): WorldCupProfile | null => {
  if (!raw) return null;
  try {
    // P1 FIX: Capturing group isolates JSON regardless of conversational filler
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
      <div className="my-8 py-5 px-6 bg-black/[0.02] border border-black/[0.04] rounded-[24px] flex items-center justify-center gap-3 w-fit mx-auto">
        <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}>
          <Globe2 size={16} className="text-black/40" />
        </motion.div>
        <span className="text-[13px] font-medium tracking-tight text-black/50">Scouting team profile...</span>
      </div>
    );
  }

  const players = Array.isArray(data.key_players) ? data.key_players : [];
  const flagUrl = !flagError ? getFlagUrl(data.team) : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING}
      className="my-8 w-full bg-white/70 backdrop-blur-3xl rounded-[32px] shadow-[0_24px_60px_rgba(0,0,0,0.06),0_0_1px_rgba(0,0,0,0.1)] border border-black/[0.04] overflow-hidden isolate font-sans selection:bg-[#007AFF]/15"
    >
      {/* ─── Premium Header ───────────────────────────────────────────── */}
      <div className="px-8 py-7 bg-gradient-to-b from-black/[0.02] to-transparent border-b border-black/[0.03] relative overflow-hidden">

        {/* Ambient Flag Watermark */}
        {flagUrl && (
          <div className="absolute -right-10 -top-10 w-64 h-64 opacity-[0.04] pointer-events-none select-none overflow-hidden blur-sm">
            <img src={flagUrl} alt="" className="w-full h-full object-cover" />
          </div>
        )}

        <div className="relative z-10 flex items-start gap-5">
          <div className="w-16 h-16 rounded-full bg-white shadow-[0_4px_12px_rgba(0,0,0,0.08)] border border-black/[0.04] flex items-center justify-center shrink-0 overflow-hidden">
            {flagUrl ? (
              <img src={flagUrl} alt={`${data.team} flag`} onError={() => setFlagError(true)} className="w-full h-full object-cover" />
            ) : (
              <Globe2 size={24} className="text-black/30" />
            )}
          </div>
          <div className="flex flex-col justify-center min-w-0 pt-1">
            <h3 className="text-[26px] font-semibold text-[#1D1D1F] tracking-tight leading-none truncate">
              {data.team}
            </h3>
            <span className="text-[13px] font-medium text-black/40 tracking-wide uppercase mt-1">
              {data.nickname || 'National Team'}
            </span>
            {data.manager && (
              <span className="text-[12px] font-medium text-black/30 mt-0.5">
                Manager: {data.manager}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="p-8 space-y-8">

        {/* ─── Summary Overview ───────────────────────────────── */}
        {data.summary && (
          <p className="text-[15px] leading-[1.65] tracking-[-0.01em] text-[#1D1D1F]/80 antialiased text-pretty border-l-[3px] border-[#007AFF]/40 pl-5">
            {data.summary}
          </p>
        )}

        {/* ─── The Drip & Tactical Intel (Grid) ───────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {data.the_drip && (
            <div className="bg-[#F5F5F7]/80 rounded-[20px] p-5 border border-black/[0.02]">
              <div className="flex items-center gap-2 mb-2">
                <Shirt size={16} className="text-[#007AFF]" strokeWidth={2.5} />
                <span className="text-[11px] font-bold text-black/40 uppercase tracking-[0.1em]">The Drip (Culture & Kits)</span>
              </div>
              <p className="text-[13.5px] font-medium text-[#1D1D1F]/90 leading-[1.6] text-pretty">
                {data.the_drip}
              </p>
            </div>
          )}

          {data.tactical_outlook && (
            <div className="bg-[#F5F5F7]/80 rounded-[20px] p-5 border border-black/[0.02]">
              <div className="flex items-center gap-2 mb-2">
                <Activity size={16} className="text-[#AF52DE]" strokeWidth={2.5} />
                <span className="text-[11px] font-bold text-black/40 uppercase tracking-[0.1em]">Tactical Outlook</span>
              </div>
              <p className="text-[13.5px] font-medium text-[#1D1D1F]/90 leading-[1.6] text-pretty">
                {data.tactical_outlook}
              </p>
            </div>
          )}
        </div>

        {/* ─── History & Key Players ──────────────────────────── */}
        <div className="space-y-6 pt-2">
          {data.world_cup_history && (
            <div className="flex items-start gap-3">
              <History size={16} className="text-black/30 shrink-0 mt-0.5" strokeWidth={2} />
              <div>
                <h4 className="text-[11px] font-bold text-black/30 uppercase tracking-[0.18em] mb-1">Tournament History</h4>
                <p className="text-[14px] font-medium text-[#1D1D1F]/80 leading-snug text-pretty">{data.world_cup_history}</p>
              </div>
            </div>
          )}

          {players.length > 0 && (
            <div className="flex items-start gap-3">
              <Users size={16} className="text-black/30 shrink-0 mt-0.5" strokeWidth={2} />
              <div className="w-full">
                <h4 className="text-[11px] font-bold text-black/30 uppercase tracking-[0.18em] mb-2.5">Key Players</h4>
                <div className="flex flex-wrap gap-2.5">
                  {players.map((player, idx) => (
                    <div key={idx} className="px-3.5 py-1.5 bg-white border border-black/[0.04] shadow-[0_2px_8px_rgba(0,0,0,0.02)] rounded-[12px] flex items-center justify-center">
                      <span className="text-[13px] font-semibold text-[#1D1D1F] tracking-tight">{player}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─── Traffic-Driving Footer (Deep Link CTA) ───────────── */}
      {data.source_url && (
        <div className="px-8 py-5 bg-black/[0.01] border-t border-black/[0.04] flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="text-[11.5px] font-medium text-black/40 tracking-tight flex items-center gap-1.5">
            <span className="w-4 h-4 bg-black/5 rounded-full flex items-center justify-center text-[10px]">💧</span>
            Source: TheDrip.to
          </span>
          <motion.a
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            href={data.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#1D1D1F] text-white text-[13px] font-semibold tracking-tight shadow-[0_4px_14px_rgba(0,0,0,0.15)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.2)] transition-all duration-300 w-full sm:w-auto justify-center shrink-0"
          >
            Read Official Team Guide
            <ArrowUpRight size={14} strokeWidth={2.5} className="text-white/70" />
          </motion.a>
        </div>
      )}
    </motion.div>
  );
};
