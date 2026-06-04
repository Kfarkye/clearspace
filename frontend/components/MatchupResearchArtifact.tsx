import React, { useMemo, memo } from 'react';
import { Swords, TrendingUp, TrendingDown, HeartPulse, BrainCircuit, Users } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────

interface TeamTrend {
  description: string;
  direction: 'up' | 'down' | 'neutral';
}

interface TeamData {
  name: string;
  abbreviation?: string;
  logo?: string;
  record?: string;
  trend?: TeamTrend;
}

interface InjuryEntry {
  player?: string;
  name?: string;
  position?: string;
  status: string;
  detail?: string;
}

interface MatchupResearchData {
  title?: string;
  subtitle?: string;
  league?: string;
  homeTeam?: TeamData;
  awayTeam?: TeamData;
  // Server sends home_team/away_team format
  home_team?: any;
  away_team?: any;
  headToHead?: string;
  head_to_head?: string;
  injuries?: {
    home: InjuryEntry[] | string;
    away: InjuryEntry[] | string;
  } | InjuryEntry[];
  projection?: string;
  context?: string;
  analysis_markdown?: string;
  // Odds from sports-handler
  odds?: any;
  books?: any[];
  bestBook?: any;
}

interface MatchupResearchArtifactProps {
  dataString: string;
  onAction?: (query: string) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────

function parseJsonSafe(raw: string): any | null {
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
  return null;
}

function normalizeTeam(raw: any): TeamData {
  if (!raw) return { name: 'TBD' };
  return {
    name: raw.name || 'TBD',
    abbreviation: raw.abbreviation || raw.abbr || '',
    logo: raw.logo || '',
    record: raw.record || '',
    trend: raw.trend,
  };
}

function normalizeInjuries(raw: InjuryEntry[] | string | undefined): InjuryEntry[] {
  if (!raw) return [];
  if (typeof raw === 'string') {
    if (raw.toLowerCase().includes('no significant') || raw.toLowerCase().includes('none')) return [];
    return [{ player: raw, status: 'Unknown' }];
  }
  return raw.map(i => ({
    player: i.player || i.name || 'Unknown',
    position: i.position,
    status: i.status || 'Unknown',
    detail: i.detail,
  }));
}

// ─── Sub-components ──────────────────────────────────────────────

const MicroLabel = memo(({ icon: Icon, text }: { icon: React.ComponentType<any>; text: string }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 14 }}>
    <Icon size={14} style={{ color: 'var(--taupe)', opacity: 0.6 }} />
    <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.15em] text-taupe/60">
      {text}
    </span>
  </div>
));
MicroLabel.displayName = 'MicroLabel';

const GlassPanel = memo(({ children, glowColor, style }: {
  children: React.ReactNode;
  glowColor?: string;
  style?: React.CSSProperties;
}) => (
  <div
    className="relative overflow-hidden bg-alabaster/80 backdrop-blur-xl border border-clay/60 rounded-[20px]"
    style={{ padding: '18px 20px', boxShadow: 'inset 0 1px 0 rgba(0,0,0,0.02)', ...style }}
  >
    {/* Specular top-edge highlight */}
    <div
      style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 1,
        background: 'linear-gradient(90deg, transparent, rgba(0,0,0,0.04), transparent)',
        pointerEvents: 'none',
      }}
    />
    {/* Volumetric glow */}
    {glowColor && (
      <div
        style={{
          position: 'absolute', top: -60, right: -60, width: 140, height: 140,
          borderRadius: '50%', background: glowColor, filter: 'blur(50px)',
          pointerEvents: 'none',
        }}
      />
    )}
    {children}
  </div>
));
GlassPanel.displayName = 'GlassPanel';

const TeamLogo = memo(({ src, name, size = 40 }: { src?: string; name: string; size?: number }) => {
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        style={{
          width: size, height: size, objectFit: 'contain',
          filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.1))',
          flexShrink: 0,
        }}
      />
    );
  }
  return (
    <div
      className="font-mono text-[12px] font-bold text-charcoal/30"
      style={{
        width: size, height: size, borderRadius: '50%',
        background: 'var(--clay)', display: 'flex', alignItems: 'center',
        justifyContent: 'center', flexShrink: 0, opacity: 0.4,
      }}
    >
      {(name || '?').slice(0, 3).toUpperCase()}
    </div>
  );
});
TeamLogo.displayName = 'TeamLogo';

const TrendIcon = memo(({ direction }: { direction: 'up' | 'down' | 'neutral' }) => {
  if (direction === 'up') return <TrendingUp size={14} className="text-green-600/80" />;
  if (direction === 'down') return <TrendingDown size={14} className="text-red-500/80" />;
  return <div style={{ width: 14, height: 14 }} />;
});
TrendIcon.displayName = 'TrendIcon';

// ─── Main Component ──────────────────────────────────────────────

export const MatchupResearchArtifact: React.FC<MatchupResearchArtifactProps> = ({ dataString, onAction }) => {
  const data = useMemo(() => {
    const raw = parseJsonSafe(dataString);
    if (!raw) return null;
    return raw as MatchupResearchData;
  }, [dataString]);

  if (!data) return null;

  const home = normalizeTeam(data.homeTeam || data.home_team);
  const away = normalizeTeam(data.awayTeam || data.away_team);
  const headToHead = data.headToHead || data.head_to_head || '';
  const projection = data.projection || data.context || data.analysis_markdown || '';

  // Normalize injuries — handle both { home: [], away: [] } and flat array formats
  let homeInjuries: InjuryEntry[] = [];
  let awayInjuries: InjuryEntry[] = [];
  if (data.injuries) {
    if (Array.isArray(data.injuries)) {
      // Flat array from sports-handler: [ { teamAbbreviation, players: [...] } ]
      for (const group of data.injuries as any[]) {
        const abbr = (group.teamAbbreviation || '').toLowerCase();
        const players = normalizeInjuries(group.players);
        if (abbr === (home.abbreviation || '').toLowerCase()) {
          homeInjuries = players;
        } else {
          awayInjuries = players;
        }
      }
    } else {
      homeInjuries = normalizeInjuries((data.injuries as any).home);
      awayInjuries = normalizeInjuries((data.injuries as any).away);
    }
  }

  // Odds from books array
  const primaryBook = data.books?.[0] || data.bestBook;

  return (
    <div className="my-6 w-full" style={{ maxWidth: 580 }}>
      {/* ── Matchup Header ─────────────────────────────────────── */}
      <GlassPanel style={{ marginBottom: 8 }}>
        {data.league && (
          <div style={{ textAlign: 'center', marginBottom: 12 }}>
            <span className="font-mono text-[9px] font-bold tracking-[0.18em] uppercase text-taupe/45">
              {data.league} · Matchup Research
            </span>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Away team */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
            <TeamLogo src={away.logo} name={away.name} size={44} />
            <div>
              <p className="text-[15px] font-semibold text-ink" style={{ margin: 0, lineHeight: 1.2 }}>
                {away.abbreviation || away.name}
              </p>
              {away.record && (
                <p className="font-mono text-[11px] text-taupe/55" style={{ margin: '3px 0 0 0' }}>
                  {away.record}
                </p>
              )}
            </div>
          </div>

          {/* Center divider */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 16px', flexShrink: 0 }}>
            <Swords size={18} className="text-taupe/30" />
            {data.subtitle && (
              <span className="font-mono text-[9px] text-taupe/35" style={{ marginTop: 4, letterSpacing: '0.1em' }}>
                {data.subtitle}
              </span>
            )}
          </div>

          {/* Home team */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, justifyContent: 'flex-end' }}>
            <div style={{ textAlign: 'right' }}>
              <p className="text-[15px] font-semibold text-ink" style={{ margin: 0, lineHeight: 1.2 }}>
                {home.abbreviation || home.name}
              </p>
              {home.record && (
                <p className="font-mono text-[11px] text-taupe/55" style={{ margin: '3px 0 0 0' }}>
                  {home.record}
                </p>
              )}
            </div>
            <TeamLogo src={home.logo} name={home.name} size={44} />
          </div>
        </div>

        {/* Odds strip */}
        {primaryBook && (
          <div className="flex items-center justify-center gap-4 mt-3 pt-3 border-t border-clay/30">
            {primaryBook.spread && (
              <>
                <div className="flex items-baseline gap-1.5">
                  <span className="font-mono text-[9px] text-taupe/50 font-semibold tracking-[0.04em]">SPR</span>
                  <span className="font-mono text-[12px] text-ink font-medium">{primaryBook.spread}</span>
                </div>
                <div style={{ width: 1, height: 10, background: 'var(--clay)', opacity: 0.4 }} />
              </>
            )}
            {primaryBook.overUnder && (
              <>
                <div className="flex items-baseline gap-1.5">
                  <span className="font-mono text-[9px] text-taupe/50 font-semibold tracking-[0.04em]">O/U</span>
                  <span className="font-mono text-[12px] text-ink font-medium">{primaryBook.overUnder}</span>
                </div>
                <div style={{ width: 1, height: 10, background: 'var(--clay)', opacity: 0.4 }} />
              </>
            )}
            {(primaryBook.homeML || primaryBook.awayML) && (
              <div className="flex items-baseline gap-1.5">
                <span className="font-mono text-[9px] text-taupe/50 font-semibold tracking-[0.04em]">ML</span>
                <span className="font-mono text-[12px] text-ink font-medium">
                  {away.abbreviation} {primaryBook.awayML} / {home.abbreviation} {primaryBook.homeML}
                </span>
              </div>
            )}
          </div>
        )}
      </GlassPanel>

      {/* ── Data Grid ──────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
        {/* Head-to-Head */}
        {headToHead && (
          <GlassPanel style={{ gridColumn: '1 / -1' }}>
            <MicroLabel icon={Swords} text="Head-to-Head" />
            <p className="text-[13px] text-charcoal leading-relaxed" style={{ margin: 0 }}>
              {headToHead}
            </p>
          </GlassPanel>
        )}

        {/* Team Trends */}
        {(away.trend || home.trend) && (
          <GlassPanel style={{ gridColumn: '1 / -1' }}>
            <MicroLabel icon={Users} text="Team Trends" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {away.trend && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <TeamLogo src={away.logo} name={away.name} size={32} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <span className="text-[13px] font-semibold text-ink">{away.abbreviation || away.name}</span>
                      <TrendIcon direction={away.trend.direction} />
                    </div>
                    <p className="text-[12px] text-charcoal/70 leading-relaxed" style={{ margin: 0 }}>
                      {away.trend.description}
                    </p>
                  </div>
                </div>
              )}
              {away.trend && home.trend && (
                <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, var(--clay), transparent)', opacity: 0.4 }} />
              )}
              {home.trend && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <TeamLogo src={home.logo} name={home.name} size={32} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <span className="text-[13px] font-semibold text-ink">{home.abbreviation || home.name}</span>
                      <TrendIcon direction={home.trend.direction} />
                    </div>
                    <p className="text-[12px] text-charcoal/70 leading-relaxed" style={{ margin: 0 }}>
                      {home.trend.description}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </GlassPanel>
        )}

        {/* Injuries */}
        {(homeInjuries.length > 0 || awayInjuries.length > 0) && (
          <GlassPanel style={{ gridColumn: '1 / -1' }}>
            <MicroLabel icon={HeartPulse} text="Injuries" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              {/* Away injuries */}
              <div>
                <span className="font-mono text-[10px] font-semibold text-taupe/45 tracking-[0.1em] block mb-2.5">
                  {away.abbreviation || away.name}
                </span>
                {awayInjuries.length === 0 ? (
                  <p className="text-[12px] text-taupe/35" style={{ margin: 0 }}>No injuries reported</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {awayInjuries.map((inj, i) => (
                      <div key={i}>
                        <span className="text-[12px] font-medium text-ink/75 tracking-tight">{inj.player}</span>
                        {inj.position && (
                          <span className="font-mono text-[10px] text-taupe/35 ml-1.5">{inj.position}</span>
                        )}
                        <span className="font-mono text-[10px] text-taupe/50 block mt-0.5">
                          {inj.status}{inj.detail ? ` · ${inj.detail}` : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {/* Home injuries */}
              <div>
                <span className="font-mono text-[10px] font-semibold text-taupe/45 tracking-[0.1em] block mb-2.5">
                  {home.abbreviation || home.name}
                </span>
                {homeInjuries.length === 0 ? (
                  <p className="text-[12px] text-taupe/35" style={{ margin: 0 }}>No injuries reported</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {homeInjuries.map((inj, i) => (
                      <div key={i}>
                        <span className="text-[12px] font-medium text-ink/75 tracking-tight">{inj.player}</span>
                        {inj.position && (
                          <span className="font-mono text-[10px] text-taupe/35 ml-1.5">{inj.position}</span>
                        )}
                        <span className="font-mono text-[10px] text-taupe/50 block mt-0.5">
                          {inj.status}{inj.detail ? ` · ${inj.detail}` : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </GlassPanel>
        )}
      </div>

      {/* ── Analyst Projection (Amber HUD) ─────────────────────── */}
      {projection && (
        <GlassPanel
          glowColor="rgba(186,143,75,0.08)"
          style={{
            borderColor: 'var(--bronze)',
            background: 'linear-gradient(145deg, rgba(186,143,75,0.04), rgba(255,255,255,0.02))',
          }}
        >
          <MicroLabel icon={BrainCircuit} text="Analyst Projection" />
          <p className="text-[13px] text-charcoal/75 leading-[1.65]" style={{ margin: 0 }}>
            {projection}
          </p>
        </GlassPanel>
      )}

      {/* ── Continue in Chat ───────────────────────────────────── */}
      {onAction && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <button
            onClick={() => onAction(
              `Give me deeper analysis on ${away.abbreviation || away.name} at ${home.abbreviation || home.name}. ` +
              `Include betting angles, recent ATS/O-U performance, and a recommendation.`
            )}
            className="text-[11px] font-mono font-semibold text-bronze/70 hover:text-bronze tracking-[0.06em] uppercase transition-colors px-3 py-2 rounded-lg hover:bg-bronze/5"
          >
            Deep Dive →
          </button>
        </div>
      )}
    </div>
  );
};
