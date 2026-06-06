import React, { useMemo } from 'react';
import { motion } from 'framer-motion';

// --- Interfaces ---
export interface GroupTeam {
  name: string;
  logo_url?: string;
  logoUrl?: string;
  subtitle: string;
  key_player?: {
    name: string;
    position: string;
    team?: string;
    headshot_url?: string;
    headshotUrl?: string;
  };
  world_rank?: number;
  worldRank?: number;
  points: number | string;
}

export interface GroupBreakdownData {
  event_name?: string;
  eventName?: string;
  group_name?: string;
  groupName?: string;
  status?: string;
  teams: GroupTeam[];
}

const parseGroupData = (raw: string): GroupBreakdownData | null => {
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

const SPRING = { type: 'spring', bounce: 0, duration: 0.6, mass: 1, damping: 20 };

export const WorldCupGroupArtifact: React.FC<{ dataString: string }> = ({ dataString }) => {
  const data = useMemo(() => parseGroupData(dataString), [dataString]);

  if (!data || !Array.isArray(data.teams)) {
    return (
      <div className="w-full max-w-5xl bg-alabaster border border-charcoal/10 shadow-sm p-6 md:p-8 font-sans flex items-center justify-center">
        <span className="text-charcoal text-sm">Loading Group Breakdown...</span>
      </div>
    );
  }

  const eventName = data.eventName || data.event_name || 'FIFA World Cup 2026';
  const groupName = data.groupName || data.group_name || 'Group Breakdown';
  const status = data.status || 'Pre-Tournament';

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING}
      className="w-full max-w-5xl bg-alabaster border border-charcoal/10 shadow-sm p-6 md:p-8 font-sans flex flex-col gap-8 selection:bg-bronze/10"
    >
      <header className="flex justify-between items-end border-b border-charcoal/10 pb-4">
        <div className="flex flex-col gap-1">
          <time className="font-mono text-xs text-bronze uppercase tracking-widest">{eventName}</time>
          <h1 className="text-ink text-2xl font-medium tracking-tight">{groupName}</h1>
        </div>
        <div className="flex items-center gap-2 px-2 py-1 bg-charcoal/5 border border-charcoal/10 rounded-sm">
          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
          <span className="text-charcoal text-[10px] font-mono uppercase tracking-wider">{status}</span>
        </div>
      </header>

      <section className="flex flex-col gap-3">
        {/* Table Header */}
        <div className="grid grid-cols-12 gap-4 px-6 py-2 border-b border-charcoal/10">
          <div className="col-span-6 md:col-span-5 text-bronze font-mono text-[10px] uppercase tracking-widest">Nation</div>
          <div className="hidden md:block md:col-span-4 text-bronze font-mono text-[10px] uppercase tracking-widest">Key Player</div>
          <div className="col-span-3 md:col-span-2 text-bronze font-mono text-[10px] uppercase tracking-widest text-right">World Rank</div>
          <div className="col-span-3 md:col-span-1 text-bronze font-mono text-[10px] uppercase tracking-widest text-right">Pts</div>
        </div>

        {/* Rows */}
        {data.teams.map((team, idx) => {
          const logo = team.logoUrl || team.logo_url;
          const keyPlayer = team.key_player;
          const playerHeadshot = keyPlayer?.headshotUrl || keyPlayer?.headshot_url;
          const worldRank = team.worldRank || team.world_rank || '-';

          return (
            <motion.div 
              key={idx}
              whileHover={{ scale: 1.005, y: -1 }}
              transition={{ duration: 0.2 }}
              className="bg-sand border border-charcoal/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] hover:border-charcoal/20 hover:shadow-md transition-all duration-300 p-4 md:p-6 grid grid-cols-12 gap-4 items-center group rounded-sm cursor-default"
            >
              <div className="col-span-6 md:col-span-5 flex items-center gap-4">
                <div className="w-10 h-10 bg-alabaster border border-charcoal/10 rounded-full flex items-center justify-center p-1.5 shrink-0 shadow-sm">
                  {logo ? (
                    <img src={logo} alt={team.name} className="w-full h-full object-contain mix-blend-multiply" />
                  ) : (
                    <div className="w-full h-full rounded-full bg-charcoal/5" />
                  )}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-ink text-lg font-medium group-hover:text-charcoal transition-colors truncate">{team.name}</span>
                  <span className="text-charcoal font-mono text-[10px] uppercase tracking-widest mt-0.5 truncate">{team.subtitle}</span>
                </div>
              </div>

              <div className="hidden md:flex md:col-span-4 items-center gap-3 min-w-0">
                {keyPlayer ? (
                  <>
                    <div className="w-9 h-9 shrink-0">
                      {playerHeadshot ? (
                        <img src={playerHeadshot} alt={keyPlayer.name} className="w-9 h-9 rounded-full bg-alabaster border border-charcoal/10 object-cover object-top shadow-sm" />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-alabaster border border-charcoal/10 shadow-sm" />
                      )}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-ink text-sm font-medium truncate">{keyPlayer.name}</span>
                      <span className="text-charcoal font-mono text-[10px] truncate">
                        {keyPlayer.position} {keyPlayer.team ? `• ${keyPlayer.team}` : ''}
                      </span>
                    </div>
                  </>
                ) : (
                  <span className="text-charcoal/50 text-xs italic">N/A</span>
                )}
              </div>

              <div className="col-span-3 md:col-span-2 text-ink font-mono text-sm text-right tabular-nums">
                {worldRank}
              </div>

              <div className="col-span-3 md:col-span-1 text-ink font-mono text-xl tabular-nums text-right">
                {team.points}
              </div>
            </motion.div>
          );
        })}
      </section>
    </motion.div>
  );
};
