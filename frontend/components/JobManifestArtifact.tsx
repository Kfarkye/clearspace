import React from 'react';
import { motion } from 'framer-motion';
import { Activity, Server, Zap, Database } from 'lucide-react';

export const JobManifestArtifact: React.FC<{ dataString: string }> = ({ dataString }) => {
  let manifest: any = {};
  try {
    manifest = JSON.parse(dataString);
  } catch {
    return null;
  }

  const routeId = manifest.route_id || 'unknown';
  
  const getRouteDetails = () => {
    switch(routeId) {
      case 'sports_pipeline': 
        return <Activity size={14} className="text-emerald-400" strokeWidth={2} />;
      case 'workspace_pipeline': 
        return <Server size={14} className="text-[#C45C5C]" strokeWidth={2} />;
      case 'design_pipeline': 
        return <Zap size={14} className="text-sky-400" strokeWidth={2} />;
      default: 
        return <Database size={14} className="text-slate-400" strokeWidth={2} />;
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-3 w-fit mt-2 mb-4 px-3 py-2 bg-white/[0.02] border border-white/[0.04] rounded-full backdrop-blur-md shadow-sm"
    >
      <div className="flex items-center justify-center w-6 h-6 rounded-full bg-white/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
        {getRouteDetails()}
      </div>
      <div className="flex items-center pr-3">
        <span className="font-mono text-[11px] text-slate-400 animate-pulse tracking-widest">Thinking…</span>
      </div>
    </motion.div>
  );
};
