import React, { useState } from 'react';
import { Play, Check, Copy } from 'lucide-react';
import { motion } from 'framer-motion';

interface DiagnosticProps {
  dataString: string;
  onRecover?: () => void;
}

interface DiagnosticPayload {
  root_cause: string;
  proposed_fix: string;
  invalidation_condition?: string;
  risk_flag?: string;
  patch_code?: string;
}

export const DiagnosticArtifact: React.FC<DiagnosticProps> = ({ dataString, onRecover }) => {
  const [isRecovering, setIsRecovering] = useState(false);
  const [isRecovered, setIsRecovered] = useState(false);
  const [copied, setCopied] = useState(false);

  let payload: DiagnosticPayload | null = null;
  try {
    payload = JSON.parse(dataString);
  } catch (e) {
    console.error('Failed to parse diagnostic payload', e);
  }

  if (!payload) return null;

  const handleRecover = () => {
    setIsRecovering(true);
    setTimeout(() => {
      setIsRecovering(false);
      setIsRecovered(true);
      if (onRecover) onRecover();
    }, 2000);
  };

  const handleCopy = () => {
    if (payload?.patch_code) {
      navigator.clipboard.writeText(payload.patch_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col w-full my-4 space-y-4"
    >
      <div className="prose max-w-none text-[14px] leading-7 text-charcoal space-y-4">
        <p>
          <strong className="text-ink font-semibold">Root Cause:</strong> {payload.root_cause}
        </p>
        <p>
          <strong className="text-ink font-semibold">Proposed Fix:</strong> {payload.proposed_fix}
        </p>
        {payload.risk_flag && (
          <p>
            <strong className="text-ink font-semibold">Risk Flag:</strong> {payload.risk_flag}
          </p>
        )}
        {payload.invalidation_condition && (
          <p>
            <strong className="text-ink font-semibold">Invalidation Condition:</strong> {payload.invalidation_condition}
          </p>
        )}
      </div>

      {payload.patch_code && (
        <div className="relative group my-2 rounded-2xl overflow-hidden bg-charcoal shadow-lg border border-charcoal/90">
          <div className="flex items-center justify-between px-5 py-2.5 bg-black/20 border-b border-white/5">
            <span className="text-[11px] font-mono text-bronze uppercase tracking-widest">JAVASCRIPT</span>
            <button
              onClick={handleCopy}
              className="relative flex items-center justify-center w-7 h-7 text-taupe hover:text-sand transition-colors rounded-md hover:bg-white/5 active:scale-90 group/btn"
              aria-label="Copy code"
            >
              {copied ? <Check size={14} className="text-bronze" /> : <Copy size={14} className="group-hover/btn:scale-110 transition-transform" />}
            </button>
          </div>
          <pre className="p-5 overflow-x-auto font-mono text-[13px] text-sand/90 leading-relaxed no-scrollbar">
            <code>{payload.patch_code}</code>
          </pre>
        </div>
      )}

      {/* Execution Button */}
      <div className="flex justify-start pt-2">
        <button
          onClick={handleRecover}
          disabled={isRecovering || isRecovered}
          className={`
            px-5 py-2.5 rounded-xl font-mono text-[12px] uppercase tracking-wider flex items-center justify-center gap-2 transition-all
            ${isRecovered 
              ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' 
              : 'bg-bronze/10 hover:bg-bronze/20 text-bronze border border-bronze/20'
            }
          `}
        >
          {isRecovered ? (
            <>
              <Check size={14} />
              Patch Executed
            </>
          ) : isRecovering ? (
            <span className="animate-pulse">Executing Patch...</span>
          ) : (
            <>
              <Play size={14} />
              Execute Proposed Patch
            </>
          )}
        </button>
      </div>
    </motion.div>
  );
};
