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
        setError("Missing event ID.");
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
      setError("Failed to load ledger data.");
      setLoading(false);
    }
  }, [dataString]);

  if (loading) {
    return (
      <div className="w-full bg-white/60 backdrop-blur-md border border-clay p-6 rounded-xl flex items-center justify-center shadow-glass-sm">
        <span className="text-taupe font-mono text-sm">Fetching ESPN Core Ledger...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="w-full bg-red-50/50 backdrop-blur-md border border-red-500/20 p-6 rounded-xl flex items-center justify-center shadow-glass-sm">
        <span className="text-red-600 font-mono text-sm">{error || "No data available."}</span>
      </div>
    );
  }

  return (
    <div className="w-full bg-white/60 backdrop-blur-xl border border-clay shadow-glass-sm rounded-xl flex flex-col overflow-hidden font-sans">
      <div className="p-4 border-b border-clay/50 bg-white/40 flex justify-between items-center">
        <div className="flex gap-2 items-center">
          <div className="w-2 h-2 rounded-full bg-[#E57A00]" />
          <h2 className="text-charcoal font-semibold text-sm tracking-wide uppercase">ESPN Core Ledger</h2>
        </div>
        <span className="text-taupe font-mono text-[10px] uppercase">ID: {data.eventId} / {data.status}</span>
      </div>
      
      <div className="p-0 overflow-x-auto">
        <table className="w-full text-left text-sm whitespace-nowrap text-ink">
          <tbody>
            <tr className="border-b border-black/5">
              <th className="py-2 px-4 font-medium text-taupe bg-black/5 w-1/4">Teams</th>
              <td className="py-2 px-4 font-mono">
                {data.teams?.map((t: any) => `${t.name} (${t.homeAway})`).join(' vs ')}
              </td>
            </tr>
            <tr className="border-b border-black/5">
              <th className="py-2 px-4 font-medium text-taupe bg-black/5">Venue</th>
              <td className="py-2 px-4 font-mono">{data.venue}</td>
            </tr>
            <tr className="border-b border-black/5">
              <th className="py-2 px-4 font-medium text-taupe bg-black/5">Records</th>
              <td className="py-2 px-4 font-mono">
                {Object.entries(data.records || {}).map(([team, rec]) => `${team}: ${rec}`).join(' | ')}
              </td>
            </tr>
            <tr className="border-b border-black/5">
              <th className="py-2 px-4 font-medium text-taupe bg-black/5">Probables</th>
              <td className="py-2 px-4 font-mono">
                {data.probablePitchers?.length 
                  ? data.probablePitchers.map((p: any) => `${p.team}: ${p.name}`).join(' | ') 
                  : 'N/A'}
              </td>
            </tr>
            <tr className="border-b border-black/5">
              <th className="py-2 px-4 font-medium text-taupe bg-black/5">Provider</th>
              <td className="py-2 px-4 font-mono">{data.odds?.provider || 'N/A'}</td>
            </tr>
            <tr className="border-b border-black/5">
              <th className="py-2 px-4 font-medium text-taupe bg-black/5">Open Line</th>
              <td className="py-2 px-4 font-mono">
                ML: {data.lineMovement?.open?.moneyLine || 'N/A'} | Spr: {data.lineMovement?.open?.spread || 'N/A'} | O/U: {data.lineMovement?.open?.total || 'N/A'}
              </td>
            </tr>
            <tr className="border-b border-black/5">
              <th className="py-2 px-4 font-medium text-taupe bg-black/5">Current Line</th>
              <td className="py-2 px-4 font-mono">
                ML: {data.lineMovement?.current?.moneyLine || 'N/A'} | Spr: {data.lineMovement?.current?.spread || 'N/A'} | O/U: {data.lineMovement?.current?.total || 'N/A'}
              </td>
            </tr>
            <tr className="border-b border-black/5">
              <th className="py-2 px-4 font-medium text-taupe bg-black/5">Close Line</th>
              <td className="py-2 px-4 font-mono">
                ML: {data.lineMovement?.close?.moneyLine || 'N/A'} | Spr: {data.lineMovement?.close?.spread || 'N/A'} | O/U: {data.lineMovement?.close?.total || 'N/A'}
              </td>
            </tr>
            {data.situation && (
              <tr className="border-b border-black/5">
                <th className="py-2 px-4 font-medium text-taupe bg-black/5">Situation</th>
                <td className="py-2 px-4 font-mono">
                  B: {data.situation.balls} S: {data.situation.strikes} O: {data.situation.outs} | 
                  On Base: {data.situation.runnersOnBase?.join(', ') || 'None'} | 
                  Pitcher: {data.situation.pitcher || 'N/A'} | Batter: {data.situation.batter || 'N/A'}
                </td>
              </tr>
            )}
            {data.recentPlays && data.recentPlays.length > 0 && (
              <tr className="border-b border-black/5">
                <th className="py-2 px-4 font-medium text-taupe bg-black/5 align-top">Recent Plays</th>
                <td className="py-2 px-4 font-mono text-xs space-y-1">
                  {data.recentPlays.map((p: any, i: number) => (
                    <div key={i}>
                      <span className="text-taupe">[{p.period}]</span> {p.text} (Score: {p.awayScore}-{p.homeScore})
                    </div>
                  ))}
                </td>
              </tr>
            )}
            <tr>
              <th className="py-2 px-4 font-medium text-taupe bg-black/5">Sources</th>
              <td className="py-2 px-4 font-mono text-[11px] text-taupe">
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
