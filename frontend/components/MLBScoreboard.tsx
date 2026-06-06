import React, { useState, useEffect, useRef, useCallback } from 'react';
import { sportsGroundingService, GroundingFaultError } from '../lib/SportsGroundingService';

/**
 * Typography: relies on these being defined in the app's Tailwind config / CSS.
 * Headlines + body: a committed serif/sans (e.g. 'Tiempos', 'Söhne') via font-display / font-body.
 * Numbers: a real mono via font-mono (SF Mono / Menlo / JetBrains Mono).
 * Do NOT let this fall back to Inter/system-ui — that's the AI smell tell.
 */

interface TeamSide {
  name: string;
  abbreviation: string;
  record: string;
  score?: number | null;
}

interface LiveState {
  inning?: number;          // 1..9+
  inning_half?: 'top' | 'bottom';
  outs?: number;            // 0..2
  on_first?: boolean;
  on_second?: boolean;
  on_third?: boolean;
}

interface Game {
  game_id: string;
  short_status: string;     // raw upstream status — never rendered directly
  status_state?: 'pre' | 'in' | 'post' | string;
  start_time?: string;      // ISO, for pregame
  home_team: TeamSide;
  away_team: TeamSide;
  live?: LiveState;
}

const POLL_MS = 20_000;

/* ---------- plain-english transforms (never show upstream language) ---------- */

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

const startClock = (iso?: string) => {
  if (!iso) return 'Today';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Today';
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

/** The one place game state becomes human. No "short_status" ever reaches the DOM. */
const stateLabel = (g: Game): string => {
  if (g.status_state === 'post') return 'Final';
  if (g.status_state === 'pre') return startClock(g.start_time);
  const l = g.live;
  if (l?.inning) {
    const half = l.inning_half === 'bottom' ? 'Bot' : 'Top';
    return `${half} ${ordinal(l.inning)}`;
  }
  return 'Live';
};

/* ---------- bases diamond (the Yahoo-density piece) ---------- */

const BaseDiamond: React.FC<{ live?: LiveState }> = ({ live }) => {
  const on = (b?: boolean) => (b ? 'var(--accent)' : 'transparent');
  const stroke = 'var(--line)';
  return (
    <svg viewBox="0 0 40 40" className="w-7 h-7" aria-hidden>
      {/* second (top) */}
      <rect x="15" y="3" width="10" height="10" transform="rotate(45 20 8)"
        fill={on(live?.on_second)} stroke={stroke} strokeWidth="1.5" />
      {/* third (left) */}
      <rect x="3" y="15" width="10" height="10" transform="rotate(45 8 20)"
        fill={on(live?.on_third)} stroke={stroke} strokeWidth="1.5" />
      {/* first (right) */}
      <rect x="27" y="15" width="10" height="10" transform="rotate(45 32 20)"
        fill={on(live?.on_first)} stroke={stroke} strokeWidth="1.5" />
    </svg>
  );
};

const OutsPips: React.FC<{ outs?: number }> = ({ outs = 0 }) => (
  <div className="flex items-center gap-1">
    {[0, 1, 2].map((i) => (
      <span
        key={i}
        className="w-1.5 h-1.5 rounded-full"
        style={{ background: i < outs ? 'var(--ink)' : 'var(--line)' }}
      />
    ))}
  </div>
);

/* ---------- one row per team ---------- */

const TeamRow: React.FC<{ side: TeamSide; live: boolean; winner: boolean }> = ({ side, live, winner }) => {
  const logo = `https://a.espncdn.com/i/teamlogos/mlb/500/scoreboard/${side.abbreviation.toLowerCase()}.png`;
  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-3 min-w-0">
        <img src={logo} alt="" className="w-7 h-7 object-contain mix-blend-multiply shrink-0" />
        <div className="min-w-0">
          <div className={`truncate ${winner ? 'text-[var(--ink)] font-semibold' : 'text-[var(--ink)]'}`}>
            {side.name}
          </div>
          <div className="font-mono text-[11px] text-[var(--muted)]">{side.record}</div>
        </div>
      </div>
      <div className={`font-mono tabular-nums text-2xl ml-4 ${
        live || winner ? 'text-[var(--ink)]' : 'text-[var(--muted)]'
      } ${winner ? 'font-semibold' : ''}`}>
        {side.score ?? (live ? 0 : '–')}
      </div>
    </div>
  );
};

/* ---------- game card ---------- */

const GameCard: React.FC<{ game: Game }> = ({ game }) => {
  const live = game.status_state === 'in';
  const post = game.status_state === 'post';
  const hs = game.home_team.score ?? 0;
  const as = game.away_team.score ?? 0;

  return (
    <div className="bg-[var(--card)] border border-[var(--line)] hover:border-[var(--line-strong)] transition-colors duration-200">
      <div className="px-4 py-3 flex items-center justify-between border-b border-[var(--line)]">
        <span className={`font-mono text-[11px] uppercase tracking-widest ${live ? 'text-[var(--accent)]' : 'text-[var(--muted)]'}`}>
          {live && <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--accent)] mr-1.5 align-middle animate-pulse" />}
          {stateLabel(game)}
        </span>
        {live && (
          <div className="flex items-center gap-3">
            <BaseDiamond live={game.live} />
            <OutsPips outs={game.live?.outs} />
          </div>
        )}
      </div>
      <div className="px-4 pb-2 pt-1">
        <TeamRow side={game.away_team} live={live} winner={post && as > hs} />
        <div className="border-t border-[var(--line)]" />
        <TeamRow side={game.home_team} live={live} winner={post && hs > as} />
      </div>
    </div>
  );
};

/* ---------- board ---------- */

export const MLBScoreboard: React.FC = () => {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [softError, setSoftError] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async (initial: boolean) => {
    try {
      const data = await sportsGroundingService.fetchLiveSchedule(12);
      if (data?.events) {
        // live games first, then upcoming, then finals
        const order: Record<string, number> = { in: 0, pre: 1, post: 2 };
        const sorted = [...data.events].sort(
          (a: Game, b: Game) => (order[a.status_state ?? 'pre'] ?? 1) - (order[b.status_state ?? 'pre'] ?? 1)
        );
        setGames(sorted);
        setSoftError(false);
      }
    } catch {
      // The bettor never sees plumbing. If we have prior scores, keep showing them.
      // Only surface a quiet, human line if we have nothing at all.
      if (initial) setSoftError(true);
    } finally {
      if (initial) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(true);
    timer.current = setInterval(() => load(false), POLL_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [load]);

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const anyLive = games.some((g) => g.status_state === 'in');

  /* theme tokens — warm off-white, one earned accent */
  const themeVars = {
    ['--bg' as string]: '#FAF8F4',
    ['--card' as string]: '#FFFFFF',
    ['--ink' as string]: '#1A1A18',
    ['--muted' as string]: '#8A857C',
    ['--line' as string]: 'rgba(26,26,24,0.10)',
    ['--line-strong' as string]: 'rgba(26,26,24,0.22)',
    ['--accent' as string]: '#1F7A4D', // single accent, used only for live + bases
  } as React.CSSProperties;

  if (loading) {
    return (
      <div style={themeVars} className="w-full max-w-[920px] bg-[var(--bg)] p-6 md:p-8">
        <div className="h-6 w-40 bg-[var(--line)] mb-6" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => <div key={i} className="h-32 bg-[var(--card)] border border-[var(--line)]" />)}
        </div>
      </div>
    );
  }

  if (softError && games.length === 0) {
    return (
      <div style={themeVars} className="w-full max-w-[920px] bg-[var(--bg)] p-6 md:p-8">
        <p className="text-[var(--ink)] font-body">Scores are taking a second. Hang tight — they'll show up here.</p>
      </div>
    );
  }

  if (games.length === 0) {
    return (
      <div style={themeVars} className="w-full max-w-[920px] bg-[var(--bg)] p-6 md:p-8">
        <p className="text-[var(--ink)] font-body">No games on the slate today.</p>
      </div>
    );
  }

  return (
    <div style={themeVars} className="w-full max-w-[920px] bg-[var(--bg)] p-6 md:p-8 selection:bg-[var(--accent)]/10">
      <header className="flex items-baseline justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl md:text-3xl tracking-tight text-[var(--ink)]">MLB</h1>
          <p className="font-mono text-[11px] uppercase tracking-widest text-[var(--muted)] mt-1">{today}</p>
        </div>
        {anyLive && (
          <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-[var(--accent)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
            Live now
          </span>
        )}
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {games.map((g) => <GameCard key={g.game_id} game={g} />)}
      </div>
    </div>
  );
};
