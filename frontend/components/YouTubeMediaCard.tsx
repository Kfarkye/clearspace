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
      className="w-full bg-ink border border-white/5 shadow-glass p-4 flex items-center gap-4 text-left transition-all duration-300 ease-out hover:border-white/20 hover:shadow-glass-hover focus:outline-none group rounded-2xl"
    >
      <div className="relative w-24 h-14 bg-charcoal border border-white/5 flex-shrink-0 overflow-hidden flex items-center justify-center shadow-inset rounded-lg">
        <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        <svg className="w-6 h-6 text-taupe group-hover:text-emerald transition-colors duration-300" fill="currentColor" viewBox="0 0 24 24">
          <path d="M8 5v14l11-7z" />
        </svg>
      </div>
      
      <div className="flex flex-col gap-1 overflow-hidden">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-emerald rounded-full animate-pulse"></span>
          <span className="font-mono text-[10px] text-taupe uppercase tracking-widest">YouTube Query</span>
        </div>
        <span className="font-sans text-sm text-sand font-medium truncate tracking-tight">
          {query}
        </span>
      </div>
    </button>
  );
};
