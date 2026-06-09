import React from 'react';
import { motion } from 'framer-motion';

export interface BettingAngleProps {
  title: string;
  marketPrice: string | number;
  fairPrice: string | number;
  edgeSource: string;
  whyNow: string;
  riskFlag: string;
  onClick?: () => void;
}
export const IOSBettingCard: React.FC<BettingAngleProps> = ({
  title,
  marketPrice,
  fairPrice,
  edgeSource,
  whyNow,
  riskFlag,
  onClick
}) => {
  return (
    <div className="w-full max-w-sm mx-auto flex flex-col gap-3 font-sans">
      <span className="text-[10px] font-mono tracking-[0.18em] text-slate-500 uppercase ml-2">
        IDENTIFIED VALUE
      </span>
      <motion.button
        onClick={onClick}
        whileHover={{ scale: 0.99 }}
        whileTap={{ scale: 0.97 }}
        transition={{ type: "spring", stiffness: 500, damping: 35, mass: 1 }}
        className="relative w-full text-left overflow-hidden p-6 flex flex-col gap-6 bg-[#0a0a0a] border border-white/[0.04] rounded-2xl shadow-2xl transition-all duration-300 ease-out focus:outline-none"
      >
        {/* Row 1: Logo & Title */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* The Logo */}
            <div className="w-10 h-10 rounded-full border border-white/10 bg-white/5 flex items-center justify-center p-1.5 shrink-0">
               {/* We don't have the explicit logo URL passed to IOSBettingCard right now, so we will show a placeholder or map based on title. 
                   For now, extracting the first word to simulate logo lookup. */}
               <img 
                 src={`https://a.espncdn.com/i/teamlogos/mlb/500/scoreboard/${title.split(' ')[0].toLowerCase()}.png`}
                 onError={(e) => { e.currentTarget.style.display = 'none'; }}
                 alt="Logo"
                 className="w-full h-full object-contain"
               />
            </div>
            <h3 className="font-medium text-white/90 text-base tracking-tight">
              {title.replace(/\[.*?\]\s*/, '')}
            </h3>
          </div>
          {/* Pin Icon / Action */}
          <div className="w-6 h-6 flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-500">
              <path d="M12 2L12 10" />
              <path d="M12 14L12 22" />
              <path d="M9 5L15 5" />
              <path d="M8 10L16 10" />
            </svg>
          </div>
        </div>

        {/* Row 2: Rationale */}
        <p className="text-[13px] leading-[1.65] text-slate-400">
          {whyNow}
        </p>

        {/* Row 3: Stats */}
        <div className="grid grid-cols-2 gap-4 border-t border-white/[0.04] pt-4 mt-2">
          <div className="flex flex-col gap-1.5">
            <span className="text-[9px] font-mono tracking-widest uppercase text-slate-500">Line</span>
            <span className="font-mono text-white/90 text-sm">{marketPrice}</span>
          </div>
          <div className="flex flex-col gap-1.5 text-right">
            <span className="text-[9px] font-mono tracking-widest uppercase text-slate-500">Variance</span>
            <span className="font-mono text-white/90 text-sm">HIGH</span>
          </div>
        </div>

        {/* Row 4: Target Position */}
        <div className="flex flex-col gap-1.5 mt-2">
          <span className="text-[9px] font-mono tracking-widest uppercase text-slate-500">Target Position</span>
          <span className="text-white/90 font-medium text-sm">Back {title.replace(/\[.*?\]\s*/, '').split(' ')[0]}</span>
        </div>
      </motion.button>
      
      <div className="w-full text-right pr-2">
        <span className="text-[9px] font-mono tracking-[0.1em] text-slate-600 uppercase">
          SWIPE VERTICALLY TO DISMISS
        </span>
      </div>
    </div>
  );
};
