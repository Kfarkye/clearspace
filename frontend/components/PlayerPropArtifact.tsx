import React from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Target, Activity } from 'lucide-react';

export interface PlayerProp {
  playerId: string;
  playerName: string;
  headshot: string;
  teamAbbreviation: string;
  teamColor: string;
  statName: string;
  currentValue: number;
  propLine: number;
  overPrice: string;
  underPrice: string;
  _isFallback?: boolean;
}

export interface PlayerPropArtifactData {
  gameId: string;
  props: PlayerProp[];
}

interface PlayerPropArtifactProps {
  dataString: string;
}

export const PlayerPropArtifact: React.FC<PlayerPropArtifactProps> = ({ dataString }) => {
  const lastValidData = React.useRef<PlayerPropArtifactData | null>(null);

  const parsed = React.useMemo(() => {
    try {
      const clean = dataString.replace(/^```[a-zA-Z]*\n?/i, '').replace(/\n?```$/i, '').trim().replace(/,\s*([\]}])/g, '$1');
      const result = JSON.parse(clean);
      if (result && result.props && result.props.length > 0) {
        lastValidData.current = result;
      }
      return lastValidData.current;
    } catch (e) {
      return lastValidData.current;
    }
  }, [dataString]);

  if (!parsed || !parsed.props || parsed.props.length === 0) {
    return (
      <div className="flex items-center justify-center p-8 bg-white/5 border border-white/10 rounded-2xl">
         <div className="w-5 h-5 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto my-4 space-y-4">
      <div className="flex items-center space-x-3 mb-6">
        <div className="p-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-lg">
          <Target className="w-5 h-5 text-white" />
        </div>
        <h3 className="text-xl font-bold text-white tracking-tight">Live Player Props</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {parsed.props.map((prop, idx) => (
          <motion.div
            key={`${prop.playerId}-${prop.statName}-${idx}`}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05, duration: 0.4, type: 'spring', stiffness: 200, damping: 20 }}
            whileHover={{ y: -2, scale: 1.01 }}
            className="relative overflow-hidden rounded-2xl bg-white/5 border border-white/10 p-5 backdrop-blur-xl shadow-xl transition-all"
            style={{ 
              boxShadow: `0 4px 30px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.1)`
            }}
          >
            {/* Ambient background glow based on team color */}
            <div 
              className="absolute -top-20 -right-20 w-40 h-40 rounded-full blur-[60px] opacity-20 pointer-events-none"
              style={{ backgroundColor: prop.teamColor || '#8B5CF6' }}
            />

            <div className="flex items-start justify-between relative z-10">
              <div className="flex items-center space-x-4">
                <div className="relative">
                  <div className="w-14 h-14 rounded-full overflow-hidden bg-gradient-to-b from-white/10 to-transparent border border-white/20 p-0.5">
                    {prop.headshot ? (
                      <img src={prop.headshot} alt={prop.playerName} className="w-full h-full object-cover rounded-full" />
                    ) : (
                      <div className="w-full h-full bg-white/5 rounded-full flex items-center justify-center">
                        <span className="text-white/50 text-xs font-bold">{prop.teamAbbreviation}</span>
                      </div>
                    )}
                  </div>
                  <div 
                    className="absolute -bottom-1 -right-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md text-white shadow-sm border border-white/20"
                    style={{ backgroundColor: prop.teamColor || '#333' }}
                  >
                    {prop.teamAbbreviation}
                  </div>
                </div>

                <div>
                  <h4 className="text-lg font-bold text-white leading-tight">{prop.playerName}</h4>
                  <div className="flex items-center text-sm text-white/60 mt-0.5 font-medium space-x-1.5">
                    <Activity className="w-3.5 h-3.5 opacity-70" />
                    <span>{prop.statName}</span>
                  </div>
                </div>
              </div>

              <div className="text-right">
                <div className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-white/70">
                  {prop.propLine}
                </div>
                <div className="text-[10px] uppercase tracking-wider text-white/40 font-bold">Line</div>
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-white/5 grid grid-cols-2 gap-3 relative z-10">
              <motion.button 
                whileTap={{ scale: 0.96 }}
                className="group relative flex flex-col items-center justify-center py-2.5 rounded-xl bg-gradient-to-b from-white/5 to-white/10 border border-white/10 hover:border-emerald-500/50 hover:bg-emerald-500/10 transition-all overflow-hidden"
              >
                <div className="absolute inset-0 bg-emerald-500/20 opacity-0 group-hover:opacity-100 transition-opacity blur-md" />
                <div className="flex items-center space-x-1.5 relative z-10 text-emerald-400 font-bold text-sm tracking-wide">
                  <TrendingUp className="w-4 h-4" />
                  <span>{prop.overPrice || 'MORE'}</span>
                </div>
              </motion.button>
              
              <motion.button 
                whileTap={{ scale: 0.96 }}
                className="group relative flex flex-col items-center justify-center py-2.5 rounded-xl bg-gradient-to-b from-white/5 to-white/10 border border-white/10 hover:border-rose-500/50 hover:bg-rose-500/10 transition-all overflow-hidden"
              >
                <div className="absolute inset-0 bg-rose-500/20 opacity-0 group-hover:opacity-100 transition-opacity blur-md" />
                <div className="flex items-center space-x-1.5 relative z-10 text-rose-400 font-bold text-sm tracking-wide">
                  <TrendingDown className="w-4 h-4" />
                  <span>{prop.underPrice || 'LESS'}</span>
                </div>
              </motion.button>
            </div>
            
            <div className="mt-3 flex items-center justify-between px-1">
               <span className="text-xs font-medium text-white/40">Current: <span className="text-white/80">{prop.currentValue}</span></span>
               {prop._isFallback && (
                 <span className="text-[10px] px-1.5 py-0.5 rounded border border-white/10 bg-white/5 text-white/40">Proj</span>
               )}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
};
