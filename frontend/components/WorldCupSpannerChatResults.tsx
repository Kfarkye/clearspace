import React, { useMemo } from 'react';
import { WorldCupSpannerMatchupCard } from './WorldCupSpannerMatchupCard';

interface WorldCupSpannerChatResultsProps {
  dataString: string;
}

export const WorldCupSpannerChatResults: React.FC<WorldCupSpannerChatResultsProps> = ({ dataString }) => {
  const data = useMemo(() => {
    try {
      let parsedStr = dataString.trim();
      if (parsedStr.startsWith('```')) {
        const match = parsedStr.match(/```[a-zA-Z_]*\n([\s\S]*?)(?:```|$)/);
        if (match) parsedStr = match[1];
      }
      return JSON.parse(parsedStr);
    } catch (e) {
      console.error('Failed to parse worldcupspannerresults', e);
      return null;
    }
  }, [dataString]);

  if (!data || !data.games || data.games.length === 0) {
    return (
      <div className="w-full bg-red-50/50 backdrop-blur-md border border-red-500/20 p-6 rounded-xl flex items-center justify-center shadow-glass-sm mt-4">
        <span className="text-red-600 font-bold font-mono text-sm">Failed to parse Spanner results or no games found.</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 my-6">
      <div className="bg-[#FAF9F6] border border-clay p-4 rounded-xl shadow-glass-sm">
        <h2 className="text-charcoal font-semibold text-sm tracking-wide uppercase flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-bronze animate-pulse" />
          {data.title || 'World Cup Spanner Results'}
        </h2>
        {data.query && (
          <p className="text-taupe font-mono text-[11px] mt-2 border-l-2 border-bronze/30 pl-2">
            QUERY: {data.query}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-4">
        {data.games.map((game: any, idx: number) => (
          <WorldCupSpannerMatchupCard key={idx} dataString={JSON.stringify(game)} />
        ))}
      </div>
    </div>
  );
};
