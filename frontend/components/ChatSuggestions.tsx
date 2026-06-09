import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { EnvelopeSimple, FileText, CalendarBlank, MapPin } from '@phosphor-icons/react';

const SUGGESTIONS = [
  { 
    id: 'inbox', 
    text: 'Summarize my inbox', 
    description: 'Scan your unread emails and automatically draft suggested responses.',
    icon: <EnvelopeSimple size={22} weight="duotone" className="text-sky-400" />, 
    delay: 0.1 
  },
  { 
    id: 'document', 
    text: 'Find a document', 
    description: 'Search across your connected Workspace drives for files and context.',
    icon: <FileText size={22} weight="duotone" className="text-purple-400" />, 
    delay: 0.15 
  },
  { 
    id: 'calendar', 
    text: 'Check my calendar', 
    description: 'Review upcoming meetings and block out focus time.',
    icon: <CalendarBlank size={22} weight="duotone" className="text-emerald-400" />, 
    delay: 0.2 
  },
  { 
    id: 'place', 
    text: 'Find a place', 
    description: 'Locate nearby points of interest and get real-time directions.',
    icon: <MapPin size={22} weight="duotone" className="text-[#C45C5C]" />, 
    delay: 0.25 
  }
];

// Extracted to handle the spotlight effect per-card
const SuggestionCard: React.FC<{ s: typeof SUGGESTIONS[0], onSelect: (t: string) => void }> = ({ s, onSelect }) => {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMousePosition({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  return (
    <motion.button
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: s.delay, type: 'spring', stiffness: 300, damping: 25 }}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => onSelect(s.text)}
      onMouseMove={handleMouseMove}
      className="group relative overflow-hidden bg-[#111113]/60 backdrop-blur-2xl border border-white/[0.04] rounded-[24px] p-8 cursor-pointer text-left transition-all duration-400 ease-out hover:border-white/10 hover:shadow-[0_8px_32px_rgba(0,0,0,0.4)]"
    >
      {/* Spotlight Hover Effect */}
      <div 
        className="pointer-events-none absolute -inset-px opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-0"
        style={{
          background: `radial-gradient(600px circle at ${mousePosition.x}px ${mousePosition.y}px, rgba(255,255,255,0.03), transparent 40%)`
        }}
      />

      {/* Subtle top-inner highlight for depth */}
      <div className="absolute inset-0 rounded-[24px] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] pointer-events-none transition-shadow duration-500 z-0" />
      
      <div className="flex items-center gap-4 mb-3 relative z-10">
        <div className="relative w-12 h-12 rounded-2xl bg-white/[0.02] border border-white/[0.04] flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] transition-colors duration-500 group-hover:bg-white/[0.04]">
          {s.icon}
        </div>
        <h2 className="text-[16px] font-medium text-white/90 tracking-tight group-hover:text-white transition-colors">{s.text}</h2>
      </div>

      <p className="text-[13px] leading-[1.6] text-slate-400 font-light pr-2 relative z-10 group-hover:text-slate-300 transition-colors">
        {s.description}
      </p>
    </motion.button>
  );
};

export const ChatSuggestions: React.FC<{ onSelect: (text: string) => void }> = ({ onSelect }) => {
  return (
    <div className="w-full max-w-3xl mx-auto px-4 mt-auto pb-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {SUGGESTIONS.map((s) => (
          <SuggestionCard key={s.id} s={s} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
};
