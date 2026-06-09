import React from 'react';
import { MlbSpannerMatchupCard } from './MlbSpannerMatchupCard';

interface MlbSpannerChatResultsProps {
  dataString?: string;
}

export const MlbSpannerChatResults: React.FC<MlbSpannerChatResultsProps> = ({ dataString }) => {
  let parsed = { title: 'Clearspace MLB Results', query: '', games: [] as { eventId: string }[] };
  
  try {
    let parsedStr = (dataString || '').trim();
    if (parsedStr.startsWith('```')) {
      const match = parsedStr.match(/```[a-zA-Z_]*\n([\s\S]*?)(?:```|$)/);
      if (match) parsedStr = match[1];
    }
    parsed = JSON.parse(parsedStr || '{}');
    console.log('[MlbSpannerChatResults] parsed payload', parsed);
  } catch (e) {
    console.error("Failed to parse mlbspannerresults payload", e);
  }

  const { title, query, games } = parsed;

  if (!games || games.length === 0) {
    return (
      <div className="w-full bg-white/60 backdrop-blur-xl border border-clay p-4 rounded-xl shadow-glass-sm flex flex-col">
        <h2 className="text-charcoal font-semibold text-sm mb-1">{title || 'MLB Results'}</h2>
        <span className="text-taupe text-xs italic">No Spanner context available for this query.</span>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      <div className="bg-white/60 backdrop-blur-xl border border-clay shadow-glass-sm rounded-xl p-4">
        <h2 className="text-charcoal font-bold text-sm tracking-wide uppercase">{title || 'Clearspace MLB Results'}</h2>
        {query && <div className="text-taupe font-mono text-[10px] mt-1 uppercase">Query context: {query}</div>}
      </div>
      
      <div className="flex flex-col gap-4">
        {games.map((game, idx) => {
          console.log('[MlbSpannerChatResults] rendering eventId', game.eventId);
          return <MlbSpannerMatchupCard key={idx} dataString={JSON.stringify({ eventId: game.eventId })} />;
        })}
      </div>
    </div>
  );
};
