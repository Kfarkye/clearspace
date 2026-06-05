// ============================================================================
// LicensingArtifact — Premium Regulatory Guide
// Design: Apple Wallet / visionOS aesthetic. Deep materiality.
// Polish: Zero bloat, DRY architecture, SWR stream-safe, fluid physics.
// ============================================================================

import React, { useMemo, useRef } from 'react';
import { 
  ShieldCheck, BookOpen, Clock, Award, DollarSign, 
  CheckCircle2, Building2, ArrowUpRight, AlertTriangle 
} from 'lucide-react';
import { motion } from 'framer-motion';

// ─── Interfaces & Physics ──────────────────────────────────────────────────

interface LicensingData {
  state?: string;
  profession?: string;
  agency_name?: string;
  summary?: string;
  quick_facts?: {
    education?: string;
    experience?: string;
    exam?: string;
    fees?: string;
  };
  requirements?: string[];
  common_delays?: string[];
  source_url?: string;
}

const SPRING = { type: 'spring', bounce: 0, duration: 0.5, mass: 0.8, damping: 18 };

// ─── Pure Parsing Utility (Zero-Bloat SWR) ─────────────────────────────────

const parseLicensingData = (raw: string): LicensingData | null => {
  if (!raw) return null;
  try {
    // P1 FIX: Capturing group isolates JSON regardless of conversational filler.
    // (?:```|$) handles partial streams where closing backticks haven't arrived.
    const match = raw.match(/```[a-zA-Z_]*\n([\s\S]*?)(?:```|$)/);
    let clean = match ? match[1] : raw;
    clean = clean.trim().replace(/,\s*([\]}])/g, '$1');
    return JSON.parse(clean);
  } catch {
    return null; // Silently fail during LLM token streams
  }
};

/** Safely extracts clean initials for the watermark (e.g., "New York" -> "NY") */
const getInitials = (text?: string) => 
  (text || 'US').split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();

// ─── Main Component ────────────────────────────────────────────────────────

export const LicensingArtifact: React.FC<{ dataString: string }> = ({ dataString }) => {
  // SWR Cache: Protects UI from violently crashing during active LLM token streaming
  const cache = useRef<LicensingData | null>(null);

  const data = useMemo(() => {
    const parsed = parseLicensingData(dataString);
    if (parsed) cache.current = parsed;
    return parsed || cache.current;
  }, [dataString]);

  // Ambient Loading State (Stream Initiation)
  if (!data) {
    return (
      <div className="my-8 py-5 px-6 bg-black/[0.02] border border-black/[0.04] rounded-[24px] flex items-center justify-center gap-3 w-fit mx-auto">
        <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}>
          <ShieldCheck size={16} className="text-black/40" />
        </motion.div>
        <span className="text-[13px] font-medium tracking-tight text-black/50">Fetching official state requirements...</span>
      </div>
    );
  }

  const requirements = Array.isArray(data.requirements) ? data.requirements : [];
  const delays = Array.isArray(data.common_delays) ? data.common_delays : [];

  return (
    <motion.div 
      initial={{ opacity: 0, y: 16 }} 
      animate={{ opacity: 1, y: 0 }} 
      transition={SPRING}
      className="my-8 w-full bg-white/70 backdrop-blur-3xl rounded-[32px] shadow-[0_24px_60px_rgba(0,0,0,0.06),0_0_1px_rgba(0,0,0,0.1)] border border-black/[0.04] overflow-hidden isolate font-sans selection:bg-[#007AFF]/15"
    >
      {/* ─── Premium Header ───────────────────────────────────────────── */}
      <div className="px-8 py-7 bg-gradient-to-b from-[#007AFF]/5 to-transparent border-b border-black/[0.03] relative overflow-hidden">
        
        {/* Ambient State Abbreviation Watermark */}
        <div className="absolute -right-2 -top-6 text-[120px] font-bold text-black/[0.02] select-none pointer-events-none tracking-tighter">
          {getInitials(data.state)}
        </div>

        <div className="relative z-10 flex items-start gap-4">
          <div className="w-12 h-12 mt-1 rounded-[14px] bg-gradient-to-br from-[#007AFF] to-[#0056B3] shadow-[0_4px_12px_rgba(0,122,255,0.3)] flex items-center justify-center shrink-0">
            <ShieldCheck size={24} className="text-white" strokeWidth={1.5} />
          </div>
          <div className="flex flex-col justify-center min-w-0">
            <h3 className="text-[22px] font-semibold text-[#1D1D1F] tracking-tight leading-snug truncate">
              {data.state} {data.profession}
            </h3>
            <div className="flex items-center gap-1.5 text-[12px] font-medium text-[#1D1D1F]/60 mt-1">
              <Building2 size={14} className="text-black/30 shrink-0" strokeWidth={2} />
              <span className="line-clamp-1">{data.agency_name}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="p-8 space-y-8">
        
        {/* ─── Summary Overview ───────────────────────────────── */}
        {data.summary && (
          <p className="text-[15px] leading-[1.65] tracking-[-0.01em] text-[#1D1D1F]/80 antialiased border-l-[3px] border-black/[0.08] pl-5 text-pretty">
            {data.summary}
          </p>
        )}

        {/* ─── Quick Facts Grid (DRY Mapping) ─────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { icon: BookOpen, color: 'text-[#007AFF]', label: 'Education', val: data.quick_facts?.education },
            { icon: Clock, color: 'text-[#FF9500]', label: 'Experience', val: data.quick_facts?.experience },
            { icon: Award, color: 'text-[#AF52DE]', label: 'Exam', val: data.quick_facts?.exam },
            { icon: DollarSign, color: 'text-[#34C759]', label: 'Fees', val: data.quick_facts?.fees }
          ].map((item, i) => (
            <div key={i} className="bg-[#F5F5F7]/80 rounded-[18px] p-4 flex flex-col border border-black/[0.02]">
              <item.icon size={16} className={`${item.color} mb-2.5`} strokeWidth={2.5} />
              <span className="text-[10px] font-bold text-black/40 uppercase tracking-[0.1em] mb-0.5">{item.label}</span>
              <span className="text-[13px] font-semibold text-[#1D1D1F] tracking-tight leading-snug truncate" title={item.val}>
                {item.val || 'Varies'}
              </span>
            </div>
          ))}
        </div>

        {/* ─── Core Requirements Checklist ──────────────────────── */}
        {requirements.length > 0 && (
          <div className="space-y-4">
            <h4 className="text-[11px] font-bold text-black/30 uppercase tracking-[0.18em] border-b border-black/[0.04] pb-3 px-1">
              Path to Licensure
            </h4>
            <div className="bg-white rounded-[24px] border border-black/[0.04] shadow-[0_2px_10px_rgba(0,0,0,0.02)] p-2">
              {requirements.map((req, idx) => (
                <div key={idx} className="flex items-start gap-3.5 p-3.5 hover:bg-[#F5F5F7]/50 rounded-[16px] transition-colors duration-300">
                  <div className="mt-0.5 w-[18px] h-[18px] rounded-full border-[1.5px] border-[#34C759] flex items-center justify-center shrink-0 bg-[#34C759]/10">
                    <CheckCircle2 size={12} className="text-[#34C759]" strokeWidth={3} />
                  </div>
                  <span className="text-[14.5px] font-medium text-[#1D1D1F]/80 leading-snug tracking-tight text-pretty">
                    {req}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── Common Delays / Slowdowns ─────────────────────── */}
        {delays.length > 0 && (
          <div className="space-y-4">
            <h4 className="text-[11px] font-bold text-black/30 uppercase tracking-[0.18em] border-b border-black/[0.04] pb-3 px-1">
              Common Delays
            </h4>
            <div className="bg-[#FF9500]/[0.04] rounded-[24px] border border-[#FF9500]/10 p-2">
              {delays.map((delay, idx) => (
                <div key={idx} className="flex items-start gap-3.5 p-3.5 rounded-[16px]">
                  <div className="mt-0.5 w-[18px] h-[18px] rounded-full flex items-center justify-center shrink-0 bg-[#FF9500]/10">
                    <AlertTriangle size={11} className="text-[#FF9500]" strokeWidth={2.5} />
                  </div>
                  <span className="text-[14px] font-medium text-[#1D1D1F]/70 leading-snug tracking-tight text-pretty">
                    {delay}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ─── Traffic-Driving Footer (Deep Link CTA) ───────────── */}
      {data.source_url && (
        <div className="px-8 py-5 bg-black/[0.01] border-t border-black/[0.04] flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="text-[11.5px] font-medium text-black/40 tracking-tight">
            Source: StateLicensingReference.com
          </span>
          <motion.a
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            href={data.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#1D1D1F] text-white text-[13px] font-semibold tracking-tight shadow-[0_4px_14px_rgba(0,0,0,0.15)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.2)] transition-all duration-300 w-full sm:w-auto justify-center shrink-0"
          >
            View Official Guide
            <ArrowUpRight size={14} strokeWidth={2.5} className="text-white/70" />
          </motion.a>
        </div>
      )}
    </motion.div>
  );
};
