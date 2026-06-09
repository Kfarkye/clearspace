import React, { useEffect, useState } from 'react';

interface MlbSpannerMatchupCardProps {
  dataString?: string;
}

export const MlbSpannerMatchupCard: React.FC<MlbSpannerMatchupCardProps> = ({ dataString }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; url?: string; eventId?: string } | null>(null);

  useEffect(() => {
    try {
      let parsedStr = (dataString || '').trim().replace(/,\s*([\]}])/g, '$1');
      if (parsedStr.startsWith('```')) {
        const match = parsedStr.match(/```[a-zA-Z_]*\n([\s\S]*?)(?:```|$)/);
        if (match) parsedStr = match[1];
      }
      const parsed = JSON.parse(parsedStr || '{}');
      
      if (!parsed.eventId) {
        setError({ message: "Missing event ID." });
        setLoading(false);
        return;
      }

      const fetchUrl = `/api/mlb/games/${parsed.eventId}/context`;
      fetch(fetchUrl)
        .then(r => r.ok ? r.json() : Promise.reject(`Failed with status ${r.status}`))
        .then(payload => {
          setData(payload);
          setLoading(false);
        })
        .catch(err => {
          console.error(err);
          setError({ message: "Failed to fetch Spanner MLB Context.", url: fetchUrl, eventId: parsed.eventId });
          setLoading(false);
        });
    } catch (e) {
      console.error(e);
      setError("Failed to parse event data.");
      setLoading(false);
    }
  }, [dataString]);

  if (loading) {
    return (
      <div className="w-full bg-white/60 backdrop-blur-md border border-clay p-6 rounded-xl flex items-center justify-center shadow-glass-sm">
        <span className="text-taupe font-mono text-sm">Querying Clearspace Ledger...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="w-full bg-red-50/50 backdrop-blur-md border border-red-500/20 p-6 rounded-xl flex flex-col shadow-glass-sm font-mono text-sm">
        <span className="text-red-600 font-bold">{error?.message || "No data available in Spanner."}</span>
        {error?.eventId && <span className="text-red-500 mt-2">EventId: {error.eventId}</span>}
        {error?.url && <span className="text-red-500">URL: {error.url}</span>}
      </div>
    );
  }

  const game = data?.game;
  const boxscore = data?.boxscore;
  const latestOdds = data?.market?.latestSnapshot;
  const conditions = data?.conditions;
  const injuries = data?.injuries || [];
  const ledger = data?.ledger || {};
  const rowCounts = ledger?.rowCounts || {};

  const hasBoxscore = (rowCounts.batting > 0 || rowCounts.pitching > 0);
  const hasOdds = (rowCounts.odds > 0 || !!latestOdds);
  const hasConditions = !!conditions;
  const hasInjuries = (injuries.length > 0);

  const teamMatchup = (game?.awayTeam || game?.AwayTeamName) && (game?.homeTeam || game?.HomeTeamName)
    ? `${game.awayTeam || game.AwayTeamName} @ ${game.homeTeam || game.HomeTeamName}`
    : 'Unknown Away @ Unknown Home';

  const isScheduleOnly = !hasBoxscore && !hasOdds && !hasConditions && !hasInjuries;

  if (isScheduleOnly || ledger.completeness === 'sparse') {
    return (
      <div className="w-full bg-white/60 backdrop-blur-xl border border-clay shadow-glass-sm rounded-xl flex flex-col overflow-hidden font-sans">
        <div className="p-3 border-b border-clay/50 bg-[#F4F4F4] flex justify-between items-center">
          <div className="flex gap-2 items-center">
            <div className="w-2 h-2 rounded-full bg-taupe" />
            <h2 className="text-charcoal font-semibold text-xs tracking-wide uppercase">Scheduled Matchup</h2>
          </div>
          <span className="text-taupe font-mono text-[10px] uppercase cursor-text">Source: clearspace-db · EventId: {game?.EventId || game?.eventId || data.eventId}</span>
        </div>
        <div className="p-4 flex justify-between items-center">
          <div>
            <div className="text-sm font-semibold text-ink">{teamMatchup}</div>
            <div className="text-xs text-taupe">{game?.venue || game?.Venue} | {new Date(game?.startTime || game?.GameDate).toLocaleString()}</div>
          </div>
          <div className="text-right">
            <div className="text-sm font-bold text-ink">{game?.status || game?.Status}</div>
            <div className="text-[10px] font-mono text-taupe mt-1 uppercase px-2 py-0.5 bg-black/5 rounded">Sparse Data</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto bg-[#0a0a0a] border border-white/[0.04] shadow-2xl rounded-2xl flex flex-col font-sans mb-6 overflow-hidden">
      <div className="flex justify-between items-center px-6 py-10 relative">
        {/* Away Team */}
        <div className="flex flex-col items-center flex-1">
          <div className="w-20 h-20 rounded-full border border-white/10 bg-white/5 flex items-center justify-center p-3 mb-4">
            <img 
              src={`https://a.espncdn.com/i/teamlogos/mlb/500/scoreboard/${(game?.awayTeam || game?.AwayTeamName || 'mlb').toLowerCase().replace(' ', '')}.png`}
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
              alt="Away" 
              className="w-full h-full object-contain" 
            />
          </div>
          <span className="text-white text-xl font-medium tracking-tight mb-2">
            {game?.awayTeam || game?.AwayTeamName || 'Away'}
          </span>
          <span className="text-slate-400 font-mono text-[13px] mb-2">
            {game?.awayScore || game?.AwayScore || 0}
          </span>
          <span className="text-[#FF3B30] text-[12px] font-medium flex items-center gap-1">
            ↓ Away
          </span>
        </div>

        {/* Divider */}
        <div className="w-[1px] h-24 bg-white/10 mx-4" />

        {/* Home Team */}
        <div className="flex flex-col items-center flex-1">
          <div className="w-20 h-20 rounded-full border border-white/10 bg-white/5 flex items-center justify-center p-3 mb-4">
            <img 
              src={`https://a.espncdn.com/i/teamlogos/mlb/500/scoreboard/${(game?.homeTeam || game?.HomeTeamName || 'mlb').toLowerCase().replace(' ', '')}.png`}
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
              alt="Home" 
              className="w-full h-full object-contain" 
            />
          </div>
          <span className="text-white text-xl font-medium tracking-tight mb-2">
            {game?.homeTeam || game?.HomeTeamName || 'Home'}
          </span>
          <span className="text-slate-400 font-mono text-[13px] mb-2">
            {game?.homeScore || game?.HomeScore || 0}
          </span>
          <span className="text-[#34C759] text-[12px] font-medium flex items-center gap-1">
            ↑ Home
          </span>
        </div>
      </div>

      <div className="px-6 py-4 bg-white/[0.02] border-t border-white/[0.04] flex justify-between items-center">
        <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">
          WIN PROBABILITY FORECAST
        </span>
        <span className="text-[10px] font-mono text-slate-500 uppercase">
          {game?.status || game?.Status || 'N/A'}
        </span>
      </div>
    </div>
  );
};
