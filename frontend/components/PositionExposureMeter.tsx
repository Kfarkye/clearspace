// ============================================================================
// PositionExposureMeter — Glassmorphic Live Bet Risk Gauge
//
// Design: Tactile precision instrument. Liquid mercury progress bar.
// Calculates pace, margin, and threat state from live telemetry.
// ============================================================================

import React, { useMemo } from 'react';
import { Activity, Shield } from 'lucide-react';
import { motion } from 'framer-motion';

export interface PositionExposureProps {
  betType: 'under' | 'over';
  line: number;
  currentTotal: number;
  inning: string;
}

/**
 * A tactile, high-fidelity visualization of live bet risk.
 * Calculates pace automatically and renders a physical progress threshold.
 */
export const PositionExposureMeter: React.FC<PositionExposureProps> = ({
  betType,
  line,
  currentTotal,
  inning,
}) => {
  const progress = useMemo(() => {
    return Math.min(100, Math.max(0, (currentTotal / line) * 100));
  }, [currentTotal, line]);

  const isDanger = betType === 'under' ? progress > 75 : progress < 25;
  const isCritical = betType === 'under' ? progress >= 100 : progress === 0 && inning !== '1';

  const pace = useMemo(() => {
    const innNum = parseInt(inning.replace(/[^0-9]/g, ''), 10) || 1;
    return ((currentTotal / innNum) * 9).toFixed(1);
  }, [currentTotal, inning]);

  const margin = Math.max(0, line - currentTotal);

  return (
    <div className="relative w-full max-w-sm p-5 overflow-hidden bg-white/60 backdrop-blur-xl border border-black/[0.04] rounded-[20px] shadow-[0_8px_32px_rgba(0,0,0,0.03)]">
      {/* Ambient glow — subdued, not distracting */}
      <div className={`absolute -top-10 -right-10 w-32 h-32 rounded-full blur-[40px] opacity-[0.12] transition-colors duration-700 ${isDanger ? 'bg-[#FF9500]' : 'bg-[#007AFF]'}`} />

      <div className="relative z-10 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {isDanger ? (
              <Activity size={14} className="text-[#FF9500]" strokeWidth={2.5} />
            ) : (
              <Shield size={14} className="text-[#007AFF]" strokeWidth={2.5} />
            )}
            <span className="text-[12px] font-semibold text-[#1D1D1F]/80 tracking-tight uppercase">
              Exposure Risk
            </span>
            <div className="px-1.5 py-0.5 bg-black/[0.04] rounded-[4px] border border-black/[0.03]">
              <span className="text-[10px] font-bold text-[#1D1D1F]/60 tracking-wider uppercase">
                {betType} {line}
              </span>
            </div>
          </div>
          <div className="flex items-baseline gap-1 tabular-nums font-mono text-[#1D1D1F]">
            <span className="text-[16px] font-semibold">{currentTotal}</span>
            <span className="text-[11px] text-black/40 font-medium">/ {line}</span>
          </div>
        </div>

        {/* Physical Track — liquid mercury aesthetic */}
        <div className="relative w-full h-1.5 bg-black/[0.05] rounded-full overflow-hidden shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)]">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ type: 'spring', stiffness: 90, damping: 15, mass: 0.8 }}
            className={`absolute left-0 top-0 bottom-0 rounded-full transition-colors duration-500 ${
              isCritical
                ? 'bg-[#FF3B30] shadow-[0_0_8px_rgba(255,59,48,0.3)]'
                : isDanger
                  ? 'bg-[#FF9500] shadow-[0_0_8px_rgba(255,149,0,0.3)]'
                  : 'bg-[#007AFF] shadow-[0_0_8px_rgba(0,122,255,0.2)]'
            }`}
          />
          {/* Target line marker */}
          <div
            className="absolute top-0 bottom-0 w-px bg-[#1D1D1F]/30 z-20"
            style={{ left: '99%' }}
          />
        </div>

        {/* Metrics Footer */}
        <div className="flex items-center justify-between text-[11px] font-medium tracking-tight px-0.5">
          <span className="text-black/50">
            Pace: <strong className="text-[#1D1D1F]/80 font-mono ml-0.5">{pace}</strong>
          </span>
          <span className="text-black/50">
            Margin: <strong className="text-[#1D1D1F]/80 font-mono ml-0.5">{margin}</strong>
          </span>
        </div>
      </div>
    </div>
  );
};
