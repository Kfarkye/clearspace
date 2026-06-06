import React, { useState, useEffect, useRef, useCallback } from 'react';

/**
 * LiveGameDetail — the focused, single-game live view.
 *
 * Board cards (MLBScoreboard) show score + inning only — that's all the scoreboard
 * payload reliably carries. Bases, outs, count, batter/pitcher come from ESPN's
 * /summary endpoint, surfaced by the backend's espnEventPlays handler. Fetching that
 * per-card for a full slate is too many calls, so it lives here: shown only when a
 * bettor focuses one game. This is the "should I cash out" surface, not the board.
 */
const PLAYS_ENDPOINT = (sport: string, eventId: string) =>
  `/api-proxy/espn/${sport}/event/${eventId}/plays`;

const POLL_MS = 12_000;

interface Situation {
  balls: number | null;
  strikes: number | null;
  outs: number | null;
  onFirst: boolean;
  onSecond: boolean;
  onThird: boolean;
  batter: string | null;
  pitcher: string | null;
}
interface PlaysResponse {
  situation?: Situation;
  lastPlay?: { text: string } | null;
  winProbability?: { homeWinPct: number | null; awayWinPct: number | null } | null;
}

const BaseDiamond: React.FC<{ s?: Situation }> = ({ s }) => {
  const fill = (on?: boolean) => (on ? 'var(--accent)' : 'transparent');
  return (
    <svg viewBox="0 0 48 48" className="w-12 h-12" aria-hidden>
      <rect x="18" y="4" width="12" height="12" transform="rotate(45 24 10)" fill={fill(s?.onSecond)} stroke="var(--line)" strokeWidth="1.5" />
      <rect x="4" y="18" width="12" height="12" transform="rotate(45 10 24)" fill={fill(s?.onThird)} stroke="var(--line)" strokeWidth="1.5" />
      <rect x="32" y="18" width="12" height="12" transform="rotate(45 38 24)" fill={fill(s?.onFirst)} stroke="var(--line)" strokeWidth="1.5" />
    </svg>
  );
};

const Pips: React.FC<{ n?: number | null; total: number; label: string }> = ({ n, total, label }) => (
  <div className="flex flex-col items-center gap-1">
    <div className="flex gap-1">
      {Array.from({ length: total }).map((_, i) => (
        <span key={i} className="w-2 h-2 rounded-full" style={{ background: i < (n ?? 0) ? 'var(--ink)' : 'var(--line)' }} />
      ))}
    </div>
    <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--muted)]">{label}</span>
  </div>
);

export const LiveGameDetail: React.FC<{ sport: string; eventId: string }> = ({ sport, eventId }) => {
  const [data, setData] = useState<PlaysResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async (initial: boolean) => {
    try {
      const res = await fetch(PLAYS_ENDPOINT(sport, eventId));
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch {
      // Keep last good state on the screen; never surface plumbing to the bettor.
    } finally {
      if (initial) setLoading(false);
    }
  }, [sport, eventId]);

  useEffect(() => {
    load(true);
    timer.current = setInterval(() => load(false), POLL_MS);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [load]);

  const themeVars = {
    ['--ink' as string]: '#1A1A18',
    ['--muted' as string]: '#8A857C',
    ['--line' as string]: 'rgba(26,26,24,0.12)',
    ['--accent' as string]: '#1F7A4D',
  } as React.CSSProperties;

  if (loading) {
    return <div style={themeVars} className="h-28 bg-white border border-[var(--line)] rounded-xl animate-pulse" />;
  }

  const s = data?.situation;
  const wp = data?.winProbability;

  return (
    <div style={themeVars} className="bg-white border border-[var(--line)] rounded-xl p-5 flex flex-col gap-4 max-w-[640px]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-5">
          <BaseDiamond s={s} />
          <Pips n={s?.outs} total={3} label="Out" />
          <div className="flex gap-4">
            <Pips n={s?.balls} total={4} label="Ball" />
            <Pips n={s?.strikes} total={3} label="Strike" />
          </div>
        </div>
        {wp && wp.homeWinPct != null && (
          <div className="text-right">
            <div className="font-mono tabular-nums text-2xl text-[var(--ink)]">{Math.round(wp.homeWinPct * 100)}%</div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-[var(--muted)]">Home win</div>
          </div>
        )}
      </div>

      {(s?.batter || s?.pitcher) && (
        <div className="flex items-center gap-6 pt-3 border-t border-[var(--line)] text-sm">
          {s?.batter && <div><span className="text-[var(--muted)]">At bat </span><span className="text-[var(--ink)] font-medium">{s.batter}</span></div>}
          {s?.pitcher && <div><span className="text-[var(--muted)]">Pitching </span><span className="text-[var(--ink)] font-medium">{s.pitcher}</span></div>}
        </div>
      )}

      {data?.lastPlay?.text && (
        <p className="text-[var(--ink)] text-sm leading-relaxed">{data.lastPlay.text}</p>
      )}
    </div>
  );
};
