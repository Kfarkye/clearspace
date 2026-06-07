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
    <motion.button
      onClick={onClick}
      // PHYSICS: Stiff springs for immediate, hardware-like tactile feedback.
      whileHover={{ scale: 0.99 }}
      whileTap={{ scale: 0.96 }}
      transition={{ type: "spring", stiffness: 500, damping: 35, mass: 1 }}
      className="
        relative w-full text-left overflow-hidden
        p-5 flex flex-col gap-4
        bg-white/60 backdrop-blur-3xl
        border border-clay rounded-[24px]
        shadow-glass hover:shadow-glass-hover
        transition-all duration-300 ease-out
        focus:outline-none focus-visible:ring-2 focus-visible:ring-charcoal/20
      "
    >
      {/* SPATIAL RHYTHM: The Glare. Simulates light hitting a physical glass surface. */}
      <div className="absolute inset-0 bg-gradient-to-b from-white/50 to-transparent pointer-events-none rounded-[24px]" />
      
      {/* HIERARCHY 1: The Intent & The Price */}
      <div className="flex justify-between items-start w-full relative z-10">
        <div className="flex flex-col gap-1 max-w-[70%]">
          <span className="font-mono text-taupe text-[10px] uppercase tracking-widest">
            {edgeSource || 'Market Edge'}
          </span>
          <h3 className="font-sans text-charcoal text-xl font-medium tracking-tight leading-snug">
            {title}
          </h3>
        </div>
        
        <div className="flex flex-col items-end gap-0.5">
          <span className="font-mono text-emerald text-2xl tracking-tighter">
            {marketPrice ? (String(marketPrice).startsWith('+') || String(marketPrice).startsWith('-') ? marketPrice : `${marketPrice > 0 ? '+' : ''}${marketPrice}`) : 'N/A'}
          </span>
          {fairPrice && (
            <span className="font-mono text-taupe text-[10px] uppercase tracking-widest">
              Fair: {fairPrice}
            </span>
          )}
        </div>
      </div>

      {/* HIERARCHY 2: The Context (Subtractive Design - only what matters) */}
      <div className="relative z-10 pt-4 border-t border-clay/50 flex flex-col gap-3">
        <p className="font-sans text-taupe text-sm leading-relaxed">
          {whyNow}
        </p>
        
        {/* THE SWEAT: Graceful handling of risk flags with muted, yet distinct visual weight */}
        {riskFlag && (
          <div className="flex items-start gap-2 p-3 bg-sand/80 rounded-xl border border-clay">
            <div className="w-1.5 h-1.5 rounded-full bg-charcoal/40 mt-1.5 flex-shrink-0 animate-breathe" />
            <p className="font-sans text-charcoal/80 text-xs leading-snug">
              {riskFlag}
            </p>
          </div>
        )}
      </div>
    </motion.button>
  );
};
