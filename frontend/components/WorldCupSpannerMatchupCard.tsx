import React, { useEffect, useState } from 'react';

interface WorldCupSpannerMatchupCardProps {
  dataString?: string;
}

export const WorldCupSpannerMatchupCard: React.FC<WorldCupSpannerMatchupCardProps> = ({ dataString }) => {
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

      const fetchUrl = `/api/worldcup/games/${parsed.eventId}/context`;
      fetch(fetchUrl)
        .then(r => r.ok ? r.json() : Promise.reject(`Failed with status ${r.status}`))
        .then(payload => {
          setData(payload);
          setLoading(false);
        })
        .catch(err => {
          console.error(err);
          setError({ message: "Failed to fetch Spanner World Cup Context.", url: fetchUrl, eventId: parsed.eventId });
          setLoading(false);
        });
    } catch (e) {
      console.error(e);
      setError({ message: "Failed to parse event data." });
      setLoading(false);
    }
  }, [dataString]);

  if (loading) {
    return (
      <div className="w-full bg-white/60 backdrop-blur-md border border-clay p-6 rounded-xl flex items-center justify-center shadow-glass-sm mt-4">
        <span className="text-taupe font-mono text-sm">Querying Clearspace Ledger for World Cup Context...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="w-full bg-red-50/50 backdrop-blur-md border border-red-500/20 p-6 rounded-xl flex flex-col shadow-glass-sm font-mono text-sm mt-4">
        <span className="text-red-600 font-bold">{error?.message || "No data available in Spanner."}</span>
        {error?.eventId && <span className="text-red-500 mt-2">EventId: {error.eventId}</span>}
        {error?.url && <span className="text-red-500">URL: {error.url}</span>}
      </div>
    );
  }

  const match = data?.match || data;
  const odds = data?.odds;
  const edges = data?.edges || [];

  const teamMatchup = (match?.homeTeam?.name || match?.home_team_name) && (match?.awayTeam?.name || match?.away_team_name)
    ? `${match.homeTeam?.name || match.home_team_name} vs ${match.awayTeam?.name || match.away_team_name}`
    : 'Unknown Home vs Unknown Away';

  return (
    <div className="w-full bg-[#FAF9F6] backdrop-blur-xl border border-clay shadow-glass-sm rounded-xl flex flex-col overflow-hidden font-sans mt-4">
      <div className="p-3 border-b border-clay/50 bg-[#F4F4F4] flex justify-between items-center">
        <div className="flex gap-2 items-center">
          <div className="w-2 h-2 rounded-full bg-bronze" />
          <h2 className="text-charcoal font-semibold text-xs tracking-wide uppercase">World Cup Matchup Context</h2>
        </div>
        <span className="text-taupe font-mono text-[10px] uppercase cursor-text">
          Source: clearspace-db · EventId: {match?.matchId || match?.match_id || data.eventId}
        </span>
      </div>
      
      <div className="p-4 flex justify-between items-start border-b border-clay/30">
        <div>
          <div className="text-sm font-semibold text-ink flex items-center gap-2">
            <span>{match?.homeTeam?.flag || match?.home_flag || '🏠'}</span>
            {teamMatchup}
            <span>{match?.awayTeam?.flag || match?.away_flag || '✈️'}</span>
          </div>
          <div className="text-xs text-taupe mt-1">
            {match?.venue?.name || match?.venue_name || 'TBD'} | {new Date(match?.kickoff).toLocaleString()}
          </div>
          <div className="text-[10px] font-mono text-taupe mt-1 uppercase">
            Group: {match?.group || match?.group_letter || 'N/A'} | Stage: {match?.stage || 'Unknown'}
          </div>
        </div>
        <div className="text-right flex flex-col items-end">
          <div className="text-sm font-bold text-ink uppercase">{match?.status || 'SCHEDULED'}</div>
          {(match?.homeTeam?.score !== null && match?.homeTeam?.score !== undefined) && (
            <div className="text-lg font-mono font-bold text-charcoal mt-1">
              {match.homeTeam.score} - {match.awayTeam?.score}
            </div>
          )}
        </div>
      </div>

      <div className="p-4 grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <h3 className="text-[10px] font-mono uppercase text-taupe tracking-wider">Spanner Entities Found</h3>
          <ul className="text-xs font-mono space-y-1">
            <li className={`flex items-center gap-2 ${match ? 'text-sage' : 'text-clay/50'}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-current"></span> Match Context
            </li>
            <li className={`flex items-center gap-2 ${odds ? 'text-sage' : 'text-clay/50'}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-current"></span> Betting Odds
            </li>
            <li className={`flex items-center gap-2 ${edges?.length > 0 ? 'text-sage' : 'text-clay/50'}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-current"></span> Analytical Edges ({edges?.length})
            </li>
          </ul>
        </div>
        
        <div className="flex flex-col gap-2">
          <h3 className="text-[10px] font-mono uppercase text-taupe tracking-wider">Raw Diagnostics</h3>
          <ul className="text-xs font-mono space-y-1 text-taupe">
            <li>Home Rank: {match?.homeTeam?.fifaRanking || match?.home_rank || 'N/A'}</li>
            <li>Away Rank: {match?.awayTeam?.fifaRanking || match?.away_rank || 'N/A'}</li>
            <li>Venue Capacity: {match?.venue?.capacity || match?.capacity || 'N/A'}</li>
            {odds && <li>Odds Provider: {odds.provider || 'N/A'}</li>}
          </ul>
        </div>
      </div>

      {odds && (
        <div className="bg-black/5 p-4 border-t border-clay/30">
          <h3 className="text-[10px] font-mono uppercase text-taupe tracking-wider mb-2">Market Odds</h3>
          <div className="grid grid-cols-3 gap-2 text-xs font-mono">
            <div className="bg-white p-2 rounded shadow-sm">
              <span className="text-[9px] text-taupe block mb-1">Spread</span>
              {odds.spread || 'N/A'}
            </div>
            <div className="bg-white p-2 rounded shadow-sm">
              <span className="text-[9px] text-taupe block mb-1">Moneyline (Home/Away/Draw)</span>
              {odds.homeMoneyline || 'N/A'} / {odds.awayMoneyline || 'N/A'} / {odds.drawMoneyline || 'N/A'}
            </div>
            <div className="bg-white p-2 rounded shadow-sm">
              <span className="text-[9px] text-taupe block mb-1">Over/Under</span>
              {odds.overUnder || 'N/A'}
            </div>
          </div>
        </div>
      )}

      {edges?.length > 0 && (
        <div className="bg-white p-4 border-t border-clay/30">
          <h3 className="text-[10px] font-mono uppercase text-taupe tracking-wider mb-2">Calculated Edges</h3>
          <div className="space-y-2">
            {edges.map((edge: any, i: number) => (
              <div key={i} className="text-xs font-mono p-2 bg-[#F4F4F4] rounded border border-clay/50">
                <span className="font-bold text-bronze mr-2">{edge.edgeType || edge.edge_type}:</span>
                {edge.summary || edge.description}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
