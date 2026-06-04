// ============================================================================
// EmailViewerArtifact — Inline email renderer
//
// Design: Minimalist mail reader. No chrome, no noise. Content-first.
// Gmail deep-link via threadId. Sandboxed HTML body. Auto-sizing iframe.
// ============================================================================

import React, { useState, useMemo, useCallback } from 'react';
import { Copy, Check, Paperclip, ChevronDown, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// ============================================================================
// Types
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

// ============================================================================
// Sandboxed HTML Preview
// ============================================================================

const SafeMailIframe = React.memo(({ html }: { html: string }) => {
  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(200);

  React.useEffect(() => {
    if (!iframeRef.current) return;
    const doc = iframeRef.current.contentDocument || iframeRef.current.contentWindow?.document;
    if (!doc) return;

    doc.open();
    doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      body {
        font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif;
        margin: 0; padding: 20px 24px;
        color: #1A1A18;
        background: transparent;
        -webkit-font-smoothing: antialiased;
        word-break: break-word;
        line-height: 1.75;
        font-size: 13px;
      }
      a { color: #8C7A6B; text-decoration: underline; text-underline-offset: 3px; }
      a:hover { color: #1A1A18; }
      img { max-width: 100%; height: auto; display: block; margin: 12px 0; border-radius: 6px; }
      table, th, td { border-collapse: collapse; }
      td { padding: 4px; }
      h1, h2, h3 { color: #0F0F0E; font-weight: 600; }
      blockquote { border-left: 2px solid #E8E6E1; margin: 16px 0; padding-left: 16px; color: #706E6B; }
      hr { border: none; border-top: 1px solid #E8E6E1; margin: 20px 0; }
      pre, code { font-family: 'JetBrains Mono', monospace; font-size: 12px; background: #F4F3EF; border-radius: 4px; padding: 2px 6px; }
      pre { padding: 12px 16px; overflow-x: auto; }
    </style></head><body>${html}</body></html>`);
    doc.close();

    const resizeObserver = new ResizeObserver(() => {
      if (doc.body) {
        setHeight(Math.max(doc.body.scrollHeight + 4, 80));
      }
    });

    const timer = setTimeout(() => {
      if (doc.body) {
        resizeObserver.observe(doc.body);
        setHeight(Math.max(doc.body.scrollHeight + 4, 80));
      }
    }, 120);

    return () => {
      clearTimeout(timer);
      resizeObserver.disconnect();
    };
  }, [html]);

  return (
    <iframe
      ref={iframeRef}
      title="Email content"
      className="w-full border-0 bg-transparent"
      style={{ height: `${height}px` }}
      sandbox="allow-same-origin allow-popups"
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

/** Gmail deep-link from threadId or message id */
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

  const data: EmailViewerData | null = useMemo(() => {
    try {
      let clean = dataString.trim();
      if (clean.startsWith('```')) {
        const lines = clean.split('\n');
        if (lines[0].startsWith('```')) lines.shift();
        if (lines[lines.length - 1].startsWith('```')) lines.pop();
        clean = lines.join('\n');
      }
      return JSON.parse(clean);
    } catch (e) {
      console.error('Failed to parse email viewer data', e);
      return null;
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
      <div className="p-5 bg-white/60 border border-clay/40 rounded-2xl text-taupe text-sm font-mono">
        Unable to render email content.
      </div>
    );
  }

  const sender = parseSender(data.sender || '');
  const hasAttachments = data.attachments && data.attachments.length > 0;
  const hasHtml = !!data.bodyHtml;
  const gmailUrl = getGmailUrl(data);

  return (
    <div className="my-5 w-full bg-white border border-clay/40 rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">

      {/* Header */}
      <div className="px-6 pt-5 pb-4">
        {/* Subject + Gmail link */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <h2 className="text-[15px] font-semibold text-ink tracking-tight leading-snug flex-1 min-w-0">
            {data.subject || 'No Subject'}
          </h2>
          {gmailUrl && (
            <a
              href={gmailUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 flex items-center gap-1 text-[9px] font-mono text-taupe/50 hover:text-bronze tracking-widest uppercase transition-colors duration-200 mt-0.5"
            >
              Open
              <ExternalLink size={10} strokeWidth={2} />
            </a>
          )}
        </div>

        {/* Sender row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-[#F0EDE8] flex items-center justify-center shrink-0">
              <span className="text-[12px] font-semibold text-charcoal/70">
                {sender.name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="min-w-0">
              <span className="text-[12.5px] font-medium text-charcoal block truncate">
                {sender.name}
              </span>
              <span className="text-[10.5px] text-taupe/60 font-mono truncate block">
                {sender.email}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10.5px] text-taupe/50 font-mono hidden sm:block">
              {formatDate(data.date || '')}
            </span>
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="p-1 rounded-md text-taupe/30 hover:text-charcoal/60 hover:bg-sand/60 transition-all duration-200"
              aria-label={showDetails ? 'Hide details' : 'Show details'}
            >
              <ChevronDown
                size={13}
                strokeWidth={2}
                className={`transition-transform duration-200 ${showDetails ? 'rotate-180' : ''}`}
              />
            </button>
          </div>
        </div>

        {/* Expandable details */}
        <AnimatePresence>
          {showDetails && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden"
            >
              <div className="mt-3 pt-3 border-t border-clay/25 space-y-2 text-[11px] font-mono">
                <div className="flex gap-2">
                  <span className="text-taupe/40 shrink-0 w-6">To</span>
                  <span className="text-charcoal/70 break-all">{data.to || '—'}</span>
                </div>
                {data.cc && (
                  <div className="flex gap-2">
                    <span className="text-taupe/40 shrink-0 w-6">Cc</span>
                    <span className="text-charcoal/70 break-all">{data.cc}</span>
                  </div>
                )}
                <div className="sm:hidden flex gap-2">
                  <span className="text-taupe/40 shrink-0 w-6">At</span>
                  <span className="text-charcoal/70">{formatDate(data.date || '')}</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Divider */}
      <div className="mx-6 h-px bg-clay/25" />

      {/* Body */}
      <div className="relative">
        {hasHtml ? (
          <SafeMailIframe html={data.bodyHtml!} />
        ) : (
          <div className="px-6 py-5">
            <pre className="text-[13px] text-charcoal/85 leading-7 whitespace-pre-wrap font-sans m-0">
              {data.bodyText || 'No content available.'}
            </pre>
          </div>
        )}
      </div>

      {/* Attachments */}
      {hasAttachments && (
        <div className="mx-6 border-t border-clay/25">
          <div className="py-3.5">
            <div className="flex items-center gap-1.5 mb-2.5">
              <Paperclip size={11} className="text-taupe/40" strokeWidth={2} />
              <span className="text-[9px] font-mono text-taupe/40 uppercase tracking-widest">
                {data.attachments!.length} attachment{data.attachments!.length > 1 ? 's' : ''}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {data.attachments!.map((att, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-[#F8F7F5] border border-clay/30 rounded-lg text-[10.5px] font-mono text-charcoal/70 hover:border-bronze/30 transition-colors duration-200"
                >
                  <span className="truncate max-w-[180px]">{att.filename}</span>
                  <span className="text-taupe/40 shrink-0">{formatSize(att.size)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="px-6 py-2.5 border-t border-clay/20 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {data.labelIds?.includes('IMPORTANT') && (
            <span className="text-[8px] font-mono text-bronze/60 uppercase tracking-[0.12em] bg-bronze/5 px-1.5 py-0.5 rounded">
              Important
            </span>
          )}
          {data.labelIds?.includes('STARRED') && (
            <span className="text-[8px] font-mono text-amber-600/50 uppercase tracking-[0.12em] bg-amber-50 px-1.5 py-0.5 rounded">
              Starred
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {onReply && data.id && (
            <button
              onClick={() => {
                onReply(`Reply to this email`);
              }}
              className="text-[9px] font-mono text-taupe/35 hover:text-bronze/70 transition-colors duration-200 active:scale-95"
            >
              reply
            </button>
          )}
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 text-[9px] font-mono text-taupe/35 hover:text-charcoal/60 transition-colors duration-200 active:scale-95"
          >
            {copied ? <Check size={10} className="text-bronze/70" /> : <Copy size={10} />}
            {copied ? 'copied' : 'copy'}
          </button>
        </div>
      </div>
    </div>
  );
};
