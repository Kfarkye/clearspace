// ============================================================================
// ScoreboardArtifact — Premium Living Sports Tracker
//
// Features: Autonomous ESPN Edge Polling, MLB.TV Deep Linking, Conversational
//           Action Chips, Kinetic Score Physics, visionOS Material Design.
// ============================================================================

import React, { useMemo, useRef, useState, useEffect, memo } from 'react';
import { Activity, Tv, Trophy, TrendingUp, User, LineChart, PlayCircle, Zap } from 'lucide-react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { motion, AnimatePresence } from 'framer-motion';
import { LiveRiskActionDock } from './LiveRiskActionDock';

// ─── Interfaces & Config ──────────────────────────────────────────────────

interface Team { name: string; abbr: string; logo?: string; score?: number | string; record?: string; odds?: string; id?: string; }
interface LiveSituation {
  downDistance?: string; possession?: string; isRedZone?: boolean;
  outs?: number; onFirst?: boolean; onSecond?: boolean; onThird?: boolean;
  lastPlay?: string; balls?: number; strikes?: number;
}
interface TopPerformer { name: string; headshotUrl?: string; statLine: string; }
interface Game {
  id: string; status: string; period?: string; date?: string; broadcast?: string; note?: string;
  away_team: Team; home_team: Team; league?: string;
  situation?: LiveSituation;
  leaders?: TopPerformer[];
}

interface ScoreboardData { summary_markdown?: string; games: Game[]; league?: string; }

// Apple-esque Spring Physics
const SPRING_TRANSITION = { type: 'spring', bounce: 0, duration: 0.5, mass: 0.8, damping: 18 };

const ESPN_SPORT_MAP: Record<string, string> = {
  mlb: 'baseball/mlb', nba: 'basketball/nba', nfl: 'football/nfl',
  nhl: 'hockey/nhl', wnba: 'basketball/wnba',
  cfb: 'football/college-football', ncaaf: 'football/college-football',
  cbb: 'basketball/mens-college-basketball', ncaam: 'basketball/mens-college-basketball'
};

const LEAGUE_TEAM_MAP: Record<string, Record<string, string>> = {
  mlb: { 'yankees': 'nyy', 'mets': 'nym', 'red sox': 'bos', 'orioles': 'bal', 'blue jays': 'tor', 'rays': 'tb', 'guardians': 'cle', 'twins': 'min', 'white sox': 'chw', 'tigers': 'det', 'royals': 'kc', 'astros': 'hou', 'rangers': 'tex', 'mariners': 'sea', 'athletics': 'oak', 'angels': 'laa', 'dodgers': 'lad', 'padres': 'sd', 'giants': 'sf', 'diamondbacks': 'ari', 'rockies': 'col', 'braves': 'atl', 'phillies': 'phi', 'marlins': 'mia', 'nationals': 'wsh', 'cubs': 'chc', 'cardinals': 'stl', 'brewers': 'mil', 'reds': 'cin', 'pirates': 'pit' },
  nhl: { 'golden knights': 'vgs', 'hurricanes': 'car', 'panthers': 'fla', 'lightning': 'tb', 'maple leafs': 'tor', 'bruins': 'bos', 'oilers': 'edm', 'avalanche': 'col', 'stars': 'dal', 'jets': 'wpg', 'wild': 'min', 'predators': 'nsh', 'blues': 'stl', 'blackhawks': 'chi', 'red wings': 'det', 'penguins': 'pit', 'capitals': 'wsh', 'flyers': 'phi', 'islanders': 'nyi', 'devils': 'njd', 'senators': 'ott', 'canadiens': 'mtl', 'sabres': 'buf', 'kraken': 'sea', 'flames': 'cgy', 'canucks': 'van', 'sharks': 'sj', 'ducks': 'ana', 'kings': 'la', 'blue jackets': 'cbj', 'rangers': 'nyr' },
  nba: { 'lakers': 'lal', 'celtics': 'bos', 'warriors': 'gs', 'bucks': 'mil', 'nuggets': 'den', 'suns': 'phx', 'heat': 'mia', 'knicks': 'ny', 'cavaliers': 'cle', 'thunder': 'okc', 'timberwolves': 'min', 'mavericks': 'dal', 'pelicans': 'no', 'grizzlies': 'mem', 'rockets': 'hou', 'spurs': 'sa', 'clippers': 'lac', 'trail blazers': 'por', 'raptors': 'tor', '76ers': 'phi', 'pacers': 'ind', 'hawks': 'atl', 'bulls': 'chi', 'pistons': 'det', 'magic': 'orl', 'wizards': 'wsh', 'hornets': 'cha', 'nets': 'bkn', 'kings': 'sac' },
  nfl: { 'chiefs': 'kc', 'eagles': 'phi', 'bills': 'buf', 'ravens': 'bal', '49ers': 'sf', 'lions': 'det', 'cowboys': 'dal', 'dolphins': 'mia', 'steelers': 'pit', 'bengals': 'cin', 'packers': 'gb', 'chargers': 'lac', 'vikings': 'min', 'bears': 'chi', 'texans': 'hou', 'commanders': 'wsh', 'jaguars': 'jax', 'broncos': 'den', 'colts': 'ind', 'titans': 'ten', 'raiders': 'lv', 'saints': 'no', 'falcons': 'atl', 'seahawks': 'sea', 'buccaneers': 'tb', 'rams': 'lar', 'panthers': 'car', 'giants': 'nyg', 'jets': 'nyj' }
};

// ─── Telemetry & Deep Links ────────────────────────────────────────────────

const normalizeStatus = (raw?: string): 'live' | 'final' | 'scheduled' => {
  const s = (raw || '').toLowerCase();
  if (s.includes('final') || s.includes('closed') || s.includes('completed') || s === 'f') return 'final';
  if (s.match(/live|in.?progress|inning|top|bot|mid|end|half|quarter/)) return 'live';
  return 'scheduled';
};

/** Resolves deep links to streaming apps based on the broadcast network */
const resolveWatchLink = (league?: string, broadcast?: string): { label: string; url: string; style: string } | null => {
  const b = (broadcast || '').toUpperCase();
  const l = (league || '').toLowerCase();

  if (l === 'mlb' || b.includes('MLB.TV')) return { label: 'MLB.TV', url: 'https://www.mlb.com/tv', style: 'text-[#007AFF] bg-[#007AFF]/10 hover:bg-[#007AFF]/20' };
  if (b.includes('APPLE') || b.includes('ATV')) return { label: 'Apple TV+', url: 'https://tv.apple.com', style: 'text-[#1D1D1F] bg-black/5 hover:bg-black/10' };
  if (b.includes('ESPN') || b.includes('ABC')) return { label: 'WatchESPN', url: 'https://www.espn.com/watch/', style: 'text-[#1D1D1F] bg-black/5 hover:bg-black/10' };
  if (b.includes('PEACOCK')) return { label: 'Peacock', url: 'https://www.peacocktv.com', style: 'text-[#1D1D1F] bg-black/5 hover:bg-black/10' };
  if (b.includes('PRIME') || b.includes('AMAZON')) return { label: 'Prime Video', url: 'https://www.amazon.com/primevideo', style: 'text-[#1D1D1F] bg-black/5 hover:bg-black/10' };

  return null;
};

/** ESPN CDN Logo Resolver — uses league + abbr for direct path, falls back to name lookup */
const resolveEspnLogoUrl = (league?: string, abbr?: string, teamName?: string, explicitUrl?: string): string | undefined => {
  if (explicitUrl) return explicitUrl;

  // Direct path if we have league + abbr
  if (league && abbr) {
    const l = league.toLowerCase();
    const sportPath = l === 'cfb' || l === 'ncaaf' ? 'college-football' : l === 'cbb' || l === 'ncaam' ? 'mens-college-basketball' : l;
    return `https://a.espncdn.com/i/teamlogos/${sportPath}/500/scoreboard/${abbr.toLowerCase()}.png`;
  }

  // Fallback: resolve via team name lookup
  if (!teamName && !abbr) return undefined;
  const lowerName = (teamName || '').toLowerCase();
  for (const [lg, teams] of Object.entries(LEAGUE_TEAM_MAP)) {
    for (const [name, defaultAbbr] of Object.entries(teams)) {
      if (lowerName && new RegExp(`\\b${name}\\b`, 'i').test(lowerName)) {
        return `https://a.espncdn.com/i/teamlogos/${lg}/500/scoreboard/${abbr?.toLowerCase() || defaultAbbr}.png`;
      }
    }
  }
  return undefined;
};

// ─── Sub-Components ────────────────────────────────────────────────────────

const TeamLogo = memo(({ abbr, name, logoUrl, league, size = 32 }: { abbr?: string; name?: string; logoUrl?: string; league?: string; size?: number }) => {
  const [error, setError] = useState(false);
  const src = resolveEspnLogoUrl(league, abbr, name, logoUrl);

  // P1 FIX: Clear stale error when the resolved URL changes (streaming data)
  useEffect(() => { setError(false); }, [src]);

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
      <img src={src} alt={name || abbr} onError={() => setError(true)} className="max-w-full max-h-full object-contain" loading="lazy" />
    </div>
  );
});
TeamLogo.displayName = 'TeamLogo';

/** Kinetic Flip-Clock Animation for Scores */
const AnimatedScore = ({ score }: { score?: string | number }) => (
  <div className="relative inline-flex justify-end overflow-hidden" style={{ minWidth: '1.2em', height: '1.2em' }}>
    <AnimatePresence mode="popLayout">
      <motion.span
        key={String(score)}
        initial={{ y: -15, opacity: 0, filter: "blur(4px)" }}
        animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
        exit={{ y: 15, opacity: 0, filter: "blur(4px)" }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="inline-block"
      >
        {score ?? '—'}
      </motion.span>
    </AnimatePresence>
  </div>
);

/** LiveSituationDisplay — MLB diamond, NFL down & distance, generic last play */
const LiveSituationDisplay = memo(({ situation, league }: { situation: LiveSituation; league?: string }) => {
  const l = (league || '').toLowerCase();

  if (l === 'mlb') {
    return (
      <div className="flex items-center gap-4 py-3 px-4 bg-black/[0.02] rounded-[16px] border border-black/[0.03]">
        <div className="relative w-8 h-8 rotate-45 shrink-0">
          <div className={`absolute top-0 right-0 w-3.5 h-3.5 rounded-sm border-2 ${situation.onFirst ? 'bg-[#007AFF] border-[#007AFF]' : 'border-black/20 bg-white'}`} />
          <div className={`absolute top-0 left-0 w-3.5 h-3.5 rounded-sm border-2 ${situation.onSecond ? 'bg-[#007AFF] border-[#007AFF]' : 'border-black/20 bg-white'}`} />
          <div className={`absolute bottom-0 left-0 w-3.5 h-3.5 rounded-sm border-2 ${situation.onThird ? 'bg-[#007AFF] border-[#007AFF]' : 'border-black/20 bg-white'}`} />
          <div className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-sm border-2 border-black/20 bg-white" />
        </div>
        <div className="flex flex-col gap-0.5 border-l border-black/[0.06] pl-4">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold tracking-widest text-black/40 uppercase">Outs</span>
            <div className="flex gap-1">
              {[1, 2, 3].map(i => (
                <span key={i} className={`w-2 h-2 rounded-full ${i <= (situation.outs || 0) ? 'bg-[#1D1D1F]' : 'bg-black/10'}`} />
              ))}
            </div>
          </div>
          {situation.lastPlay && (
            <span className="text-[11.5px] font-medium text-[#1D1D1F]/80 leading-snug line-clamp-2 mt-1">{situation.lastPlay}</span>
          )}
        </div>
      </div>
    );
  }

  if (l === 'nfl' || l === 'ncaaf' || l === 'cfb') {
    return (
      <div className="flex items-center gap-3 py-2.5 px-4 bg-black/[0.02] rounded-[16px] border border-black/[0.03]">
        <div className={`w-1 h-8 rounded-full ${situation.isRedZone ? 'bg-[#FF9500]' : 'bg-[#007AFF]'}`} />
        <div className="flex flex-col min-w-0">
          <span className="text-[13px] font-bold text-[#1D1D1F] tracking-tight truncate">{situation.downDistance || '1st & 10'}</span>
          {situation.lastPlay && <span className="text-[11px] font-medium text-black/50 truncate">{situation.lastPlay}</span>}
        </div>
      </div>
    );
  }

  if (situation.lastPlay) {
    return (
      <div className="flex items-start gap-2.5 py-3 px-4 bg-black/[0.02] rounded-[16px] border border-black/[0.03]">
        <Zap size={14} className="text-[#007AFF] shrink-0 mt-0.5" />
        <span className="text-[12px] font-medium text-[#1D1D1F]/80 leading-snug">{situation.lastPlay}</span>
      </div>
    );
  }

  return null;
});
LiveSituationDisplay.displayName = 'LiveSituationDisplay';

/** Action Pill for Contextual Drill-Downs */
const ActionPill = ({ icon: Icon, label, onClick }: { icon: any; label: string; onClick: () => void }) => (
  <motion.button
    whileHover={{ backgroundColor: "rgba(0,0,0,0.04)" }}
    whileTap={{ scale: 0.95 }}
    onClick={onClick}
    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white border border-black/[0.06] shadow-[0_2px_8px_rgba(0,0,0,0.02)] shrink-0 transition-colors"
  >
    <Icon size={12} className="text-[#1D1D1F]/60" strokeWidth={2.5} />
    <span className="text-[11.5px] font-semibold tracking-tight text-[#1D1D1F]/80">{label}</span>
  </motion.button>
);

/** Apple Sports stacked game row — Hero (live) or Compact (scheduled/final) */
const GameDisplay = memo(({ game, isHero, onAction }: { game: Game; isHero?: boolean; onAction?: (q: string) => void }) => {
  const status = normalizeStatus(game.status);
  const isScheduled = status === 'scheduled';
  const awayWins = !isScheduled && Number(game.away_team?.score) > Number(game.home_team?.score ?? 0);
  const homeWins = !isScheduled && Number(game.home_team?.score) > Number(game.away_team?.score ?? 0);
  const awayHasBall = status === 'live' && game.situation?.possession === game.away_team?.id;
  const homeHasBall = status === 'live' && game.situation?.possession === game.home_team?.id;
  const watchLink = resolveWatchLink(game.league, game.broadcast);
  const matchupName = `${game.away_team?.name || game.away_team?.abbr} vs ${game.home_team?.name || game.home_team?.abbr}`;

  return (
    <motion.div
      layout="position"
      transition={SPRING_TRANSITION}
      className={`relative flex flex-col w-full transition-all duration-300 ${isHero
        ? 'bg-white/80 backdrop-blur-xl border border-black/[0.06] rounded-[24px] p-5 shadow-[0_8px_30px_rgba(0,0,0,0.04)]'
        : 'bg-transparent py-4 border-b border-black/[0.04] last:border-0'
      }`}
    >
      {/* Meta Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {status === 'live' ? (
            <div className="flex items-center px-2.5 py-0.5 rounded-[6px] bg-black/[0.04] border border-black/[0.06]">
              <span className="text-[10px] font-bold tracking-[0.1em] text-[#1D1D1F]/70 uppercase">{game.period || 'Live'}</span>
            </div>
          ) : (
            <span className="text-[11px] font-semibold tracking-wide text-black/40 uppercase">
              {status === 'final' ? 'Final' : game.period || game.date}
            </span>
          )}
        </div>

        {/* Watch Live Deep-Link or Broadcast Label */}
        {watchLink && status !== 'final' ? (
          <a href={watchLink.url} target="_blank" rel="noopener noreferrer" className={`flex items-center gap-1.5 px-2.5 py-1 transition-colors rounded-full ${watchLink.style}`}>
            <PlayCircle size={12} strokeWidth={2.5} />
            <span className="text-[10px] font-bold tracking-widest uppercase">{watchLink.label}</span>
          </a>
        ) : game.broadcast ? (
          <div className="flex items-center gap-1.5 text-[10px] font-semibold tracking-widest text-black/30 uppercase">
            <Tv size={11} strokeWidth={2.5} /> {game.broadcast}
          </div>
        ) : null}
      </div>

      {/* Away Team Row */}
      <div className="flex items-center justify-between w-full mb-3.5">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="relative">
            <TeamLogo abbr={game.away_team?.abbr} name={game.away_team?.name} logoUrl={game.away_team?.logo} league={game.league} size={isHero ? 38 : 32} />
            {awayHasBall && <span className="absolute -bottom-1 -right-1 w-3 h-3 bg-[#FF9500] border-2 border-white rounded-full shadow-sm" />}
          </div>
          <div className="flex flex-col">
            <span className={`text-[17px] tracking-tight truncate ${awayWins ? 'font-bold text-[#1D1D1F]' : 'font-semibold text-[#1D1D1F]/80'}`}>
              {game.away_team?.name || game.away_team?.abbr || 'TBD'}
            </span>
            {isScheduled && game.away_team?.record && (
              <span className="text-[11px] font-medium text-black/40 tracking-wide mt-0.5">{game.away_team.record}</span>
            )}
          </div>
        </div>
        <span className={`font-mono tabular-nums tracking-tighter flex items-center justify-end ${isHero ? 'text-[26px]' : 'text-[20px]'} ${awayWins ? 'font-bold text-[#1D1D1F]' : 'font-medium text-[#1D1D1F]/80'}`}>
          {isScheduled ? (game.away_team?.odds || '—') : <AnimatedScore score={game.away_team?.score} />}
        </span>
      </div>

      {/* Home Team Row */}
      <div className="flex items-center justify-between w-full">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="relative">
            <TeamLogo abbr={game.home_team?.abbr} name={game.home_team?.name} logoUrl={game.home_team?.logo} league={game.league} size={isHero ? 38 : 32} />
            {homeHasBall && <span className="absolute -bottom-1 -right-1 w-3 h-3 bg-[#FF9500] border-2 border-white rounded-full shadow-sm" />}
          </div>
          <div className="flex flex-col">
            <span className={`text-[17px] tracking-tight truncate ${homeWins ? 'font-bold text-[#1D1D1F]' : 'font-semibold text-[#1D1D1F]/80'}`}>
              {game.home_team?.name || game.home_team?.abbr || 'TBD'}
            </span>
            {isScheduled && game.home_team?.record && (
              <span className="text-[11px] font-medium text-black/40 tracking-wide mt-0.5">{game.home_team.record}</span>
            )}
          </div>
        </div>
        <span className={`font-mono tabular-nums tracking-tighter flex items-center justify-end ${isHero ? 'text-[26px]' : 'text-[20px]'} ${homeWins ? 'font-bold text-[#1D1D1F]' : 'font-medium text-[#1D1D1F]/80'}`}>
          {isScheduled ? (game.home_team?.odds || '—') : <AnimatedScore score={game.home_team?.score} />}
        </span>
      </div>

      {/* Footer Notes */}
      {game.note && (
        <div className="mt-4 pt-3 border-t border-black/[0.04]">
          <p className="text-[12px] font-medium text-[#1D1D1F]/60 leading-snug">{game.note}</p>
        </div>
      )}

      {/* Live Situation (MLB diamond / NFL down & distance) */}
      {isHero && game.situation && status === 'live' && (
        <div className="mt-5 border-t border-black/[0.04] pt-4">
          <LiveSituationDisplay situation={game.situation} league={game.league} />
        </div>
      )}

      {/* Top Performers */}
      {isHero && game.leaders && game.leaders.length > 0 && (
        <div className="mt-4 flex items-center gap-4 overflow-x-auto no-scrollbar mask-fade-right">
          {game.leaders.map((p, i) => (
            <div key={i} className="flex items-center gap-2.5 shrink-0 pr-2">
              <div className="w-8 h-8 rounded-full bg-[#F5F5F7] border border-black/[0.04] overflow-hidden flex items-end justify-center shrink-0">
                {p.headshotUrl ? <img src={p.headshotUrl} alt={p.name} className="w-[90%] h-[90%] object-cover object-bottom" loading="lazy" /> : <User size={16} className="text-black/20 mb-1" />}
              </div>
              <div className="flex flex-col">
                <span className="text-[11.5px] font-semibold text-[#1D1D1F] tracking-tight">{p.name}</span>
                <span className="text-[10.5px] font-medium text-black/50 tracking-wide">{p.statLine}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Action Dock — live games get position evaluator, others get standard pills */}
      {isHero && onAction && (
        status === 'live' ? (
          <LiveRiskActionDock game={game} matchupName={matchupName} onAction={onAction} />
        ) : (
          <div className="mt-5 pt-4 border-t border-black/[0.04] flex gap-2 overflow-x-auto no-scrollbar mask-fade-right pb-1">
            <ActionPill icon={LineChart} label="Matchup Analysis" onClick={() => onAction(`Analyze the matchup between ${matchupName}.`)} />
            <ActionPill icon={TrendingUp} label="Live Betting Angles" onClick={() => onAction(`Get live betting trends, odds, and angles for the ${matchupName} game.`)} />
            <ActionPill icon={User} label="Player Props" onClick={() => onAction(`Find the best player props for ${matchupName}.`)} />
          </div>
        )
      )}
    </motion.div>
  );
});
GameDisplay.displayName = 'GameDisplay';

// ─── Main Component & Polling Engine ───────────────────────────────────────

export const ScoreboardArtifact: React.FC<{ dataString: string; onAction?: (query: string) => void }> = ({ dataString, onAction }) => {

  const lastValidData = useRef<ScoreboardData | null>(null);

  // Live telemetry overrides from ESPN Edge
  const [liveOverrides, setLiveOverrides] = useState<Record<string, Partial<Game>>>({});

  // 1. Parse initial LLM Payload (SWR Protected)
  const initialData = useMemo(() => {
    if (!dataString) return lastValidData.current;
    try {
      let clean = dataString.replace(/^```[a-zA-Z]*\n?/i, '').replace(/\n?```$/i, '').trim().replace(/,\s*([\]}])/g, '$1');
      const raw = JSON.parse(clean);

      const normalizeTeam = (t: any, oddsObj?: any, isHome?: boolean): Team => {
        if (!t) return { name: 'TBD', abbr: 'TBD' };
        let teamOdds = t.odds;
        if (!teamOdds && oddsObj) {
          if (isHome && oddsObj.spread) teamOdds = oddsObj.spread;
          else if (!isHome && oddsObj.overUnder) teamOdds = `O/U ${oddsObj.overUnder}`;
        }
        return {
          name: t.name || t.abbr || 'TBD',
          abbr: t.abbreviation || t.abbr || '',
          score: t.score,
          record: t.record,
          logo: t.logo || t.logoUrl,
          odds: typeof teamOdds === 'string' ? teamOdds : teamOdds != null ? String(teamOdds) : undefined,
        };
      };

      const games: Game[] = (raw.games || raw.events || []).map((ev: any, idx: number) => {
        const oddsObj = ev.odds && typeof ev.odds === 'object' ? ev.odds : undefined;
        return {
          id: String(ev.game_id || ev.id || `game-${idx}`),
          status: normalizeStatus((ev.status || '').replace(/^STATUS_/i, '').toLowerCase()),
          period: ev.period || ev.short_status,
          date: ev.short_status || ev.date,
          broadcast: ev.broadcast,
          note: ev.series_summary || ev.game_notes || ev.note || '',
          league: ev.league || raw.league || 'mlb',
          situation: ev.situation || ev.live_situation,
          away_team: normalizeTeam(ev.away_team, oddsObj, false),
          home_team: normalizeTeam(ev.home_team, oddsObj, true),
        };
      });

      const parsed = { summary_markdown: raw.summary_markdown, games, league: raw.league };
      lastValidData.current = parsed;
      return parsed;
    } catch { return lastValidData.current; }
  }, [dataString]);

  // 2. Hydrate & Merge Edge Overrides into LLM Data
  const data = useMemo(() => {
    if (!initialData) return null;
    const mergedGames = initialData.games.map(g => {
      const override = liveOverrides[g.id];
      if (!override) return g;

      const newStatus = override.status || g.status;
      const newPeriod = override.period || g.period;
      const newAwayScore = override.away_team?.score ?? g.away_team?.score;
      const newHomeScore = override.home_team?.score ?? g.home_team?.score;

      // Preserve object reference if data hasn't mutated to prevent memo invalidation
      if (
        newStatus === g.status &&
        newPeriod === g.period &&
        newAwayScore === g.away_team?.score &&
        newHomeScore === g.home_team?.score
      ) {
        return g;
      }

      return {
        ...g,
        status: newStatus,
        period: newPeriod,
        away_team: { ...g.away_team, score: newAwayScore },
        home_team: { ...g.home_team, score: newHomeScore },
      };
    });
    return { ...initialData, games: mergedGames };
  }, [initialData, liveOverrides]);

  // 3. The Telemetry Engine (Silent Background Polling)
  const activeGameIds = useMemo(() => {
    return initialData?.games?.filter(g => {
      const s = normalizeStatus(g.status);
      return s === 'live' || s === 'scheduled';
    }).map(g => g.id).join(',') || '';
  }, [initialData?.games]);

  useEffect(() => {
    if (!activeGameIds) return;

    const league = initialData?.league || initialData?.games?.[0]?.league;
    if (!league || !ESPN_SPORT_MAP[league.toLowerCase()]) return;

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;
    let consecutive429s = 0;
    let isFetching = false;

    const poll = async () => {
      if (cancelled || isFetching) return;
      
      isFetching = true;
      let nextTick = 30_000; // Base poll rate of 30s

      try {
        const proxyUrl = `/api-proxy/espn/${league.toLowerCase()}`;
        const res = await fetch(proxyUrl, {
          headers: { 'x-app-proxy': import.meta.env.VITE_PROXY_HEADER || '' }
        });

        if (res.status === 429) {
          consecutive429s++;
          if (consecutive429s > 5) return; // Stop polling after repeated rate limits
          
          const retryAfter = res.headers.get('Retry-After');
          if (retryAfter && !isNaN(parseInt(retryAfter, 10))) {
            nextTick = parseInt(retryAfter, 10) * 1000;
          } else {
            nextTick = Math.min(
              5 * 60_000, 
              30_000 * Math.pow(2, consecutive429s - 1)
            );
          }
          return; // Skip JSON parsing
        }

        if (!res.ok) return;

        consecutive429s = 0; // Reset counter on success
        const json = await res.json();
        if (cancelled) return;

        const updates: Record<string, Partial<Game>> = {};
        for (const ev of json.events || []) {
          let sit: LiveSituation | undefined;
          if (ev.situation) {
            sit = {
              downDistance: ev.situation.downDistanceText,
              possession: ev.situation.possession ? String(ev.situation.possession) : undefined,
              isRedZone: ev.situation.isRedZone,
              outs: ev.situation.outs,
              onFirst: !!ev.situation.onFirst,
              onSecond: !!ev.situation.onSecond,
              onThird: !!ev.situation.onThird,
              lastPlay: ev.situation.lastPlay?.text,
              balls: ev.situation.balls,
              strikes: ev.situation.strikes,
            };
          }

          updates[String(ev.id)] = {
            status: normalizeStatus(ev.status),
            period: ev.detail || ev.period,
            away_team: { score: ev.teams?.find((t: any) => t.homeAway === 'away')?.score } as Team,
            home_team: { score: ev.teams?.find((t: any) => t.homeAway === 'home')?.score } as Team,
            situation: sit,
          } as Partial<Game>;
        }

        setLiveOverrides(prev => ({ ...prev, ...updates }));
      } catch {
        // Silently fail to keep existing data visible without console spam
      } finally {
        isFetching = false;
        if (!cancelled && consecutive429s <= 5) {
           timeoutId = setTimeout(poll, nextTick);
        }
      }
    };

    poll();

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [activeGameIds, initialData?.league, initialData?.games]);

  // 4. Segmentation
  const { liveGames, finalGames, scheduledGames } = useMemo(() => {
    const live: Game[] = []; const final: Game[] = []; const sched: Game[] = [];
    (data?.games || []).forEach(g => {
      const s = normalizeStatus(g.status);
      if (s === 'live') live.push(g);
      else if (s === 'final') final.push(g);
      else sched.push(g);
    });
    return { liveGames: live, finalGames: final, scheduledGames: sched };
  }, [data?.games]);

  const summaryHtml = useMemo(() => {
    if (!data?.summary_markdown) return '';
    try {
      const rawHtml = marked.parse(data.summary_markdown, { breaks: true }) as string;
      return typeof window !== 'undefined' ? DOMPurify.sanitize(rawHtml) : rawHtml;
    } catch {
      return '';
    }
  }, [data?.summary_markdown]);

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
            <p className="text-[10px] font-semibold text-black/60 uppercase tracking-[0.18em] leading-none">
              {liveGames.length > 0 ? 'Live Telemetry Active' : 'Schedule & Results'}
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
            <h4 className="text-[11px] font-bold text-black/50 uppercase tracking-[0.18em] px-1">In Progress</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <AnimatePresence mode="popLayout">
                {liveGames.map(game => <GameDisplay key={game.id} game={game} isHero={true} onAction={onAction} />)}
              </AnimatePresence>
            </div>
          </div>
        )}

        {scheduledGames.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-[11px] font-bold text-black/50 uppercase tracking-[0.18em] border-b border-black/[0.04] pb-3 px-1 mb-3">Upcoming</h4>
            <div className="px-4 bg-[#F9F9F9]/50 rounded-[24px]">
              {scheduledGames.map(game => <GameDisplay key={game.id} game={game} isHero={false} onAction={onAction} />)}
            </div>
          </div>
        )}

        {finalGames.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-[11px] font-bold text-black/50 uppercase tracking-[0.18em] border-b border-black/[0.04] pb-3 px-1 mb-3">Final</h4>
            <div className="px-4 bg-[#F9F9F9]/50 rounded-[24px]">
              {finalGames.map(game => <GameDisplay key={game.id} game={game} isHero={false} onAction={onAction} />)}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
};
