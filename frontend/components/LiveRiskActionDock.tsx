// ============================================================================
// LiveRiskActionDock — Inline Position Evaluator
//
// Design: Eliminates the conversational loop. The user enters their position
// directly into an inline input, which constructs a structured actuarial
// prompt and fires it as a single-shot execution.
//
// Style: Matches ScoreboardArtifact's ActionPill system — spring physics,
// neutral monochrome, glassmorphic input overlay.
// ============================================================================

import React, { useState, useRef, useEffect } from 'react';
import { Calculator, LineChart, TrendingUp, User } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Apple-esque spring (matches ScoreboardArtifact)
const SPRING = { type: 'spring' as const, bounce: 0, duration: 0.35, mass: 0.8, damping: 18 };

interface GameTelemetry {
  away_team?: { abbr?: string; name?: string; score?: number | string };
  home_team?: { abbr?: string; name?: string; score?: number | string };
  period?: string;
  situation?: {
    onFirst?: boolean;
    onSecond?: boolean;
    onThird?: boolean;
    outs?: number;
    lastPlay?: string;
    balls?: number;
    strikes?: number;
  };
}

interface LiveRiskActionDockProps {
  game: GameTelemetry;
  matchupName: string;
  onAction: (prompt: string) => void;
}

/** Pill button — matches existing ActionPill physics */
const DockPill = ({ icon: Icon, label, onClick }: { icon: any; label: string; onClick: () => void }) => (
  <motion.button
    whileHover={{ backgroundColor: 'rgba(0,0,0,0.04)' }}
    whileTap={{ scale: 0.95 }}
    onClick={onClick}
    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white border border-black/[0.06] shadow-[0_2px_8px_rgba(0,0,0,0.02)] shrink-0 transition-colors"
  >
    <Icon size={12} className="text-[#1D1D1F]/60" strokeWidth={2.5} />
    <span className="text-[11.5px] font-semibold tracking-tight text-[#1D1D1F]/80">{label}</span>
  </motion.button>
);

export const LiveRiskActionDock: React.FC<LiveRiskActionDockProps> = ({
  game,
  matchupName,
  onAction,
}) => {
  const [showInput, setShowInput] = useState(false);
  const [position, setPosition] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus when input appears
  useEffect(() => {
    if (showInput) inputRef.current?.focus();
  }, [showInput]);

  const submitPosition = (e: React.FormEvent) => {
    e.preventDefault();
    if (!position.trim()) return;

    const awayScore = Number(game.away_team?.score) || 0;
    const homeScore = Number(game.home_team?.score) || 0;
    const currentTotal = awayScore + homeScore;

    // Build situation text from live telemetry
    let sitText = 'Bases empty, no outs.';
    if (game.situation) {
      const bases = [
        game.situation.onFirst ? '1st' : '',
        game.situation.onSecond ? '2nd' : '',
        game.situation.onThird ? '3rd' : '',
      ].filter(Boolean).join(' & ');

      sitText = `${bases ? `Runners on ${bases}` : 'Bases empty'}, ${game.situation.outs ?? 0} out(s).`;
      if (game.situation.balls != null && game.situation.strikes != null) {
        sitText += ` Count: ${game.situation.balls}-${game.situation.strikes}.`;
      }
    }

    // Structured actuarial prompt — single-shot, no conversation
    const prompt = `[LIVE POSITION EXPOSURE]
Matchup: ${matchupName}
Position: ${position}

[TELEMETRY]
Score: ${game.away_team?.abbr || 'AWAY'} ${awayScore} – ${game.home_team?.abbr || 'HOME'} ${homeScore}
Total Runs: ${currentTotal}
Inning: ${game.period || 'Unknown'}
Situation: ${sitText}
Last Play: ${game.situation?.lastPlay || 'N/A'}

TASK: Execute a ruthless actuarial evaluation of this position against the live telemetry.
1. PACE: Calculate projected final total based on current inning and scoring rate.
2. IMMEDIATE THREAT: Analyze the live situation (runners, outs, count) relative to the ticket.
3. VERDICT: Return a definitive HOLD, PARTIAL HEDGE, or CASH OUT with exact mathematical reasoning.
Format output strictly as a market intelligence briefing using the bettingangles artifact format. Do not introduce yourself.`;

    onAction(prompt);
    setShowInput(false);
    setPosition('');
  };

  return (
    <div className="mt-5 pt-4 border-t border-black/[0.04] pb-1">
      <AnimatePresence mode="wait">
        {showInput ? (
          <motion.form
            key="input"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={SPRING}
            onSubmit={submitPosition}
            className="flex gap-2 items-center"
          >
            <input
              ref={inputRef}
              type="text"
              placeholder="Enter position (e.g. Under 8.5)"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') { setShowInput(false); setPosition(''); } }}
              className="flex-1 px-3.5 py-2 text-[13px] font-medium bg-black/[0.03] border border-black/[0.06] rounded-[10px] focus:outline-none focus:ring-1 focus:ring-black/20 placeholder:text-black/30 text-[#1D1D1F] tracking-tight transition-all"
            />
            <motion.button
              type="submit"
              whileTap={{ scale: 0.95 }}
              className="px-4 py-2 bg-[#1D1D1F] text-white text-[12px] font-semibold tracking-tight rounded-[10px] hover:bg-[#1D1D1F]/85 transition-colors shrink-0"
            >
              Audit Risk
            </motion.button>
            <motion.button
              type="button"
              whileTap={{ scale: 0.95 }}
              onClick={() => { setShowInput(false); setPosition(''); }}
              className="px-3 py-2 text-[12px] font-medium text-black/40 hover:text-black/60 transition-colors shrink-0"
            >
              Cancel
            </motion.button>
          </motion.form>
        ) : (
          <motion.div
            key="pills"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={SPRING}
            className="flex gap-2 overflow-x-auto no-scrollbar mask-fade-right"
          >
            <DockPill icon={Calculator} label="Evaluate Position" onClick={() => setShowInput(true)} />
            <DockPill icon={LineChart} label="Matchup Analysis" onClick={() => onAction(`Analyze the matchup between ${matchupName}.`)} />
            <DockPill icon={TrendingUp} label="Live Betting Value" onClick={() => onAction(`What is the live betting value for ${matchupName}?`)} />
            <DockPill icon={User} label="Player Props" onClick={() => onAction(`Find the best player props for ${matchupName}.`)} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
