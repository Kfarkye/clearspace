import React, { useEffect, useState } from 'react';

interface CoreLedgerProps {
  dataString?: string;
}

export const MlbCoreLedgerArtifact: React.FC<CoreLedgerProps> = ({ dataString }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      let parsedStr = (dataString || '').trim().replace(/,\s*([\]}])/g, '$1');
      if (parsedStr.startsWith('```')) {
        const match = parsedStr.match(/```[a-zA-Z_]*\n([\s\S]*?)(?:```|$)/);
        if (match) parsedStr = match[1];
      }
      const parsed = JSON.parse(parsedStr || '{}');
      
      if (!parsed.eventId) {
        setError("Missing eventId in payload.");
        setLoading(false);
        return;
      }

      fetch(`/api-proxy/espn-core/mlb/${parsed.eventId}`)
        .then(r => r.ok ? r.json() : Promise.reject('Failed to fetch from proxy'))
        .then(payload => {
          setData(payload);
          setLoading(false);
        })
        .catch(err => {
          console.error(err);
          setError("Failed to fetch ESPN Core data.");
          setLoading(false);
        });
    } catch (e) {
      console.error(e);
      setError("Failed to parse ledger payload.");
      setLoading(false);
    }
  }, [dataString]);

  if (loading) {
    return (
      <div className="w-full bg-[#1C1F26] border border-white/5 p-6 rounded-xl flex items-center justify-center">
        <span className="text-[#8B949E] font-mono text-sm">Fetching ESPN Core Ledger...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="w-full bg-[#1C1F26] border border-[#C45C5C]/30 p-6 rounded-xl flex items-center justify-center">
        <span className="text-[#C45C5C] font-mono text-sm">{error || "No data available."}</span>
      </div>
    );
  }

  return (
    <div className="w-full bg-[#1C1F26] border border-white/5 rounded-xl flex flex-col overflow-hidden font-sans">
      <div className="p-4 border-b border-white/5 bg-[#252A33] flex justify-between items-center">
        <div className="flex gap-2 items-center">
          <div className="w-2 h-2 rounded-full bg-[#E57A00]" />
          <h2 className="text-[#E6E8EA] font-semibold text-sm tracking-wide uppercase">ESPN Core Ledger</h2>
        </div>
        <span className="text-[#8B949E] font-mono text-[10px] uppercase">ID: {data.eventId} / {data.status}</span>
      </div>
      
      <div className="p-0 overflow-x-auto">
        <table className="w-full text-left text-sm whitespace-nowrap text-[#C9D1D9]">
          <tbody>
            <tr className="border-b border-white/5">
              <th className="py-2 px-4 font-medium text-[#8B949E] bg-[#252A33]/50 w-1/4">Teams</th>
              <td className="py-2 px-4 font-mono">
                {data.teams?.map((t: any) => `${t.name} (${t.homeAway})`).join(' vs ')}
              </td>
            </tr>
            <tr className="border-b border-white/5">
              <th className="py-2 px-4 font-medium text-[#8B949E] bg-[#252A33]/50">Venue</th>
              <td className="py-2 px-4 font-mono">{data.venue}</td>
            </tr>
            <tr className="border-b border-white/5">
              <th className="py-2 px-4 font-medium text-[#8B949E] bg-[#252A33]/50">Records</th>
              <td className="py-2 px-4 font-mono">
                {Object.entries(data.records || {}).map(([team, rec]) => `${team}: ${rec}`).join(' | ')}
              </td>
            </tr>
            <tr className="border-b border-white/5">
              <th className="py-2 px-4 font-medium text-[#8B949E] bg-[#252A33]/50">Probables</th>
              <td className="py-2 px-4 font-mono">
                {data.probablePitchers?.length 
                  ? data.probablePitchers.map((p: any) => `${p.team}: ${p.name}`).join(' | ') 
                  : 'N/A'}
              </td>
            </tr>
            <tr className="border-b border-white/5">
              <th className="py-2 px-4 font-medium text-[#8B949E] bg-[#252A33]/50">Provider</th>
              <td className="py-2 px-4 font-mono">{data.odds?.provider || 'N/A'}</td>
            </tr>
            <tr className="border-b border-white/5">
              <th className="py-2 px-4 font-medium text-[#8B949E] bg-[#252A33]/50">Open Line</th>
              <td className="py-2 px-4 font-mono">
                ML: {data.lineMovement?.open?.moneyLine || 'N/A'} | Spr: {data.lineMovement?.open?.spread || 'N/A'} | O/U: {data.lineMovement?.open?.total || 'N/A'}
              </td>
            </tr>
            <tr className="border-b border-white/5">
              <th className="py-2 px-4 font-medium text-[#8B949E] bg-[#252A33]/50">Current Line</th>
              <td className="py-2 px-4 font-mono">
                ML: {data.lineMovement?.current?.moneyLine || 'N/A'} | Spr: {data.lineMovement?.current?.spread || 'N/A'} | O/U: {data.lineMovement?.current?.total || 'N/A'}
              </td>
            </tr>
            <tr className="border-b border-white/5">
              <th className="py-2 px-4 font-medium text-[#8B949E] bg-[#252A33]/50">Close Line</th>
              <td className="py-2 px-4 font-mono">
                ML: {data.lineMovement?.close?.moneyLine || 'N/A'} | Spr: {data.lineMovement?.close?.spread || 'N/A'} | O/U: {data.lineMovement?.close?.total || 'N/A'}
              </td>
            </tr>
            {data.situation && (
              <tr className="border-b border-white/5">
                <th className="py-2 px-4 font-medium text-[#8B949E] bg-[#252A33]/50">Situation</th>
                <td className="py-2 px-4 font-mono">
                  B: {data.situation.balls} S: {data.situation.strikes} O: {data.situation.outs} | 
                  On Base: {data.situation.runnersOnBase?.join(', ') || 'None'} | 
                  Pitcher: {data.situation.pitcher || 'N/A'} | Batter: {data.situation.batter || 'N/A'}
                </td>
              </tr>
            )}
            {data.recentPlays && data.recentPlays.length > 0 && (
              <tr className="border-b border-white/5">
                <th className="py-2 px-4 font-medium text-[#8B949E] bg-[#252A33]/50 align-top">Recent Plays</th>
                <td className="py-2 px-4 font-mono text-xs space-y-1">
                  {data.recentPlays.map((p: any, i: number) => (
                    <div key={i}>
                      <span className="text-[#8B949E]">[{p.period}]</span> {p.text} (Score: {p.awayScore}-{p.homeScore})
                    </div>
                  ))}
                </td>
              </tr>
            )}
            <tr>
              <th className="py-2 px-4 font-medium text-[#8B949E] bg-[#252A33]/50">Sources</th>
              <td className="py-2 px-4 font-mono text-[11px] text-[#8B949E]">
                {data.sourcePaths?.map((path: string, i: number) => (
                  <div key={i} className="truncate max-w-[400px]">{path}</div>
                ))}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};
