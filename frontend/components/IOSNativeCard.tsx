import React from 'react';
import { motion } from 'framer-motion';

export interface NativeCardProps {
  title: string;
  subtitle: string;
  metadata: string;
  onClick?: () => void;
  rightAccessory?: React.ReactNode;
}

export const IOSNativeCard: React.FC<NativeCardProps> = ({ 
  title, 
  subtitle, 
  metadata, 
  onClick,
  rightAccessory
}) => {
  const CardWrapper = onClick ? motion.button : motion.div;
  
  return (
    <CardWrapper
      onClick={onClick}
      // PHYSICS: Never use linear tweens. Use stiff springs for immediate tactile response.
      whileHover={onClick ? { scale: 0.995 } : undefined}
      whileTap={onClick ? { scale: 0.97 } : undefined}
      transition={{ 
        type: "spring", 
        stiffness: 500, 
        damping: 35, 
        mass: 1 
      }}
      className="
        relative w-full text-left overflow-hidden
        p-4 flex flex-col gap-1
        bg-charcoal/60 backdrop-blur-2xl
        border border-white/5 
        shadow-glass hover:shadow-glass-hover
        transition-colors duration-300 ease-out
        focus:outline-none focus-visible:ring-1 focus-visible:ring-white/20
      "
    >
      {/* SPATIAL RHYTHM: Absolute positioning for the highlight to simulate iOS glass reflection */}
      <div className="absolute inset-0 bg-gradient-to-b from-white/[0.04] to-transparent pointer-events-none" />
      
      <div className="flex justify-between items-baseline w-full relative z-10">
        <div className="flex flex-col gap-1 w-full">
          <div className="flex justify-between items-baseline w-full">
            {/* TYPOGRAPHIC DOMINANCE: Tight tracking on headers, muted secondary data */}
            <h3 className="font-sans text-sand text-lg font-medium tracking-tight">
              {title}
            </h3>
            <div className="flex items-center gap-2">
              <span className="font-mono text-taupe text-[10px] uppercase tracking-widest">
                {metadata}
              </span>
              {rightAccessory && <div className="ml-2">{rightAccessory}</div>}
            </div>
          </div>
          <p className="font-sans text-taupe text-sm leading-snug">
            {subtitle}
          </p>
        </div>
      </div>
    </CardWrapper>
  );
};
