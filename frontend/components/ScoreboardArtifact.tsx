import React, { useMemo, memo } from 'react';
import { Trophy } from 'lucide-react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

// --- Interfaces ---

interface Team {
  name: string;
  abbr: string;
  score?: number | string;
  record?: string;
  odds?: string;
}

interface Game {
  id?: string;
  status: string;
  period?: string;
  date?: string;
  broadcast?: string;
  note?: string;
  away_team: Team;
  home_team: Team;
}

interface ScoreboardData {
  summary_markdown?: string;
  games?: Game[];
}

// --- Helpers ---

const normalizeStatus = (raw?: string): 'live' | 'final' | 'scheduled' => {
  const s = (raw || '').toLowerCase();
  if (s.includes('final') || s.includes('closed') || s.includes('completed') || s === 'f') return 'final';
  if (s.match(/live|in.?progress|inning|top|bot|mid|end|half|quarter/)) return 'live';
  return 'scheduled';
};

function parseJsonResilient(raw: string): any | null {
  let str = raw.trim();
  if (str.startsWith('```')) {
    const lines = str.split('\n');
    if (lines[0].startsWith('```')) lines.shift();
    if (lines[lines.length - 1]?.startsWith('```')) lines.pop();
    str = lines.join('\n').trim();
  }
  str = str.replace(/^\uFEFF/, '').replace(/[\u200B-\u200D\uFEFF]/g, '');
  try { return JSON.parse(str); } catch {}
  try { return JSON.parse(str.replace(/,\s*([}\]])/g, '$1')); } catch {}
  try {
    let a = str.replace(/,\s*$/, '');
    const ob = (a.match(/{/g) || []).length - (a.match(/}/g) || []).length;
    const ob2 = (a.match(/\[/g) || []).length - (a.match(/\]/g) || []).length;
    for (let i = 0; i < ob2; i++) a += ']';
    for (let i = 0; i < ob; i++) a += '}';
    return JSON.parse(a);
  } catch {}
  return null;
}

// --- Sub-components ---

const LiveGameCard = memo(({ game, onClick }: { game: Game; onClick?: () => void }) => {
  const awayScore = game.away_team?.score;
  const homeScore = game.home_team?.score;
  const awayWins = awayScore !== undefined && Number(awayScore) > Number(homeScore ?? 0);
  const homeWins = homeScore !== undefined && Number(homeScore) > Number(awayScore ?? 0);

  return (
    <div
      className="bg-alabaster border border-clay/60 rounded-[2.5rem] p-6 shadow-glass-sm flex flex-col gap-5 transition-all hover:border-bronze/30 hover:shadow-glass"
      style={{ cursor: onClick ? 'pointer' : 'default' }}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {/* Status pill */}
      <div className="flex items-center justify-between">
        <span className="px-3 py-1 rounded-full bg-clay/60 text-[10px] font-mono font-bold uppercase tracking-widest text-charcoal">
          {game.period || 'Live'}
        </span>
        {game.broadcast && (
          <span className="text-[9px] font-mono uppercase tracking-widest text-taupe opacity-70">
            {game.broadcast}
          </span>
        )}
      </div>

      {/* Hero Score */}
      <div className="flex items-baseline gap-4 w-full">
        <div className="flex flex-col flex-1">
          <span className={`text-3xl md:text-4xl font-sans tracking-tight truncate ${awayWins ? 'text-ink font-bold' : 'text-charcoal'}`}>
            {game.away_team?.abbr || game.away_team?.name || 'TBD'}
          </span>
          <span className={`text-5xl md:text-6xl font-mono tabular-nums tracking-tighter ${awayWins ? 'text-ink font-bold' : 'text-charcoal'}`}>
            {awayScore ?? '—'}
          </span>
        </div>
        <span className="text-2xl font-mono text-clay/60 font-bold self-end mb-2">/</span>
        <div className="flex flex-col flex-1 items-end text-right">
          <span className={`text-3xl md:text-4xl font-sans tracking-tight truncate ${homeWins ? 'text-ink font-bold' : 'text-charcoal'}`}>
            {game.home_team?.abbr || game.home_team?.name || 'TBD'}
          </span>
          <span className={`text-5xl md:text-6xl font-mono tabular-nums tracking-tighter ${homeWins ? 'text-ink font-bold' : 'text-charcoal'}`}>
            {homeScore ?? '—'}
          </span>
        </div>
      </div>

      {/* Odds bar */}
      {(game.away_team?.odds || game.home_team?.odds) && (
        <div className="flex items-center gap-2 text-[11px] font-mono text-taupe border-t border-clay/30 pt-3">
          <span className="text-bronze font-bold">DK</span>
          <span>{game.away_team?.abbr} {game.away_team?.odds || '—'}</span>
          <span className="text-clay">/</span>
          <span>{game.home_team?.abbr} {game.home_team?.odds || '—'}</span>
        </div>
      )}

      {/* Note */}
      {game.note && (
        <p className="text-[12px] text-charcoal leading-relaxed border-t border-clay/30 pt-3">{game.note}</p>
      )}
    </div>
  );
});
LiveGameCard.displayName = 'LiveGameCard';

const CompactGameRow = memo(({ game, onClick }: { game: Game; onClick?: () => void }) => {
  const status = normalizeStatus(game.status);
  const isScheduled = status === 'scheduled';
  const awayScore = game.away_team?.score;
  const homeScore = game.home_team?.score;
  const awayWins = !isScheduled && awayScore !== undefined && Number(awayScore) > Number(homeScore ?? 0);
  const homeWins = !isScheduled && homeScore !== undefined && Number(homeScore) > Number(awayScore ?? 0);

  return (
    <div
      className="flex flex-col py-3 border-b border-clay/30 last:border-b-0 hover:bg-clay/10 transition-colors px-2 -mx-2 rounded-lg gap-2"
      style={{ cursor: onClick ? 'pointer' : 'default' }}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className="flex items-center justify-between w-full">
        <div className="flex items-center gap-4 w-20 shrink-0">
          {status === 'final' ? (
            <span className="text-[10px] font-mono uppercase tracking-widest text-taupe font-bold">Final</span>
          ) : isScheduled && game.period && game.period.toLowerCase() !== 'scheduled' ? (
            <span className="text-[10px] font-mono uppercase tracking-widest text-bronze font-bold">{game.period}</span>
          ) : null}
        </div>

        <div className="flex-1 flex flex-col gap-1.5">
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              <span className={`text-[14px] font-sans tracking-tight truncate ${awayWins ? 'text-ink font-bold' : 'text-charcoal'}`}>
                {game.away_team?.name || game.away_team?.abbr || 'TBD'}
              </span>
              {isScheduled && game.away_team?.record && (
                <span className="text-[10px] font-mono text-taupe tracking-wide">{game.away_team.record}</span>
              )}
            </div>
            <span className={`text-[14px] font-mono tabular-nums ${awayWins ? 'text-ink font-bold' : 'text-charcoal'}`}>
              {isScheduled ? (game.away_team?.odds || '—') : (awayScore ?? '—')}
            </span>
          </div>
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              <span className={`text-[14px] font-sans tracking-tight truncate ${homeWins ? 'text-ink font-bold' : 'text-charcoal'}`}>
                {game.home_team?.name || game.home_team?.abbr || 'TBD'}
              </span>
              {isScheduled && game.home_team?.record && (
                <span className="text-[10px] font-mono text-taupe tracking-wide">{game.home_team.record}</span>
              )}
            </div>
            <span className={`text-[14px] font-mono tabular-nums ${homeWins ? 'text-ink font-bold' : 'text-charcoal'}`}>
              {isScheduled ? (game.home_team?.odds || '—') : (homeScore ?? '—')}
            </span>
          </div>
        </div>

        {game.broadcast && (
          <span className="hidden sm:block text-[9px] font-mono uppercase tracking-widest text-taupe shrink-0 text-right w-16 opacity-70">
            {game.broadcast}
          </span>
        )}
      </div>

      {status === 'final' && game.note && (
        <div className="text-[13px] text-charcoal leading-snug pl-24">{game.note}</div>
      )}
    </div>
  );
});
CompactGameRow.displayName = 'CompactGameRow';

// --- Main Component ---

export const ScoreboardArtifact: React.FC<{ dataString: string; onAction?: (query: string) => void }> = ({ dataString, onAction }) => {

  // Build a structured drill-in query for a game (ported from DailySlate)
  const buildDrillQuery = (game: Game): string => {
    const away = game.away_team?.name || game.away_team?.abbr || 'Away';
    const home = game.home_team?.name || game.home_team?.abbr || 'Home';
    let q = `Give me a full matchup breakdown for ${away} at ${home}. Include recent form, key injuries, starting lineups if available, and betting analysis.`;
    if (game.away_team?.odds || game.home_team?.odds) {
      q += `\n\nCurrent odds: ${away} ${game.away_team?.odds || '—'} / ${home} ${game.home_team?.odds || '—'}`;
    }
    if (game.broadcast) q += `\nBroadcast: ${game.broadcast}`;
    return q;
  };
  const data = useMemo(() => {
    const raw = parseJsonResilient(dataString);
    if (!raw) return null;

    // Normalize: Gemini server sends { events } with abbreviation/STATUS_* format
    // Component expects { games } with abbr/lowercase status
    const normalizeTeam = (t: any, oddsObj?: any, isHome?: boolean): Team | undefined => {
      if (!t) return undefined;
      // Resolve odds: team-level string wins, else extract from game-level odds object
      let teamOdds = t.odds;
      if (!teamOdds && oddsObj) {
        if (isHome && oddsObj.spread) teamOdds = oddsObj.spread;
        else if (!isHome && oddsObj.overUnder) teamOdds = `O/U ${oddsObj.overUnder}`;
      }
      return {
        name: t.name,
        abbr: t.abbreviation || t.abbr || '',
        score: t.score,
        record: t.record,
        odds: typeof teamOdds === 'string' ? teamOdds : teamOdds != null ? String(teamOdds) : undefined,
      };
    };

    const normalizeGame = (ev: any): Game => {
      const oddsObj = ev.odds && typeof ev.odds === 'object' ? ev.odds : undefined;
      return {
        id: ev.game_id || ev.id,
        status: (ev.status || '').replace(/^STATUS_/i, '').toLowerCase(),
        period: ev.period || ev.short_status || ev.date,
        date: ev.short_status || ev.date,
        broadcast: ev.broadcast,
        note: ev.series_summary || ev.game_notes || ev.note || '',
        away_team: normalizeTeam(ev.away_team, oddsObj, false) || { name: 'TBD', abbr: 'TBD' },
        home_team: normalizeTeam(ev.home_team, oddsObj, true) || { name: 'TBD', abbr: 'TBD' },
      };
    };

    // Accept either { games } or { events }
    const rawGames = raw.games || raw.events;
    const games: Game[] = rawGames
      ? rawGames.map(normalizeGame)
      : [];

    return {
      summary_markdown: raw.summary_markdown,
      games,
    } as ScoreboardData;
  }, [dataString]);

  const summaryHtml = useMemo(() => {
    if (!data?.summary_markdown) return null;
    return DOMPurify.sanitize(marked.parse(data.summary_markdown, { breaks: true }) as string);
  }, [data?.summary_markdown]);

  const { liveGames, finalGames, scheduledGames } = useMemo(() => {
    const games = data?.games ?? [];
    const live: Game[] = [];
    const final: Game[] = [];
    const scheduled: Game[] = [];
    for (const g of games) {
      const norm = normalizeStatus(g.status);
      if (norm === 'live') live.push(g);
      else if (norm === 'final') final.push(g);
      else scheduled.push(g);
    }
    return { liveGames: live, finalGames: final, scheduledGames: scheduled };
  }, [data?.games]);

  if (!data) {
    return (
      <div className="my-6 w-full bg-white/60 backdrop-blur-xl border border-clay/60 rounded-3xl shadow-glass-sm p-6 flex flex-col items-center justify-center min-h-[200px] space-y-4">
        <div className="w-8 h-8 rounded-full border-2 border-bronze/30 border-t-bronze animate-spin" />
        <p className="text-sm font-mono tracking-widest text-taupe uppercase animate-pulse">Loading Scoreboard...</p>
      </div>
    );
  }

  return (
    <div className="my-6 w-full bg-white/60 backdrop-blur-xl border border-clay/60 rounded-3xl shadow-glass-sm overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-clay/40 bg-white/40 flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-full bg-bronze/10 flex items-center justify-center">
          <Trophy size={16} className="text-bronze" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-ink tracking-tight">Scoreboard</h3>
          <p className="text-[10px] font-mono text-taupe uppercase tracking-widest">Live & Upcoming</p>
        </div>
      </div>

      <div className="p-6 space-y-8">
        {/* Summary */}
        {summaryHtml && (
          <div
            className="prose max-w-none text-[13px] leading-relaxed text-charcoal
                       prose-p:my-3 prose-h3:text-[11px] prose-h3:font-mono prose-h3:uppercase
                       prose-h3:tracking-widest prose-h3:text-taupe prose-h3:mt-6 prose-h3:mb-3
                       prose-h3:border-b prose-h3:border-clay/40 prose-h3:pb-2 prose-strong:font-semibold
                       prose-strong:text-ink"
            dangerouslySetInnerHTML={{ __html: summaryHtml }}
          />
        )}

        {/* Live Games — hero cards */}
        {liveGames.length > 0 && (
          <div className="space-y-4">
            <h4 className="text-[11px] font-mono text-taupe uppercase tracking-widest border-b border-clay/40 pb-2">
              In Progress
            </h4>
            <div className="grid grid-cols-1 gap-4">
              {liveGames.map((game, idx) => (
                <LiveGameCard
                  key={game.id || `live-${idx}`}
                  game={game}
                  onClick={onAction ? () => onAction(buildDrillQuery(game)) : undefined}
                />
              ))}
            </div>
          </div>
        )}

        {/* Final Games — compact rows */}
        {finalGames.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-[11px] font-mono text-taupe uppercase tracking-widest border-b border-clay/40 pb-2">
              Final
            </h4>
            {finalGames.map((game, idx) => (
              <CompactGameRow
                key={game.id || `final-${idx}`}
                game={game}
                onClick={onAction ? () => onAction(buildDrillQuery(game)) : undefined}
              />
            ))}
          </div>
        )}

        {/* Scheduled Games — compact rows */}
        {scheduledGames.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-[11px] font-mono text-taupe uppercase tracking-widest border-b border-clay/40 pb-2">
              Scheduled
            </h4>
            {scheduledGames.map((game, idx) => (
              <CompactGameRow
                key={game.id || `sched-${idx}`}
                game={game}
                onClick={onAction ? () => onAction(buildDrillQuery(game)) : undefined}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
