import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { Copy, Check, ExternalLink } from 'lucide-react';
import { IOSBettingCard } from './IOSBettingCard';

// ─── Types ───────────────────────────────────────────────────────

interface BestBet {
  sport: string;
  game: string;
  bet: string;
  odds: number;
  book: string;
  rationale: string;
  teamAbbr?: string;
  imageUrl?: string;
  deepLink?: string;
  title?: string;
  market_price?: string | number;
  fair_price?: string | number;
  edge_source?: string;
  live_state?: string;
  risk_flag?: string;
  why_now?: string;
  invalidation_condition?: string;
}

interface BettingAnglesProps {
  dataString: string;
}

// ─── Constants & Data Dictionaries ───────────────────────────────

/** Grouped strictly by sport to prevent cross-sport mascot overlaps */
const LEAGUE_TEAM_MAP: Record<string, Record<string, string>> = {
  mlb: {
    'yankees': 'nyy', 'mets': 'nym', 'red sox': 'bos', 'orioles': 'bal', 'blue jays': 'tor', 'rays': 'tb',
    'guardians': 'cle', 'twins': 'min', 'white sox': 'chw', 'tigers': 'det', 'royals': 'kc', 'astros': 'hou',
    'rangers': 'tex', 'mariners': 'sea', 'athletics': 'oak', 'angels': 'laa', 'dodgers': 'lad', 'padres': 'sd',
    'giants': 'sf', 'diamondbacks': 'ari', 'rockies': 'col', 'braves': 'atl', 'phillies': 'phi', 'marlins': 'mia',
    'nationals': 'wsh', 'cubs': 'chc', 'cardinals': 'stl', 'brewers': 'mil', 'reds': 'cin', 'pirates': 'pit'
  },
  nhl: {
    'golden knights': 'vgs', 'hurricanes': 'car', 'panthers': 'fla', 'lightning': 'tb', 'maple leafs': 'tor',
    'bruins': 'bos', 'oilers': 'edm', 'avalanche': 'col', 'stars': 'dal', 'jets': 'wpg', 'wild': 'min',
    'predators': 'nsh', 'blues': 'stl', 'blackhawks': 'chi', 'red wings': 'det', 'penguins': 'pit',
    'capitals': 'wsh', 'flyers': 'phi', 'islanders': 'nyi', 'devils': 'njd', 'senators': 'ott',
    'canadiens': 'mtl', 'sabres': 'buf', 'kraken': 'sea', 'flames': 'cgy', 'canucks': 'van',
    'sharks': 'sj', 'ducks': 'ana', 'kings': 'la', 'blue jackets': 'cbj', 'rangers': 'nyr'
  },
  nba: {
    'lakers': 'lal', 'celtics': 'bos', 'warriors': 'gs', 'bucks': 'mil', 'nuggets': 'den', 'suns': 'phx',
    'heat': 'mia', 'knicks': 'ny', 'cavaliers': 'cle', 'thunder': 'okc', 'timberwolves': 'min',
    'mavericks': 'dal', 'pelicans': 'no', 'grizzlies': 'mem', 'rockets': 'hou', 'spurs': 'sa',
    'clippers': 'lac', 'trail blazers': 'por', 'raptors': 'tor', '76ers': 'phi', 'pacers': 'ind',
    'hawks': 'atl', 'bulls': 'chi', 'pistons': 'det', 'magic': 'orl', 'wizards': 'wsh',
    'hornets': 'cha', 'nets': 'bkn', 'kings': 'sac'
  },
  nfl: {
    'chiefs': 'kc', 'eagles': 'phi', 'bills': 'buf', 'ravens': 'bal', '49ers': 'sf', 'lions': 'det',
    'cowboys': 'dal', 'dolphins': 'mia', 'steelers': 'pit', 'bengals': 'cin', 'packers': 'gb',
    'chargers': 'lac', 'vikings': 'min', 'bears': 'chi', 'texans': 'hou', 'commanders': 'wsh',
    'jaguars': 'jax', 'broncos': 'den', 'colts': 'ind', 'titans': 'ten', 'raiders': 'lv',
    'saints': 'no', 'falcons': 'atl', 'seahawks': 'sea', 'buccaneers': 'tb', 'rams': 'lar',
    'panthers': 'car', 'giants': 'nyg', 'jets': 'nyj'
  }
};

// ─── Utilities ───────────────────────────────────────────────────

const resolveLogoFromGame = (gameText: string, sport?: string): string | undefined => {
  if (!gameText) return undefined;
  const lowerGame = gameText.toLowerCase();

  // 1. If sport is provided, explicitly lock search to that specific league
  const leagueKey = sport ? Object.keys(LEAGUE_TEAM_MAP).find(k => sport.toLowerCase().includes(k)) : undefined;

  const searchInLeague = (leagueMap: Record<string, string>, leagueName: string) => {
    for (const [teamName, abbr] of Object.entries(leagueMap)) {
      // \b regex boundary ensures exact word match (prevents "car" from matching inside "cardinals")
      if (new RegExp(`\\b${teamName}\\b`, 'i').test(lowerGame)) {
        return `https://a.espncdn.com/i/teamlogos/${leagueName}/500/scoreboard/${abbr}.png`;
      }
    }
    return undefined;
  };

  if (leagueKey) {
    const match = searchInLeague(LEAGUE_TEAM_MAP[leagueKey], leagueKey);
    if (match) return match;
  }

  // 2. Fallback to all leagues if sport is undefined or ambiguous
  for (const [leagueName, leagueMap] of Object.entries(LEAGUE_TEAM_MAP)) {
    if (leagueName === leagueKey) continue; 
    const match = searchInLeague(leagueMap, leagueName);
    if (match) return match;
  }

  return undefined;
};

const getEspnLogoUrl = (sport: string, abbr: string): string => {
  const s = String(sport).toLowerCase();
  const sportPath = s === 'cfb' || s === 'ncaaf' ? 'college-football' :
                    s === 'cbb' || s === 'ncaam' ? 'mens-college-basketball' : s;
  return `https://a.espncdn.com/i/teamlogos/${sportPath}/500/scoreboard/${String(abbr).toLowerCase()}.png`;
};

const getBookLink = (book: string): string | undefined => {
  if (!book) return undefined;
  const b = String(book).toLowerCase();
  if (b.includes('draftkings') || b.includes('dk')) return 'https://sportsbook.draftkings.com';
  if (b.includes('fanduel') || b.includes('fd')) return 'https://sportsbook.fanduel.com';
  if (b.includes('betmgm') || b.includes('mgm')) return 'https://sports.betmgm.com';
  if (b.includes('caesars')) return 'https://caesars.com/sportsbook-and-casino';
  if (b.includes('bet365')) return 'https://www.bet365.com';
  if (b.includes('kalshi')) return 'https://kalshi.com';
  if (b.includes('polymarket') || b.includes('poly')) return 'https://polymarket.com';
  return undefined;
};

const sanitizeUrl = (url?: string): string | undefined => {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    // Strict block on javascript: protocols to prevent XSS hallucination payloads
    if (['http:', 'https:'].includes(parsed.protocol)) return parsed.href;
  } catch { /* malformed url */ }
  return undefined;
};

const parseBettingData = (raw: string): BestBet[] | null => {
  if (!raw) return null;
  try {
    const cleanJSON = raw.replace(/```(json|bettingangles)?/gi, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleanJSON);

    let rawBets: any[] = [];
    if (Array.isArray(parsed)) rawBets = parsed;
    else if (parsed.best_bets && Array.isArray(parsed.best_bets)) rawBets = parsed.best_bets;
    else if (parsed.picks && Array.isArray(parsed.picks)) rawBets = parsed.picks;
    else if (parsed.angles && Array.isArray(parsed.angles)) rawBets = parsed.angles;
    else return null;

    return rawBets.map((b: any) => {
      const parts = (b.title || '').split(/\s*[—–-]\s*/);
      
      // Safely parse odds: preserves decimals (e.g. 1.85) and strips format garbage
      const rawOddsStr = String(b.odds || '').replace(/[^\d.-]/g, '');
      const parsedOdds = parseFloat(rawOddsStr) || 0;

      return {
        sport: b.sport || '',
        game: b.game || parts[0] || b.title || '',
        bet: b.bet || b.market || b.selection || b.recommendation || (parts.length > 1 ? parts.slice(1).join(' — ') : ''),
        odds: parsedOdds,
        book: b.book || '',
        rationale: b.rationale || b.analysis || b.reasoning || b.description || '',
        teamAbbr: b.teamAbbr || b.team || '',
        imageUrl: sanitizeUrl(b.imageUrl || b.logo) || '',
        deepLink: sanitizeUrl(b.deepLink || b.url || b.link) || '',
        title: b.title,
        market_price: b.market_price,
        fair_price: b.fair_price,
        edge_source: b.edge_source,
        live_state: b.live_state,
        risk_flag: b.risk_flag,
        why_now: b.why_now,
        invalidation_condition: b.invalidation_condition,
      };
    });
  } catch (e) {
    // Return null explicitly on failure to trigger the lastValidData fallback mechanism
    return null;
  }
};

// ─── Sub-components ──────────────────────────────────────────────

/** Extracted TeamLogo to manage isolated CLS-free error states */
const TeamLogo = React.memo(({ src, alt }: { src?: string | null; alt: string }) => {
  const [error, setError] = useState(false);

  if (!src || error) {
    return (
      <div className="w-10 h-10 flex items-center justify-center rounded-full bg-clay/20 border border-clay/30 text-taupe/60 text-[10px] font-bold uppercase tracking-wider shadow-sm">
        {alt.slice(0, 2)}
      </div>
    );
  }

  return (
    <div className="w-10 h-10 bg-white rounded-full border border-clay/30 shadow-sm overflow-hidden p-[2px]">
      <img
        src={src}
        alt={alt}
        onError={() => setError(true)}
        className="w-full h-full object-contain"
        loading="lazy"
      />
    </div>
  );
});
TeamLogo.displayName = 'TeamLogo';

const CopyButton = React.memo(({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  const handleCopy = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation(); // Prevents click from bubbling up to the pseudo-link wrapper
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
  }, [text]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="flex items-center justify-center w-7 h-7 rounded-md text-taupe/80 hover:text-charcoal hover:bg-clay/30 border border-transparent hover:border-clay/40 transition-all duration-150 active:scale-95 z-20 focus:outline-none focus:ring-2 focus:ring-sage/40"
      aria-label="Copy selection"
      title="Copy selection"
    >
      {copied ? <Check size={12} className="text-sage" /> : <Copy size={11} className="stroke-[2.25]" />}
    </button>
  );
});
CopyButton.displayName = 'CopyButton';

// ─── Main Component ──────────────────────────────────────────────

export const BettingAnglesArtifact: React.FC<BettingAnglesProps> = ({ dataString }) => {
  // LLM Stale-While-Revalidate (SWR) Cache
  const lastValidData = useRef<BestBet[]>([]);

  const bets = useMemo(() => {
    const parsed = parseBettingData(dataString);
    if (parsed && parsed.length > 0) {
      lastValidData.current = parsed;
    }
    return lastValidData.current;
  }, [dataString]);

  if (!bets || bets.length === 0) return null;

  return (
    <>
      {/* ─── DESKTOP LAYOUT ─── */}
      <div className="hidden md:block w-full max-w-[640px] mx-auto bg-alabaster border border-clay/60 rounded-xl shadow-glass overflow-hidden font-sans">
        {/* Structural Top Accent Line */}
        <div className="h-[2px] w-full bg-gradient-to-r from-bronze/10 via-bronze/40 to-bronze/10" />

        {/* Header Panel */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-clay/30 bg-alabaster select-none">
          <span className="text-[9px] font-mono tracking-[0.18em] text-taupe font-semibold uppercase">
            Market Intelligence
          </span>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-sage/80 animate-pulse" />
            <span className="text-[9px] font-mono tracking-[0.1em] text-sage font-medium uppercase">
              Verified
            </span>
          </div>
        </div>

        {/* Bets Stack */}
        <div className="divide-y divide-clay/20 relative">
          {bets.map((item, idx) => {
            // Format American Odds vs Decimal Odds safely
            const formattedOdds = item.odds > 0 && Number.isInteger(item.odds) ? `+${item.odds}` : item.odds;
            const compositeKey = `desktop-${item.sport}-${item.game}-${idx}`.replace(/\s+/g, '-');
            
            const imgSrc = item.imageUrl || 
              (item.teamAbbr && item.sport ? getEspnLogoUrl(item.sport, item.teamAbbr) : null) || 
              resolveLogoFromGame(item.game, item.sport);
              
            const destinationUrl = item.deepLink || (item.book ? getBookLink(item.book) : undefined);

            return (
              <div key={compositeKey} className="relative flex gap-4 p-6 hover:bg-sand/20 transition-colors duration-200 group">
                
                {/* Image Thumbnail */}
                <div className="flex-shrink-0 pt-0.5 relative z-10 pointer-events-none">
                  <TeamLogo src={imgSrc} alt={item.teamAbbr || item.game} />
                </div>

                <div className="flex-1 w-full">
                  {/* Meta & Context Row */}
                  <div className="flex items-center justify-between gap-4 mb-3 relative z-10 pointer-events-none select-none">
                    <div className="flex items-center gap-2">
                      {item.sport && (
                        <>
                          <span className="text-[9px] font-mono tracking-widest text-taupe font-semibold uppercase">
                            {item.sport}
                          </span>
                          <span className="text-clay text-[10px]">|</span>
                        </>
                      )}
                      <span className="text-xs font-normal text-taupe/90 tracking-tight line-clamp-1">
                        {item.game}
                      </span>
                    </div>

                    <div className={`flex items-center gap-1.5 ${destinationUrl ? 'group-hover:opacity-80 transition-opacity' : ''}`}>
                      {item.live_state && (
                        <span className="text-[10px] font-mono text-emerald font-semibold border border-emerald/30 bg-emerald/10 px-2 py-0.5 rounded-[4px] shadow-sm mr-1">
                          {item.live_state}
                        </span>
                      )}
                      {item.book && (
                        <span className="flex items-center gap-1 text-[10px] font-mono text-taupe/80 bg-sand border border-clay/40 px-2 py-0.5 rounded-[4px] shadow-sm">
                          {item.book}
                          {destinationUrl && <ExternalLink size={9} className="text-taupe/60" />}
                        </span>
                      )}
                      {item.odds !== 0 && (
                        <span className="text-[10px] font-mono font-semibold text-charcoal bg-clay/30 border border-clay/60 px-2 py-0.5 rounded-[4px] shadow-sm">
                          {formattedOdds}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Selection Header & Rationale Grid */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1.5 max-w-[90%]">
                      <h3 className="text-[15px] font-semibold text-ink tracking-tight leading-snug group-hover:text-bronze transition-colors">
                        {destinationUrl ? (
                          <a 
                            href={destinationUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="before:absolute before:inset-0 before:z-0 focus-visible:outline-none focus-visible:before:ring-2 focus-visible:before:ring-inset focus-visible:before:ring-bronze/30"
                          >
                            <span className="relative z-10">{item.bet}</span>
                          </a>
                        ) : (
                          <span className="relative z-10">{item.bet}</span>
                        )}
                      </h3>
                      
                      {item.risk_flag ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 mt-3 text-[12px] relative z-10">
                          <div className="bg-clay/15 border border-clay/40 rounded px-3 py-2">
                            <span className="block font-mono text-[9px] text-taupe uppercase mb-0.5">Risk Flag</span>
                            <span className="text-charcoal font-medium leading-tight block">{item.risk_flag}</span>
                          </div>
                          <div className="bg-clay/15 border border-clay/40 rounded px-3 py-2">
                            <span className="block font-mono text-[9px] text-taupe uppercase mb-0.5">Why Now</span>
                            <span className="text-charcoal font-medium leading-tight block">{item.why_now}</span>
                          </div>
                          {item.invalidation_condition && (
                            <div className="bg-clay/15 border border-clay/40 rounded px-3 py-2 md:col-span-2">
                              <span className="block font-mono text-[9px] text-taupe uppercase mb-0.5">Invalidation</span>
                              <span className="text-charcoal font-medium leading-tight block">{item.invalidation_condition}</span>
                            </div>
                          )}
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 md:col-span-2">
                             {item.market_price && <span className="text-charcoal font-mono text-[10.5px]">Market: {item.market_price}</span>}
                             {item.fair_price && <span className="text-charcoal font-mono text-[10.5px]">Fair: {item.fair_price}</span>}
                             {item.edge_source && <span className="text-taupe font-mono text-[9.5px]">Source: {item.edge_source}</span>}
                          </div>
                        </div>
                      ) : (
                        <p className="text-[12.5px] leading-[1.55] text-taupe font-normal antialiased relative z-10 pointer-events-auto">
                          {item.rationale}
                        </p>
                      )}
                    </div>

                    {/* Inline Action */}
                    <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-150 flex-shrink-0 self-start mt-0.5 relative z-20 pointer-events-auto">
                      <CopyButton
                        text={`[${item.sport}] ${item.game}\nSelection: ${item.bet} (${formattedOdds} @ ${item.book || 'Book'})\nAnalysis: ${item.rationale}`}
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── MOBILE LAYOUT ─── */}
      <div className="md:hidden flex flex-col gap-4 w-full max-w-md mx-auto p-4 bg-transparent min-h-screen pb-[env(safe-area-inset-bottom)]">
        {bets.map((item, idx) => {
          const compositeKey = `mobile-${item.sport}-${item.game}-${idx}`.replace(/\s+/g, '-');
          const formattedOdds = item.odds !== 0 ? (item.odds > 0 && Number.isInteger(item.odds) ? `+${item.odds}` : item.odds) : (item.market_price || '');
          const fairPrice = item.fair_price || '';
          const title = item.bet || item.title || item.game || 'Market Selection';
          const whyNow = item.why_now || item.rationale || 'No rationale provided.';
          const riskFlag = item.risk_flag || item.invalidation_condition || '';
          
          return (
            <IOSBettingCard 
              key={compositeKey}
              title={`${item.sport ? `[${item.sport}] ` : ''}${title}`}
              marketPrice={formattedOdds}
              fairPrice={fairPrice}
              edgeSource={item.edge_source || item.book || 'Market Edge'}
              whyNow={whyNow}
              riskFlag={riskFlag}
            />
          );
        })}
      </div>
    </>
  );
};
