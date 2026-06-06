// ============================================================================
// EmailViewerArtifact — Inline email renderer
//
// Design: Apple Mail / iOS Vision. Profoundly minimal, material-first.
// Features: Zero-crash SWR cache, dynamic iframe sandboxing, spring physics.
// ============================================================================

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Copy, Check, Paperclip, ChevronDown, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// ============================================================================
// Types & Physics
// ============================================================================

interface EmailAttachment {
  filename: string;
  mimeType: string;
  size: number;
  attachmentId: string;
}

interface EmailViewerData {
  id?: string;
  threadId?: string;
  subject?: string;
  sender?: string;
  to?: string;
  cc?: string;
  date?: string;
  bodyText?: string;
  bodyHtml?: string;
  attachments?: EmailAttachment[];
  labelIds?: string[];
}

interface EmailViewerArtifactProps {
  dataString: string;
  onReply?: (prompt: string) => void;
}

// Apple-esque Spring Physics: Critically damped, zero bounce
const SPRING_TRANSITION = { type: 'spring', bounce: 0, duration: 0.5, mass: 0.8, damping: 18 };
const MICRO_SPRING = { type: 'spring', bounce: 0, duration: 0.3, damping: 15 };

// ============================================================================
// Sandboxed HTML Preview (Styled with Apple Editorial Typography)
// ============================================================================

const SafeMailIframe = React.memo(({ html }: { html: string }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(100);

  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type === 'resize_email' && e.data?.height) {
        setHeight(Math.max(e.data.height + 10, 100));
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const srcDocHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      body {
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        margin: 0; padding: 24px 32px;
        color: #1D1D1F;
        background: transparent;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
        word-break: break-word;
        line-height: 1.65;
        font-size: 14.5px;
        letter-spacing: -0.01em;
      }
      a { color: #0066CC; text-decoration: none; }
      a:hover { text-decoration: underline; text-underline-offset: 4px; }
      img { max-width: 100%; height: auto; display: block; margin: 16px 0; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.06); }
      table, th, td { border-collapse: collapse; }
      td { padding: 8px; border: 1px solid rgba(0,0,0,0.05); }
      h1, h2, h3, h4 { color: #000000; font-weight: 600; letter-spacing: -0.02em; margin-top: 1.5em; margin-bottom: 0.5em; }
      blockquote { border-left: 3px solid rgba(0,0,0,0.1); margin: 20px 0; padding-left: 16px; color: rgba(29,29,31,0.6); }
      hr { border: none; border-top: 1px solid rgba(0,0,0,0.06); margin: 24px 0; }
      pre, code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 12.5px; background: rgba(0,0,0,0.04); border-radius: 6px; padding: 2px 6px; }
      pre { padding: 16px; overflow-x: auto; border-radius: 12px; border: 1px solid rgba(0,0,0,0.04); }
      ::selection { background: rgba(0,122,255,0.15); }
    </style>
    <script>
      window.onload = function() {
        if (window.ResizeObserver) {
          var ro = new ResizeObserver(function() {
             window.parent.postMessage({ type: 'resize_email', height: document.body.scrollHeight }, '*');
          });
          ro.observe(document.body);
        }
        window.parent.postMessage({ type: 'resize_email', height: document.body.scrollHeight }, '*');
      };
    </script>
    </head><body>${html}</body></html>`;

  return (
    <motion.iframe
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      ref={iframeRef}
      title="Email content"
      srcDoc={srcDocHtml}
      className="w-full border-0 bg-transparent"
      style={{ height: `${height}px`, transition: 'height 0.3s cubic-bezier(0.16, 1, 0.3, 1)' }}
      sandbox="allow-popups allow-scripts"
    />
  );
});
SafeMailIframe.displayName = 'SafeMailIframe';

// ============================================================================
// Helpers
// ============================================================================

function parseSender(raw: string): { name: string; email: string } {
  const match = raw.match(/^(.+?)\s*<(.+?)>$/);
  if (match) return { name: match[1].trim().replace(/^"|"$/g, ''), email: match[2] };
  return { name: raw, email: raw };
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(raw: string): string {
  try {
    const d = new Date(raw);
    const now = new Date();
    const isThisYear = d.getFullYear() === now.getFullYear();

    const date = d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      ...(isThisYear ? {} : { year: 'numeric' }),
    });
    const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    return `${date}, ${time}`;
  } catch {
    return raw;
  }
}

function getGmailUrl(data: EmailViewerData): string | null {
  const id = data.threadId || data.id;
  if (!id) return null;
  return `https://mail.google.com/mail/u/0/#inbox/${id}`;
}

// ============================================================================
// Component
// ============================================================================

export const EmailViewerArtifact: React.FC<EmailViewerArtifactProps> = ({ dataString, onReply }) => {
  const [copied, setCopied] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const lastValidData = useRef<EmailViewerData | null>(null);

  const data: EmailViewerData | null = useMemo(() => {
    if (!dataString) return lastValidData.current;

    try {
      let cleanString = dataString
        .replace(/^```[a-zA-Z]*\n?/i, '')
        .replace(/\n?```$/i, '')
        .trim();

      cleanString = cleanString.replace(/,\s*([\]}])/g, '$1');

      const parsed = JSON.parse(cleanString);
      lastValidData.current = parsed;
      return parsed;
    } catch (e) {
      return lastValidData.current;
    }
  }, [dataString]);

  const handleCopy = useCallback(() => {
    if (!data) return;
    const text = data.bodyText || data.bodyHtml || '';
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [data]);

  if (!data) {
    return (
      <div className="my-8 p-6 bg-black/[0.02] border border-black/[0.04] rounded-[24px] flex items-center justify-center gap-3 w-full max-w-sm mx-auto">
        <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}>
          <div className="w-2 h-2 rounded-full bg-black/30" />
        </motion.div>
        <span className="text-[13px] font-medium tracking-tight text-black/40">Decrypting mail payload...</span>
      </div>
    );
  }

  const sender = parseSender(data.sender || '');
  const hasAttachments = Array.isArray(data.attachments) && data.attachments.length > 0;
  const hasHtml = !!data.bodyHtml;
  const gmailUrl = getGmailUrl(data);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 16 }} 
      animate={{ opacity: 1, y: 0 }} 
      transition={SPRING_TRANSITION}
      className="my-8 w-full bg-white/70 backdrop-blur-3xl rounded-[32px] shadow-[0_24px_60px_rgba(0,0,0,0.06),0_0_1px_rgba(0,0,0,0.1)] border border-black/[0.04] overflow-hidden isolate font-sans selection:bg-[#007AFF]/15"
    >
      {/* Header */}
      <div className="px-8 pt-7 pb-5 bg-white/40">
        
        {/* Subject + App Link */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <h2 className="text-[20px] font-semibold text-[#1D1D1F] tracking-tight leading-snug flex-1 min-w-0 antialiased">
            {data.subject || 'No Subject'}
          </h2>
          {gmailUrl && (
            <motion.a
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              href={gmailUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 flex items-center gap-1.5 text-[11px] font-semibold text-[#007AFF] bg-[#007AFF]/10 px-3 py-1.5 rounded-full tracking-wide transition-colors duration-200 mt-1"
            >
              Open Mail
              <ExternalLink size={12} strokeWidth={2.5} />
            </motion.a>
          )}
        </div>

        {/* Sender Row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#F5F5F7] to-[#E5E5EA] border border-black/[0.04] shadow-[inset_0_-1px_1px_rgba(0,0,0,0.04)] flex items-center justify-center shrink-0">
              <span className="text-[15px] font-semibold text-[#1D1D1F]/70 tracking-tight">
                {sender.name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="min-w-0 flex flex-col justify-center">
              <span className="text-[14.5px] font-semibold text-[#1D1D1F] tracking-tight block truncate">
                {sender.name}
              </span>
              <span className="text-[12px] text-black/40 font-medium truncate mt-0.5">
                {sender.email}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span className="text-[12px] text-black/40 font-medium hidden sm:block tracking-wide">
              {formatDate(data.date || '')}
            </span>
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="w-7 h-7 rounded-full flex items-center justify-center text-black/30 hover:text-[#1D1D1F] hover:bg-black/5 transition-all duration-300 active:scale-90"
              aria-label={showDetails ? 'Hide details' : 'Show details'}
            >
              <motion.div animate={{ rotate: showDetails ? 180 : 0 }} transition={MICRO_SPRING}>
                <ChevronDown size={16} strokeWidth={2.5} />
              </motion.div>
            </button>
          </div>
        </div>

        {/* Expandable Routing Details */}
        <AnimatePresence initial={false}>
          {showDetails && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={SPRING_TRANSITION}
              className="overflow-hidden"
            >
              <div className="mt-5 p-4 bg-[#F5F5F7]/80 rounded-[16px] space-y-2.5 text-[12.5px] font-medium tracking-tight border border-black/[0.03]">
                <div className="flex gap-4">
                  <span className="text-black/30 shrink-0 w-8 text-right">To</span>
                  <span className="text-[#1D1D1F]/80 break-all">{data.to || '—'}</span>
                </div>
                {data.cc && (
                  <div className="flex gap-4">
                    <span className="text-black/30 shrink-0 w-8 text-right">Cc</span>
                    <span className="text-[#1D1D1F]/80 break-all">{data.cc}</span>
                  </div>
                )}
                <div className="sm:hidden flex gap-4">
                  <span className="text-black/30 shrink-0 w-8 text-right">At</span>
                  <span className="text-[#1D1D1F]/80">{formatDate(data.date || '')}</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Divider */}
      <div className="h-px w-full bg-gradient-to-r from-transparent via-black/[0.06] to-transparent" />

      {/* Body */}
      <div className="relative w-full bg-white/50 backdrop-blur-md min-h-[100px]">
        {hasHtml ? (
          <SafeMailIframe html={data.bodyHtml!} />
        ) : (
          <div className="px-8 py-8">
            <pre className="text-[14.5px] text-[#1D1D1F]/80 leading-[1.65] tracking-[-0.01em] whitespace-pre-wrap font-sans m-0 antialiased">
              {data.bodyText || 'No content available.'}
            </pre>
          </div>
        )}
      </div>

      {/* Attachments */}
      {hasAttachments && (
        <div className="border-t border-black/[0.04] bg-[#F9F9F9]/50">
          <div className="px-8 py-5">
            <div className="flex items-center gap-2 mb-3.5 px-1">
              <Paperclip size={13} className="text-black/30" strokeWidth={2.5} />
              <span className="text-[10px] font-semibold text-black/30 uppercase tracking-[0.18em]">
                {data.attachments!.length} Attachment{data.attachments!.length > 1 ? 's' : ''}
              </span>
            </div>
            <div className="flex flex-wrap gap-2.5">
              {data.attachments!.map((att, i) => (
                <div
                  key={i}
                  className="group flex items-center gap-3 px-3.5 py-2.5 bg-white border border-black/[0.04] shadow-[0_2px_8px_rgba(0,0,0,0.02)] rounded-[12px] hover:border-black/[0.08] hover:shadow-[0_4px_12px_rgba(0,0,0,0.04)] transition-all duration-300 cursor-default"
                >
                  <span className="text-[12.5px] font-medium text-[#1D1D1F]/80 truncate max-w-[200px] tracking-tight">{att.filename}</span>
                  <span className="text-[11px] font-medium text-black/30 shrink-0 uppercase tracking-wider">{formatSize(att.size)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Footer Utility Actions */}
      <div className="px-8 py-4 bg-black/[0.01] border-t border-black/[0.04] flex items-center justify-between">
        <div className="flex items-center gap-2">
          {data.labelIds?.includes('IMPORTANT') && (
            <span className="text-[10px] font-semibold text-[#FF3B30] uppercase tracking-[0.15em] bg-[#FF3B30]/10 px-2.5 py-1 rounded-full">
              Important
            </span>
          )}
          {data.labelIds?.includes('STARRED') && (
            <span className="text-[10px] font-semibold text-[#FF9500] uppercase tracking-[0.15em] bg-[#FF9500]/10 px-2.5 py-1 rounded-full">
              Starred
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-2.5">
          {onReply && data.id && (
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => onReply(`Reply to this email`)}
              className="px-4 py-1.5 rounded-full bg-white border border-black/[0.04] shadow-[0_2px_8px_rgba(0,0,0,0.04)] text-[12px] font-semibold text-[#1D1D1F]/70 tracking-tight hover:text-[#1D1D1F] hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] transition-all duration-300 active:scale-95"
            >
              Reply
            </motion.button>
          )}
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-white border border-black/[0.04] shadow-[0_2px_8px_rgba(0,0,0,0.04)] text-[12px] font-semibold text-[#1D1D1F]/70 tracking-tight hover:text-[#1D1D1F] hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] transition-all duration-300 active:scale-95 w-[84px] justify-center"
          >
            {copied ? <Check size={12} className="text-[#34C759] shrink-0" strokeWidth={2.5} /> : <Copy size={12} className="shrink-0" strokeWidth={2} />}
            {copied ? 'Copied' : 'Copy'}
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
};
