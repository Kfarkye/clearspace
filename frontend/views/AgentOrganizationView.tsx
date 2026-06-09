import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Briefcase, Trophy, PenNib, Coin } from '@phosphor-icons/react';

const AGENTS = [
  {
    id: 'workspace',
    name: 'Workspace',
    description: 'Integrates with your calendar and inbox to manage your schedule, draft responses, and organize your day.',
    icon: <Briefcase size={22} weight="duotone" className="text-[#C45C5C]" />,
    tools: ['Read Emails', 'Manage Calendar', 'Draft Responses'],
    isActive: true,
  },
  {
    id: 'sports',
    name: 'Sports Data',
    description: 'Pulls real-time lines, live scores, and player prop analytics directly from the Spanner sports ledger.',
    icon: <Trophy size={22} weight="duotone" className="text-emerald-400" />,
    tools: ['Live Scores', 'Player Props', 'Standings'],
    isActive: true,
  },
  {
    id: 'design',
    name: 'UI Synthesis',
    description: 'Generates deterministic React components and styling structures for dynamic Server-Driven UIs.',
    icon: <PenNib size={22} weight="duotone" className="text-sky-400" />,
    tools: ['Component Generation', 'Design Tokens'],
    isActive: false,
  },
  {
    id: 'crypto',
    name: 'Market Intel',
    description: 'Tracks on-chain movements, wallet balances, and real-time token pricing across major exchanges.',
    icon: <Coin size={22} weight="duotone" className="text-slate-400" />,
    tools: ['Market Prices', 'Wallet Tracking'],
    isActive: false,
  }
];

// Extracted Card component to handle individual mouse tracking for the spotlight effect
const AgentCard = ({ agent, index }: { agent: typeof AGENTS[0], index: number }) => {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMousePosition({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 30, filter: "blur(12px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ delay: index * 0.08, type: "spring", stiffness: 280, damping: 28 }}
      onMouseMove={handleMouseMove}
      className="group relative overflow-hidden bg-[#111113]/60 backdrop-blur-2xl border border-white/[0.04] rounded-[24px] p-8 shadow-2xl hover:border-white/10 hover:shadow-[0_8px_32px_rgba(0,0,0,0.4)] transition-all duration-400 ease-out"
    >
      {/* ─── Spotlight Hover Effect ─────────────────────────────────────── */}
      <div 
        className="pointer-events-none absolute -inset-px opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-0"
        style={{
          background: `radial-gradient(600px circle at ${mousePosition.x}px ${mousePosition.y}px, rgba(255,255,255,0.03), transparent 40%)`
        }}
      />

      {/* Subtle top-inner highlight for depth */}
      <div className="absolute inset-0 rounded-[24px] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] pointer-events-none transition-shadow duration-500 z-0" />

      {/* Status Indicator (Top Right) */}
      {agent.isActive && (
        <motion.div 
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 500, delay: 0.2 + (index * 0.05) }}
          className="absolute top-7 right-7 w-2 h-2 bg-emerald-400 rounded-full shadow-[0_0_12px_rgba(52,211,153,0.6)] z-10" 
        />
      )}

      <div className="flex items-center gap-4 mb-5 relative z-10">
        <div className="relative w-12 h-12 rounded-2xl bg-white/[0.02] border border-white/[0.04] flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] transition-colors duration-500">
          {agent.icon}
        </div>
        <h2 className="text-[17px] font-medium text-white/90 tracking-tight">{agent.name}</h2>
      </div>

      <p className="text-[14px] leading-[1.65] text-slate-400 mb-8 font-light pr-4 relative z-10">
        {agent.description}
      </p>

      <div className="flex flex-wrap gap-2.5 relative z-10">
        {agent.tools.map(tool => (
          <span key={tool} className="px-3.5 py-1.5 bg-white/[0.02] border border-white/[0.04] rounded-full text-[12px] font-mono tracking-wide text-slate-500 hover:bg-white/[0.06] hover:text-white transition-all duration-300 cursor-default">
            {tool}
          </span>
        ))}
      </div>
    </motion.div>
  );
};

const AgentOrganizationView: React.FC = () => {
  return (
    <div className="flex flex-col h-full bg-[#000000] text-slate-200 p-6 sm:p-12 overflow-y-auto no-scrollbar relative">
      
      {/* 1. Cinematic Film Grain Texture (Overlay) */}
      <div 
        className="fixed inset-0 opacity-[0.04] pointer-events-none z-50 mix-blend-overlay"
        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }}
      />

      {/* Deep ambient background mesh */}
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.015)_0%,transparent_100%)] pointer-events-none z-0" />

      <div className="max-w-[1024px] w-full mx-auto relative z-10 pt-4">
        
        <motion.header 
          initial={{ opacity: 0, y: -10, filter: "blur(8px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="mb-12 relative z-10"
        >
          <h1 className="text-[32px] font-semibold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white to-white/50 pb-1">
            Agents
          </h1>
          <p className="text-[15px] text-slate-400 mt-1 font-light tracking-wide">
            Manage your domain specialists and their capabilities.
          </p>
        </motion.header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {AGENTS.map((agent, i) => (
            <AgentCard key={agent.id} agent={agent} index={i} />
          ))}
        </div>

      </div>
    </div>
  );
};

export default AgentOrganizationView;
