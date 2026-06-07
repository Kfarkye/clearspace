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
      <div className="flex items-center justify-center p-8 bg-white border border-charcoal/10 shadow-sm rounded-2xl">
         <div className="w-5 h-5 border-2 border-charcoal/20 border-t-charcoal rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto my-4 space-y-4 font-sans">
      <div className="flex items-center space-x-3 mb-6">
        <div className="p-2 bg-alabaster border border-charcoal/10 rounded-xl shadow-sm">
          <Target className="w-5 h-5 text-charcoal" />
        </div>
        <h3 className="text-xl font-medium text-charcoal tracking-tight">Live Player Props</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {parsed.props.map((prop, idx) => (
          <motion.div
            key={`${prop.playerId}-${prop.statName}-${idx}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05, duration: 0.3, ease: 'easeOut' }}
            className="relative overflow-hidden rounded-2xl bg-white border border-charcoal/10 p-5 shadow-sm transition-all"
          >
            <div className="flex items-start justify-between relative z-10">
              <div className="flex items-center space-x-4">
                <div className="relative">
                  <div className="w-14 h-14 rounded-full overflow-hidden bg-alabaster border border-charcoal/10 p-0.5 shadow-sm">
                    {prop.headshot ? (
                      <img src={prop.headshot} alt={prop.playerName} className="w-full h-full object-cover rounded-full" />
                    ) : (
                      <div className="w-full h-full bg-white rounded-full flex items-center justify-center">
                        <span className="text-taupe text-xs font-medium">{prop.teamAbbreviation}</span>
                      </div>
                    )}
                  </div>
                  <div 
                    className="absolute -bottom-1 -right-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md text-white shadow-sm border border-black/10"
                    style={{ backgroundColor: prop.teamColor || '#333' }}
                  >
                    {prop.teamAbbreviation}
                  </div>
                </div>

                <div>
                  <h4 className="text-lg font-medium text-charcoal leading-tight">{prop.playerName}</h4>
                  <div className="flex items-center text-sm text-taupe mt-0.5 font-medium space-x-1.5">
                    <Activity className="w-3.5 h-3.5 opacity-70" />
                    <span>{prop.statName}</span>
                  </div>
                </div>
              </div>

              <div className="text-right">
                <div className="text-3xl font-medium text-charcoal tracking-tight">
                  {prop.propLine}
                </div>
                <div className="text-[10px] uppercase tracking-widest text-taupe font-medium mt-1">Line</div>
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-charcoal/10 grid grid-cols-2 gap-3 relative z-10">
              <button 
                className="group relative flex flex-col items-center justify-center py-2.5 rounded-xl bg-white border border-charcoal/10 hover:border-charcoal/20 hover:bg-alabaster transition-all overflow-hidden shadow-sm outline-none active:scale-[0.98]"
              >
                <div className="flex items-center space-x-1.5 relative z-10 text-emerald-600 font-medium text-sm tracking-wide">
                  <TrendingUp className="w-4 h-4" />
                  <span>{prop.overPrice || 'MORE'}</span>
                </div>
              </button>
              
              <button 
                className="group relative flex flex-col items-center justify-center py-2.5 rounded-xl bg-white border border-charcoal/10 hover:border-charcoal/20 hover:bg-alabaster transition-all overflow-hidden shadow-sm outline-none active:scale-[0.98]"
              >
                <div className="flex items-center space-x-1.5 relative z-10 text-rose-600 font-medium text-sm tracking-wide">
                  <TrendingDown className="w-4 h-4" />
                  <span>{prop.underPrice || 'LESS'}</span>
                </div>
              </button>
            </div>
            
            <div className="mt-4 flex items-center justify-between px-1">
               <span className="text-xs font-medium text-taupe">Current: <span className="text-charcoal font-medium">{prop.currentValue}</span></span>
               {prop._isFallback && (
                 <span className="text-[10px] px-1.5 py-0.5 rounded border border-charcoal/10 bg-alabaster text-taupe shadow-sm">Proj</span>
               )}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
};
