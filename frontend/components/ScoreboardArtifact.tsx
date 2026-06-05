// ============================================================================
// ScoreboardArtifact — Premium Live Sports Tracker
//
// Design: Apple Sports / visionOS aesthetic. Authentic materiality.
// Features: ESPN CDN Logo & Player integration, Zero-crash SWR streaming cache, 
//           Critically damped micro-spring physics, Tabular data alignment.
// ============================================================================

import React, { useMemo, useRef, useState, memo } from 'react';
import { Activity, ChevronRight, Tv, Trophy } from 'lucide-react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { motion } from 'framer-motion';

// ─── Interfaces & Physics ──────────────────────────────────────────────────

interface Team {
  name: string;
  abbr: string;
  logo?: string;
  score?: number | string;
  record?: string;
  odds?: string;
}

interface TopPerformer {
  name: string;
  playerId?: string;
  headshotUrl?: string;
  statLine: string;
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
  top_performers?: TopPerformer[];
  league?: string;
}

interface ScoreboardData {
  summary_markdown?: string;
  games?: Game[];
}

// Apple-esque Spring Physics
const SPRING_TRANSITION = { type: 'spring', bounce: 0, duration: 0.5, mass: 0.8, damping: 18 };

const LEAGUE_TEAM_MAP: Record<string, Record<string, string>> = {
  mlb: { 'yankees': 'nyy', 'mets': 'nym', 'red sox': 'bos', 'orioles': 'bal', 'blue jays': 'tor', 'rays': 'tb', 'guardians': 'cle', 'twins': 'min', 'white sox': 'chw', 'tigers': 'det', 'royals': 'kc', 'astros': 'hou', 'rangers': 'tex', 'mariners': 'sea', 'athletics': 'oak', 'angels': 'laa', 'dodgers': 'lad', 'padres': 'sd', 'giants': 'sf', 'diamondbacks': 'ari', 'rockies': 'col', 'braves': 'atl', 'phillies': 'phi', 'marlins': 'mia', 'nationals': 'wsh', 'cubs': 'chc', 'cardinals': 'stl', 'brewers': 'mil', 'reds': 'cin', 'pirates': 'pit' },
  nhl: { 'golden knights': 'vgs', 'hurricanes': 'car', 'panthers': 'fla', 'lightning': 'tb', 'maple leafs': 'tor', 'bruins': 'bos', 'oilers': 'edm', 'avalanche': 'col', 'stars': 'dal', 'jets': 'wpg', 'wild': 'min', 'predators': 'nsh', 'blues': 'stl', 'blackhawks': 'chi', 'red wings': 'det', 'penguins': 'pit', 'capitals': 'wsh', 'flyers': 'phi', 'islanders': 'nyi', 'devils': 'njd', 'senators': 'ott', 'canadiens': 'mtl', 'sabres': 'buf', 'kraken': 'sea', 'flames': 'cgy', 'canucks': 'van', 'sharks': 'sj', 'ducks': 'ana', 'kings': 'la', 'blue jackets': 'cbj', 'rangers': 'nyr' },
  nba: { 'lakers': 'lal', 'celtics': 'bos', 'warriors': 'gs', 'bucks': 'mil', 'nuggets': 'den', 'suns': 'phx', 'heat': 'mia', 'knicks': 'ny', 'cavaliers': 'cle', 'thunder': 'okc', 'timberwolves': 'min', 'mavericks': 'dal', 'pelicans': 'no', 'grizzlies': 'mem', 'rockets': 'hou', 'spurs': 'sa', 'clippers': 'lac', 'trail blazers': 'por', 'raptors': 'tor', '76ers': 'phi', 'pacers': 'ind', 'hawks': 'atl', 'bulls': 'chi', 'pistons': 'det', 'magic': 'orl', 'wizards': 'wsh', 'hornets': 'cha', 'nets': 'bkn', 'kings': 'sac' },
  nfl: { 'chiefs': 'kc', 'eagles': 'phi', 'bills': 'buf', 'ravens': 'bal', '49ers': 'sf', 'lions': 'det', 'cowboys': 'dal', 'dolphins': 'mia', 'steelers': 'pit', 'bengals': 'cin', 'packers': 'gb', 'chargers': 'lac', 'vikings': 'min', 'bears': 'chi', 'texans': 'hou', 'commanders': 'wsh', 'jaguars': 'jax', 'broncos': 'den', 'colts': 'ind', 'titans': 'ten', 'raiders': 'lv', 'saints': 'no', 'falcons': 'atl', 'seahawks': 'sea', 'buccaneers': 'tb', 'rams': 'lar', 'panthers': 'car', 'giants': 'nyg', 'jets': 'nyj' }
};

// ─── Utilities & Resolvers ─────────────────────────────────────────────────

const normalizeStatus = (raw?: string): 'live' | 'final' | 'scheduled' => {
  const s = (raw || '').toLowerCase();
  if (s.includes('final') || s.includes('closed') || s.includes('completed') || s === 'f') return 'final';
  if (s.match(/live|in.?progress|inning|top|bot|mid|end|half|quarter/)) return 'live';
  return 'scheduled';
};

/** Guesses the league for ESPN CDN routing if the payload omits it */
const guessLeague = (abbr: string): string => {
  const a = (abbr || '').toLowerCase();
  for (const [league, teams] of Object.entries(LEAGUE_TEAM_MAP)) {
    if (Object.values(teams).includes(a)) return league;
  }
  return 'nfl'; // fallback
};

/** ESPN CDN Logo Resolver (Intelligent Fallback Mapping) */
const resolveEspnLogoUrl = (teamName?: string, abbr?: string, explicitLogo?: string): string | undefined => {
  if (explicitLogo) return explicitLogo;
  if (!teamName && !abbr) return undefined;
  
  const lowerName = (teamName || '').toLowerCase();
  for (const [league, teams] of Object.entries(LEAGUE_TEAM_MAP)) {
    for (const [name, defaultAbbr] of Object.entries(teams)) {
      if (lowerName && new RegExp(`\\b${name}\\b`, 'i').test(lowerName)) {
        return `https://a.espncdn.com/i/teamlogos/${league}/500/scoreboard/${abbr?.toLowerCase() || defaultAbbr}.png`;
      }
    }
  }
  return undefined;
};

/** ESPN Player Headshot Resolver */
const resolveEspnHeadshotUrl = (playerId?: string, explicitUrl?: string, league: string = 'nfl'): string | undefined => {
  if (explicitUrl) return explicitUrl;
  if (!playerId) return undefined;
  return `https://a.espncdn.com/i/headshots/${league.toLowerCase()}/players/full/${playerId}.png`;
};

// ─── Sub-Components ────────────────────────────────────────────────────────

/** Isolated Logo component to prevent full-row re-renders on image error */
const TeamLogo = memo(({ abbr, name, logoUrl, size = 32 }: { abbr: string; name: string; logoUrl?: string; size?: number }) => {
  const [error, setError] = useState(false);
  const src = resolveEspnLogoUrl(name, abbr, logoUrl);

  if (!src || error || abbr === 'TBD') {
    return (
      <div 
        style={{ width: size, height: size }}
        className="rounded-full bg-gradient-to-br from-[#F5F5F7] to-[#E5E5EA] border border-black/[0.04] shadow-[inset_0_-1px_1px_rgba(0,0,0,0.04)] flex items-center justify-center shrink-0"
      >
        <span className="font-semibold text-[#1D1D1F]/60 tracking-tight" style={{ fontSize: size * 0.35 }}>
          {abbr?.slice(0, 3) || name?.slice(0, 2) || '?'}
        </span>
      </div>
    );
  }

  return (
    <div style={{ width: size, height: size }} className="relative shrink-0 flex items-center justify-center bg-white rounded-full shadow-[0_2px_8px_rgba(0,0,0,0.04)] border border-black/[0.04] p-1 overflow-hidden">
      <img
        src={src}
        alt={name}
        onError={() => setError(true)}
        className="max-w-full max-h-full object-contain"
        loading="lazy"
      />
    </div>
  );
});
TeamLogo.displayName = 'TeamLogo';

/** High-Resolution Player Avatar */
const PlayerHeadshot = memo(({ name, playerId, headshotUrl, league, size = 32 }: { name: string; playerId?: string; headshotUrl?: string; league?: string; size?: number }) => {
  const [error, setError] = useState(false);
  const src = resolveEspnHeadshotUrl(playerId, headshotUrl, league);

  if (!src || error) {
    return (
      <div style={{ width: size, height: size }} className="rounded-full bg-black/5 border border-black/[0.04] flex items-center justify-center shrink-0">
        <span className="font-semibold text-black/40 tracking-tight" style={{ fontSize: size * 0.35 }}>
          {name.charAt(0)}
        </span>
      </div>
    );
  }

  return (
    <div style={{ width: size, height: size }} className="rounded-full bg-[#F5F5F7] border border-black/[0.04] overflow-hidden shrink-0 flex items-end justify-center">
      <img src={src} alt={name} onError={() => setError(true)} className="w-[90%] h-[90%] object-cover object-bottom drop-shadow-sm" loading="lazy" />
    </div>
  );
});
PlayerHeadshot.displayName = 'PlayerHeadshot';

/** 
 * Apple Sports style stacked row layout. 
 * Used for both Live Cards and Compact Rows to maintain strict visual consistency.
 */
const GameDisplay = memo(({ game, isHero, onClick }: { game: Game; isHero?: boolean; onClick?: () => void }) => {
  const status = normalizeStatus(game.status);
  const isScheduled = status === 'scheduled';
  const awayScore = game.away_team?.score;
  const homeScore = game.home_team?.score;
  const awayWins = !isScheduled && awayScore !== undefined && Number(awayScore) > Number(homeScore ?? 0);
  const homeWins = !isScheduled && homeScore !== undefined && Number(homeScore) > Number(awayScore ?? 0);

  const isClickable = !!onClick;

  return (
    <motion.div
      whileHover={isClickable ? { scale: 0.99, backgroundColor: isHero ? "rgba(255,255,255,1)" : "rgba(0,0,0,0.02)" } : {}}
      whileTap={isClickable ? { scale: 0.97 } : {}}
      onClick={onClick}
      className={`relative flex flex-col w-full transition-all duration-300 ${isClickable ? 'cursor-pointer' : 'cursor-default'} ${
        isHero 
          ? 'bg-white/80 backdrop-blur-xl border border-black/[0.04] rounded-[24px] p-5 shadow-[0_8px_30px_rgba(0,0,0,0.04)]' 
          : 'bg-transparent py-4 border-b border-black/[0.04] last:border-0'
      }`}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
    >
      {/* Meta Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {status === 'live' ? (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-[6px] bg-black/[0.04] border border-black/[0.06]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#1D1D1F]/50 animate-pulse" />
              <span className="text-[10px] font-bold tracking-[0.1em] text-[#1D1D1F]/70 uppercase">
                {game.period || 'Live'}
              </span>
            </div>
          ) : (
            <span className="text-[11px] font-semibold tracking-wide text-black/40 uppercase">
              {status === 'final' ? 'Final' : game.period || game.date}
            </span>
          )}
        </div>
        
        {game.broadcast && (
          <div className="flex items-center gap-1.5 text-[10px] font-semibold tracking-widest text-black/30 uppercase">
            <Tv size={11} strokeWidth={2.5} />
            {game.broadcast}
          </div>
        )}
      </div>

      {/* Away Team Row */}
      <div className="flex items-center justify-between w-full mb-3.5">
        <div className="flex items-center gap-3.5 min-w-0">
          <TeamLogo abbr={game.away_team?.abbr} name={game.away_team?.name} logoUrl={game.away_team?.logo} size={isHero ? 38 : 32} />
          <div className="flex flex-col">
            <span className={`text-[17px] tracking-tight truncate ${awayWins ? 'font-bold text-[#1D1D1F]' : 'font-medium text-[#1D1D1F]/80'}`}>
              {game.away_team?.name || game.away_team?.abbr || 'TBD'}
            </span>
            {isScheduled && game.away_team?.record && (
              <span className="text-[11px] font-medium text-black/40 tracking-wide mt-0.5">
                {game.away_team.record}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0 pl-4">
          <span className={`font-mono tabular-nums tracking-tighter ${isHero ? 'text-[26px]' : 'text-[20px]'} ${awayWins ? 'font-bold text-[#1D1D1F]' : 'font-medium text-[#1D1D1F]/80'}`}>
            {isScheduled ? (game.away_team?.odds || '—') : (awayScore ?? '—')}
          </span>
        </div>
      </div>

      {/* Home Team Row */}
      <div className="flex items-center justify-between w-full">
        <div className="flex items-center gap-3.5 min-w-0">
          <TeamLogo abbr={game.home_team?.abbr} name={game.home_team?.name} logoUrl={game.home_team?.logo} size={isHero ? 38 : 32} />
          <div className="flex flex-col">
            <span className={`text-[17px] tracking-tight truncate ${homeWins ? 'font-bold text-[#1D1D1F]' : 'font-medium text-[#1D1D1F]/80'}`}>
              {game.home_team?.name || game.home_team?.abbr || 'TBD'}
            </span>
            {isScheduled && game.home_team?.record && (
              <span className="text-[11px] font-medium text-black/40 tracking-wide mt-0.5">
                {game.home_team.record}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0 pl-4">
          <span className={`font-mono tabular-nums tracking-tighter ${isHero ? 'text-[26px]' : 'text-[20px]'} ${homeWins ? 'font-bold text-[#1D1D1F]' : 'font-medium text-[#1D1D1F]/80'}`}>
            {isScheduled ? (game.home_team?.odds || '—') : (homeScore ?? '—')}
          </span>
        </div>
      </div>

      {/* Footer Notes (Series / Odds) */}
      {(game.note || (isHero && (game.away_team?.odds || game.home_team?.odds))) && (
        <div className="mt-4 pt-3 border-t border-black/[0.04] flex items-start justify-between gap-4">
          <p className="text-[12px] font-medium text-[#1D1D1F]/60 leading-snug">
            {game.note}
          </p>
          {isHero && !isScheduled && (game.away_team?.odds || game.home_team?.odds) && (
            <div className="flex items-center gap-1.5 text-[10px] font-mono tracking-wide text-black/40 shrink-0 mt-0.5">
              <span className="font-bold text-[#1D1D1F]/50">ODDS</span>
              <span>{game.away_team?.abbr} {game.away_team?.odds || '—'}</span>
            </div>
          )}
        </div>
      )}

      {/* Optional: Render Top Performers if Backend Provides Them */}
      {isHero && game.top_performers && game.top_performers.length > 0 && (
        <div className="mt-4 pt-4 border-t border-black/[0.04] flex items-center gap-4 overflow-x-auto no-scrollbar mask-fade-right">
          {game.top_performers.map((p, i) => (
            <div key={i} className="flex items-center gap-2.5 shrink-0 pr-2">
              <PlayerHeadshot name={p.name} playerId={p.playerId} headshotUrl={p.headshotUrl} league={game.league || guessLeague(game.away_team?.abbr)} size={32} />
              <div className="flex flex-col">
                <span className="text-[11px] font-semibold text-[#1D1D1F] tracking-tight">{p.name}</span>
                <span className="text-[10px] font-medium text-black/40 tracking-wide">{p.statLine}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Hover Indicator */}
      {isClickable && (
        <div className="absolute top-1/2 right-4 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity hidden sm:block">
          <ChevronRight size={20} className="text-black/20" strokeWidth={2} />
        </div>
      )}
    </motion.div>
  );
});
GameDisplay.displayName = 'GameDisplay';

// ─── Main Component ────────────────────────────────────────────────────────

export const ScoreboardArtifact: React.FC<{ dataString: string; onAction?: (query: string) => void }> = ({ dataString, onAction }) => {

  const buildDrillQuery = (game: Game): string => {
    const away = game.away_team?.name || game.away_team?.abbr || 'Away';
    const home = game.home_team?.name || game.home_team?.abbr || 'Home';
    let q = `Give me a full matchup breakdown for ${away} at ${home}. Include recent form, key injuries, starting lineups if available, and betting analysis.`;
    if (game.away_team?.odds || game.home_team?.odds) {
      q += `\nOdds: ${away} ${game.away_team?.odds || '—'} / ${home} ${game.home_team?.odds || '—'}`;
    }
    return q;
  };

  // 1. SWR CACHE: Prevents UI flickering and console spam during LLM streams
  const lastValidData = useRef<ScoreboardData | null>(null);

  const data = useMemo(() => {
    if (!dataString) return lastValidData.current;

    try {
      // 2. BULLETPROOF AST PARSER
      let cleanString = dataString
        .replace(/^```[a-zA-Z]*\n?/i, '')
        .replace(/\n?```$/i, '')
        .trim();

      // Heal LLM hallucinated trailing commas before parsing
      cleanString = cleanString.replace(/,\s*([\]}])/g, '$1');

      const raw = JSON.parse(cleanString);

      const normalizeTeam = (t: any, oddsObj?: any, isHome?: boolean): Team | undefined => {
        if (!t) return undefined;
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
          logo: t.logo || t.logoUrl, 
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
          league: ev.league || raw.league,
          top_performers: ev.top_performers,
          away_team: normalizeTeam(ev.away_team, oddsObj, false) || { name: 'TBD', abbr: 'TBD' },
          home_team: normalizeTeam(ev.home_team, oddsObj, true) || { name: 'TBD', abbr: 'TBD' },
        };
      };

      const rawGames = raw.games || raw.events;
      const games: Game[] = rawGames ? rawGames.map((ev: any) => normalizeGame(ev)) : [];

      const parsedData = { summary_markdown: raw.summary_markdown, games };
      lastValidData.current = parsedData;
      return parsedData;

    } catch (e) {
      // 3. SILENT FALLBACK: Avoids syntax errors during generation stream
      return lastValidData.current;
    }
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
      <div className="my-8 p-6 bg-black/[0.02] border border-black/[0.04] rounded-[24px] flex items-center justify-center gap-3 w-full max-w-sm mx-auto">
        <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}>
          <Activity size={18} className="text-black/30" />
        </motion.div>
        <span className="text-[13.5px] font-medium tracking-tight text-black/40">Syncing live scores...</span>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 16 }} 
      animate={{ opacity: 1, y: 0 }} 
      transition={SPRING_TRANSITION}
      className="my-8 w-full bg-white/70 backdrop-blur-3xl rounded-[32px] shadow-[0_24px_60px_rgba(0,0,0,0.06),0_0_1px_rgba(0,0,0,0.1)] border border-black/[0.04] overflow-hidden isolate font-sans selection:bg-[#007AFF]/15"
    >
      {/* Header */}
      <div className="px-8 py-6 bg-white/40 flex items-center justify-between border-b border-black/[0.03]">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-white shadow-[0_2px_10px_rgba(0,0,0,0.04)] border border-black/[0.02] flex items-center justify-center">
            {liveGames.length > 0 ? (
              <Activity size={18} className="text-[#1D1D1F]" strokeWidth={2} />
            ) : (
              <Trophy size={18} className="text-[#1D1D1F]" strokeWidth={1.5} />
            )}
          </div>
          <div>
            <h3 className="text-[15px] font-semibold text-[#1D1D1F] tracking-tight leading-none mb-1.5">Scoreboard</h3>
            <p className="text-[10px] font-semibold text-black/40 uppercase tracking-[0.18em] leading-none">
              {liveGames.length > 0 ? 'Live & In Progress' : 'Schedule & Results'}
            </p>
          </div>
        </div>
      </div>

      <div className="p-8 space-y-10">
        
        {/* Editorial Summary */}
        {summaryHtml && (
          <div
            className="prose max-w-none text-[15px] leading-[1.65] tracking-[-0.01em] text-[#1D1D1F]/80 antialiased
                       prose-p:my-3 prose-strong:font-semibold prose-strong:text-[#1D1D1F]
                       prose-h3:text-[11px] prose-h3:font-mono prose-h3:uppercase prose-h3:tracking-[0.15em] prose-h3:text-black/40 prose-h3:mt-8 prose-h3:mb-4
                       prose-ul:list-none prose-ul:pl-0 prose-ul:space-y-2.5
                       prose-li:relative prose-li:pl-5
                       prose-li:before:absolute prose-li:before:left-0 prose-li:before:top-[10px] prose-li:before:w-1.5 prose-li:before:h-1.5 prose-li:before:bg-black/20 prose-li:before:rounded-full"
            dangerouslySetInnerHTML={{ __html: summaryHtml }}
          />
        )}

        {/* Games Stack */}
        
        {liveGames.length > 0 && (
          <div className="space-y-4">
            <h4 className="text-[11px] font-bold text-black/30 uppercase tracking-[0.18em] px-1">In Progress</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {liveGames.map((game, idx) => (
                <GameDisplay
                  key={game.id || `live-${idx}`}
                  game={game}
                  isHero={true}
                  onClick={onAction ? () => onAction(buildDrillQuery(game)) : undefined}
                />
              ))}
            </div>
          </div>
        )}

        {scheduledGames.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-[11px] font-bold text-black/30 uppercase tracking-[0.18em] border-b border-black/[0.04] pb-3 px-1 mb-3">
              Upcoming
            </h4>
            <div className="px-4 bg-[#F9F9F9]/50 rounded-[24px]">
              {scheduledGames.map((game, idx) => (
                <GameDisplay
                  key={game.id || `sched-${idx}`}
                  game={game}
                  isHero={false}
                  onClick={onAction ? () => onAction(buildDrillQuery(game)) : undefined}
                />
              ))}
            </div>
          </div>
        )}

        {finalGames.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-[11px] font-bold text-black/30 uppercase tracking-[0.18em] border-b border-black/[0.04] pb-3 px-1 mb-3">
              Final
            </h4>
            <div className="px-4 bg-[#F9F9F9]/50 rounded-[24px]">
              {finalGames.map((game, idx) => (
                <GameDisplay
                  key={game.id || `final-${idx}`}
                  game={game}
                  isHero={false}
                  onClick={onAction ? () => onAction(buildDrillQuery(game)) : undefined}
                />
              ))}
            </div>
          </div>
        )}

      </div>
    </motion.div>
  );
};
