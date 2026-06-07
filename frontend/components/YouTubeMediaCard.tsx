import React from 'react';

interface YouTubeMediaProps {
  query: string;
}

export const YouTubeMediaCard: React.FC<YouTubeMediaProps> = ({ query }) => {
  const handleSearch = () => {
    window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, '_blank');
  };

  return (
    <button 
      onClick={handleSearch}
      className="w-full bg-white border border-charcoal/10 shadow-sm p-4 flex items-center gap-4 text-left transition-all duration-300 ease-out hover:bg-alabaster hover:border-charcoal/20 focus:outline-none group rounded-2xl outline-none active:scale-[0.98]"
    >
      <div className="relative w-24 h-14 bg-alabaster border border-charcoal/10 flex-shrink-0 overflow-hidden flex items-center justify-center rounded-lg">
        <svg className="w-6 h-6 text-charcoal/60 group-hover:text-emerald-600 transition-colors duration-300" fill="currentColor" viewBox="0 0 24 24">
          <path d="M8 5v14l11-7z" />
        </svg>
      </div>
      
      <div className="flex flex-col gap-1 overflow-hidden">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-emerald-600 rounded-full animate-pulse"></span>
          <span className="font-mono text-[10px] text-taupe uppercase tracking-widest">YouTube Query</span>
        </div>
        <span className="font-sans text-sm text-charcoal font-medium truncate tracking-tight">
          {query}
        </span>
      </div>
    </button>
  );
};
