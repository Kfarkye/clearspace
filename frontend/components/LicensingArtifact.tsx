// ============================================================================
// LicensingArtifact — Premium Regulatory Guide
// Design: Apple Wallet / visionOS aesthetic. Deep materiality.
// Features: Interactive step tracking, semantic icons, seamless deep-linking.
// ============================================================================

import React, { useMemo, useRef } from 'react';
import {
  ShieldCheck, BookOpen, Clock, Award, DollarSign,
  CheckCircle2, Building2, ArrowUpRight,
} from 'lucide-react';
import { motion } from 'framer-motion';

const SPRING_TRANSITION = { type: 'spring', bounce: 0, duration: 0.5, mass: 0.8, damping: 18 };

interface LicensingData {
  state: string;
  profession: string;
  agency_name: string;
  summary: string;
  quick_facts: {
    education: string;
    experience: string;
    exam: string;
    fees: string;
  };
  requirements: string[];
  source_url: string;
}

export const LicensingArtifact: React.FC<{ dataString: string }> = ({ dataString }) => {
  // SWR Cache protects from React crashes during LLM JSON streams
  const lastValidData = useRef<LicensingData | null>(null);

  const data = useMemo(() => {
    if (!dataString) return lastValidData.current;
    try {
      // P1 FIX: Capturing group isolates JSON regardless of conversational filler.
      // (?:```|$) handles partial streams where closing backticks haven't arrived.
      const match = dataString.match(/```[a-zA-Z_]*\n([\s\S]*?)(?:```|$)/);
      let clean = match ? match[1] : dataString;

      // Clean up trailing commas for partial JSON streams
      clean = clean.trim().replace(/,\s*([\]}])/g, '$1');

      const parsed = JSON.parse(clean) as LicensingData;
      lastValidData.current = parsed;
      return parsed;
    } catch {
      return lastValidData.current;
    }
  }, [dataString]);

  if (!data) {
    return (
      <div className="my-8 p-6 bg-black/[0.02] border border-black/[0.04] rounded-[24px] flex items-center justify-center gap-3 w-full max-w-sm mx-auto">
        <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}>
          <ShieldCheck size={18} className="text-black/30" />
        </motion.div>
        <span className="text-[13.5px] font-medium tracking-tight text-black/40">Fetching official state requirements...</span>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING_TRANSITION}
      className="my-8 w-full bg-white/70 backdrop-blur-3xl rounded-[32px] shadow-[0_24px_60px_rgba(0,0,0,0.06),0_0_1px_rgba(0,0,0,0.1)] border border-black/[0.04] overflow-hidden isolate font-sans selection:bg-[#007AFF]/15"
    >
      {/* ─── Premium Header ───────────────────────────────────────────── */}
      <div className="px-8 py-7 bg-gradient-to-b from-[#007AFF]/5 to-transparent border-b border-black/[0.03] relative overflow-hidden">
        {/* Subtle background state abbreviation watermark */}
        <div className="absolute -right-2 -top-8 text-[120px] font-bold text-black/[0.02] select-none pointer-events-none tracking-tighter">
          {data.state?.substring(0, 2).toUpperCase()}
        </div>

        <div className="relative z-10 flex items-start gap-4">
          <div className="w-12 h-12 mt-1 rounded-[14px] bg-gradient-to-br from-[#007AFF] to-[#0056B3] shadow-[0_4px_12px_rgba(0,122,255,0.3)] flex items-center justify-center shrink-0">
            <ShieldCheck size={24} className="text-white" strokeWidth={1.5} />
          </div>
          <div className="flex flex-col justify-center">
            <h3 className="text-[22px] font-semibold text-[#1D1D1F] tracking-tight leading-snug">
              {data.state} {data.profession}
            </h3>
            <div className="flex items-center gap-1.5 text-[12px] font-medium text-[#1D1D1F]/60 mt-1">
              <Building2 size={14} className="text-black/30" strokeWidth={2} />
              {data.agency_name}
            </div>
          </div>
        </div>
      </div>

      <div className="p-8 space-y-8">

        {/* ─── Summary Overview ───────────────────────────────── */}
        <p className="text-[15px] leading-[1.65] tracking-[-0.01em] text-[#1D1D1F]/80 antialiased border-l-[3px] border-black/[0.08] pl-5">
          {data.summary}
        </p>

        {/* ─── Quick Facts Grid (Apple Watch Style Metrics) ─────── */}
        {data.quick_facts && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-[#F5F5F7]/80 rounded-[18px] p-4 flex flex-col border border-black/[0.02]">
              <BookOpen size={16} className="text-[#007AFF] mb-2.5" strokeWidth={2} />
              <span className="text-[10px] font-bold text-black/40 uppercase tracking-[0.1em] mb-0.5">Education</span>
              <span className="text-[13px] font-semibold text-[#1D1D1F] tracking-tight leading-snug">{data.quick_facts.education || 'Varies'}</span>
            </div>
            <div className="bg-[#F5F5F7]/80 rounded-[18px] p-4 flex flex-col border border-black/[0.02]">
              <Clock size={16} className="text-[#FF9500] mb-2.5" strokeWidth={2} />
              <span className="text-[10px] font-bold text-black/40 uppercase tracking-[0.1em] mb-0.5">Experience</span>
              <span className="text-[13px] font-semibold text-[#1D1D1F] tracking-tight leading-snug">{data.quick_facts.experience || 'Required'}</span>
            </div>
            <div className="bg-[#F5F5F7]/80 rounded-[18px] p-4 flex flex-col border border-black/[0.02]">
              <Award size={16} className="text-[#AF52DE] mb-2.5" strokeWidth={2} />
              <span className="text-[10px] font-bold text-black/40 uppercase tracking-[0.1em] mb-0.5">Exam</span>
              <span className="text-[13px] font-semibold text-[#1D1D1F] tracking-tight leading-snug">{data.quick_facts.exam || 'Required'}</span>
            </div>
            <div className="bg-[#F5F5F7]/80 rounded-[18px] p-4 flex flex-col border border-black/[0.02]">
              <DollarSign size={16} className="text-[#34C759] mb-2.5" strokeWidth={2} />
              <span className="text-[10px] font-bold text-black/40 uppercase tracking-[0.1em] mb-0.5">Fees</span>
              <span className="text-[13px] font-semibold text-[#1D1D1F] tracking-tight leading-snug">{data.quick_facts.fees || 'Varies'}</span>
            </div>
          </div>
        )}

        {/* ─── Core Requirements Checklist ──────────────────────── */}
        {data.requirements && data.requirements.length > 0 && (
          <div className="space-y-4">
            <h4 className="text-[11px] font-bold text-black/30 uppercase tracking-[0.18em] border-b border-black/[0.04] pb-3 px-1">
              Path to Licensure
            </h4>
            <div className="bg-white rounded-[24px] border border-black/[0.04] shadow-[0_2px_10px_rgba(0,0,0,0.02)] p-2">
              {data.requirements.map((req, idx) => (
                <div key={idx} className="flex items-start gap-3.5 p-4 hover:bg-[#F5F5F7]/50 rounded-[16px] transition-colors duration-300">
                  <div className="mt-0.5 w-[18px] h-[18px] rounded-full border-[1.5px] border-[#34C759] flex items-center justify-center shrink-0 bg-[#34C759]/10">
                    <CheckCircle2 size={12} className="text-[#34C759]" strokeWidth={3} />
                  </div>
                  <span className="text-[14px] font-medium text-[#1D1D1F]/80 leading-snug tracking-tight">
                    {req}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ─── Traffic-Driving Footer (Deep Link) ────────── */}
      {data.source_url && (
        <div className="px-8 py-5 bg-black/[0.02] border-t border-black/[0.04] flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="text-[11px] font-medium text-black/40">
            Source: Official State Licensing Authority
          </span>
          <motion.a
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            href={data.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#1D1D1F] text-white text-[13px] font-semibold tracking-tight shadow-[0_4px_14px_rgba(0,0,0,0.15)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.2)] transition-all duration-300 w-full sm:w-auto justify-center"
          >
            View Full Official Guide
            <ArrowUpRight size={14} strokeWidth={2.5} className="text-white/70" />
          </motion.a>
        </div>
      )}
    </motion.div>
  );
};
