import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Message } from '../types';
import { ArrowDown, Copy, Check, AlertCircle } from 'lucide-react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { motion, AnimatePresence } from 'framer-motion';
import { ChatInput } from './ChatInput';
import { BettingAnglesArtifact } from './BettingAnglesArtifact';
import { WorkspaceArtifact } from './WorkspaceArtifact';
import { SidebarArtifact } from './SidebarArtifact';
import { HtmlArtifact } from './HtmlArtifact';
import { EmailViewerArtifact } from './EmailViewerArtifact';
import { ScoreboardArtifact } from './ScoreboardArtifact';
import { MLBScoreboard } from './MLBScoreboard';
import { DataTableArtifact } from './DataTableArtifact';
import { WorldCupArtifact } from './WorldCupArtifact';
import { WorldCupGroupArtifact } from './WorldCupGroupArtifact';
import { AuraYouTube } from './AuraYouTube';
import { YouTubeMediaCard } from './YouTubeMediaCard';
import { PlayerPropArtifact } from './PlayerPropArtifact';
import { ThinkingMode } from '../hooks/useChat';
import { useImageUpload } from '../hooks/useImageUpload';
import ErrorBoundary from './ErrorBoundary';
import { DiagnosticArtifact } from './DiagnosticArtifact';
import { JobManifestArtifact } from './JobManifestArtifact';
import { ArtifactLedgerCard } from './chat/artifact-ledger-card';
import { ChatSuggestions } from './ChatSuggestions';
import { MessageRenderer } from './MessageRenderer';
import { MlbCoreLedgerArtifact } from './MlbCoreLedgerArtifact';
import { MlbSpannerMatchupCard } from './MlbSpannerMatchupCard';
import { MlbSpannerChatResults } from './MlbSpannerChatResults';
import { WorldCupSpannerChatResults } from './WorldCupSpannerChatResults';
import { triggerHaptic } from '../lib/haptics';

interface TruthChatProps {
  messages: Message[];
  isLoading: boolean;
  onSendMessage: (input: string, imageBase64?: string, imageMime?: string) => void;
  chatMode: 'operator' | 'standard';
  thinkingMode: ThinkingMode;
  onThinkingModeChange: (mode: ThinkingMode) => void;
  workspaceToken?: string | null;
  onRetrySave?: () => void;
  executionPhase?: string | null;
  onStop?: () => void;
}

/* ------------------------------------------------------------------ */
/* Code block                                                          */
/* ------------------------------------------------------------------ */

const CodeBlock: React.FC<{ lang: string; content: string }> = React.memo(({ lang, content }) => {
  const [copied, setCopied] = useState(false);
  const isActualCode = lang && !['text', 'plaintext', 'plain', 'txt'].includes(lang.toLowerCase());

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [content]);

  if (!isActualCode) {
    return (
      <div className="relative group my-4 rounded-xl overflow-hidden bg-[#18181b] border border-white/10">
        <div className="flex items-center justify-end px-4 py-1.5 border-b border-white/5">
          <button
            onClick={handleCopy}
            className="flex items-center justify-center w-7 h-7 text-slate-400 hover:text-slate-200 transition-colors rounded-md hover:bg-white/10 active:scale-90"
            aria-label="Copy"
          >
            {copied ? <Check size={14} className="text-emerald" /> : <Copy size={14} />}
          </button>
        </div>
        <pre className="px-5 py-4 overflow-x-auto font-mono text-[12px] text-slate-300 leading-relaxed no-scrollbar whitespace-pre-wrap">
          <code>{content}</code>
        </pre>
      </div>
    );
  }

  return (
    <div className="relative group my-6 rounded-xl overflow-hidden bg-[#0a0a0a] border border-white/10">
      <div className="flex items-center justify-between px-5 py-2.5 bg-white/5 border-b border-white/5">
        <span className="text-[11px] font-mono text-bronze uppercase tracking-widest">{lang}</span>
        <button
          onClick={handleCopy}
          className="flex items-center justify-center w-7 h-7 text-slate-400 hover:text-slate-200 transition-colors rounded-md hover:bg-white/10 active:scale-90"
          aria-label="Copy code"
        >
          {copied ? <Check size={14} className="text-emerald" /> : <Copy size={14} />}
        </button>
      </div>
      <pre className="p-5 overflow-x-auto font-mono text-[13px] text-slate-200 leading-relaxed no-scrollbar">
        <code>{content}</code>
      </pre>
    </div>
  );
});

/* ------------------------------------------------------------------ */
/* Thinking indicator                                                  */
/* ------------------------------------------------------------------ */

const ThinkingIndicator: React.FC<{ executionPhase?: string | null, onStop?: () => void }> = ({ executionPhase, onStop }) => {
  const [step, setStep] = useState(0);
  const steps = ['Working on it', 'Pulling the numbers', 'Almost there'];

  useEffect(() => {
    if (executionPhase) return;
    const interval = setInterval(() => setStep((s) => (s + 1) % steps.length), 1500);
    return () => clearInterval(interval);
  }, [executionPhase]);

  const isError = executionPhase === 'The response connection dropped. Try again.';

  return (
    <div className="flex flex-col gap-2 py-6">
      <div className="flex items-center gap-3">
        {!isError && (
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                animate={{ opacity: [0.25, 1, 0.25] }}
                transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.18, ease: 'easeInOut' }}
                className="w-1.5 h-1.5 bg-charcoal/70 rounded-full"
              />
            ))}
          </div>
        )}
        {isError && <AlertCircle size={14} className="text-[#C45C5C]" />}
        <span className={`font-mono text-xs tracking-wide ${isError ? 'text-[#C45C5C]' : 'text-taupe'}`}>
          {executionPhase || steps[step]}
        </span>
      </div>
      {executionPhase === 'This is taking longer than usual.' && onStop && (
        <button 
          onClick={onStop} 
          className="ml-[28px] text-[10px] uppercase tracking-wider text-slate-500 hover:text-[#C45C5C] transition-colors self-start cursor-pointer"
        >
          Cancel
        </button>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Content parsing — done ONCE per content string, off the render path */
/* ------------------------------------------------------------------ */

type Segment =
  | { kind: 'html'; html: string }
  | { kind: 'code'; lang: string; code: string }
  | { kind: 'ledger'; id: string; type: 'html' | 'code' | 'json' };

const PROSE_CLASS = `prose max-w-none text-[14px] leading-7 text-slate-200 space-y-4
  prose-p:my-3 prose-headings:text-white prose-headings:font-medium prose-headings:tracking-tight prose-headings:my-5
  prose-ul:list-disc prose-ul:pl-5 prose-ol:list-decimal prose-ol:pl-5 prose-li:my-1.5
  prose-a:text-bronze hover:prose-a:text-bronze/80 prose-a:underline-offset-4 transition-colors
  prose-strong:font-semibold prose-strong:text-white
  prose-code:bg-white/10 prose-code:text-slate-200 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:text-[13px] prose-code:font-mono
  prose-pre:bg-[#0a0a0a] prose-pre:border prose-pre:border-clay/40 prose-pre:text-slate-300 prose-pre:rounded-xl prose-pre:p-5 prose-pre:text-[13px] prose-pre:font-mono`;

// Parse markdown into a flat, serializable segment list. Pure function, no DOM.
function parseSegments(content: string): Segment[] {
  const withLedgers = content.replace(
    /(?:https?:\/\/[^\s]*\/artifact\/)?(art_[a-f0-9]{32})(?:\.(html|json|code|txt))?/gi,
    (_m, id, ext) => {
      const type = ext === 'json' ? 'json' : ext === 'code' || ext === 'txt' ? 'code' : 'html';
      return `\n<artifact-ledger-placeholder data-id="${id}" data-type="${type}"></artifact-ledger-placeholder>\n`;
    }
  );

  const renderer = new marked.Renderer();
  renderer.code = function (token: any, paramLang?: string) {
    const codeText = typeof token === 'string' ? token : token.text;
    const lang = (typeof token === 'string' ? paramLang : token.lang) || 'text';
    return `<code-block-placeholder data-code="${encodeURIComponent(codeText)}" data-lang="${lang}"></code-block-placeholder>`;
  };
  renderer.link = function (token: any) {
    const href = typeof token === 'string' ? token : token.href;
    const text = typeof token === 'string' ? token : token.text || href;
    return `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;
  };

  const rawMarkup = marked.parse(withLedgers, { renderer, gfm: true, breaks: true }) as string;
  const clean = DOMPurify.sanitize(rawMarkup, {
    ADD_TAGS: ['code-block-placeholder', 'artifact-ledger-placeholder'],
    ADD_ATTR: ['data-code', 'data-lang', 'target', 'rel', 'data-id', 'data-type'],
  });

  // Split on placeholders with a regex — no live DOM construction during render.
  const segments: Segment[] = [];
  const placeholderRe =
    /<(code-block-placeholder|artifact-ledger-placeholder)\b([^>]*)><\/\1>/g;
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = placeholderRe.exec(clean)) !== null) {
    if (m.index > last) {
      segments.push({ kind: 'html', html: clean.slice(last, m.index) });
    }
    const attrs = m[2];
    if (m[1] === 'artifact-ledger-placeholder') {
      const id = /data-id="([^"]*)"/.exec(attrs)?.[1] || '';
      const type = (/data-type="([^"]*)"/.exec(attrs)?.[1] || 'html') as 'html' | 'code' | 'json';
      segments.push({ kind: 'ledger', id, type });
    } else {
      const code = decodeURIComponent(/data-code="([^"]*)"/.exec(attrs)?.[1] || '');
      const lang = /data-lang="([^"]*)"/.exec(attrs)?.[1] || 'text';
      segments.push({ kind: 'code', lang, code });
    }
    last = m.index + m[0].length;
  }
  if (last < clean.length) {
    segments.push({ kind: 'html', html: clean.slice(last) });
  }
  return segments;
}

/* ------------------------------------------------------------------ */
/* Artifact routing — pure dispatch, unchanged logic                   */
/* ------------------------------------------------------------------ */

function renderCodeSegment(
  seg: { lang: string; code: string },
  key: string,
  onSendMessage: (input: string) => void,
  workspaceToken?: string | null
): React.ReactNode {
  const { lang, code } = seg;
  const langLower = lang.toLowerCase().trim();

  let isBettingAngles = langLower.startsWith('bettingangles');
  let isScoreboard = langLower.startsWith('scoreboard');
  let isWorkspace = langLower.startsWith('workspace');
  const isTravelHealth = langLower.startsWith('travelhealth');
  const isSidebar = langLower.startsWith('sidebar');
  const isCodeSandbox = langLower.startsWith('codesandbox');
  let isEmailViewer = langLower.startsWith('emailviewer');
  let isDataTable = langLower.startsWith('datatable');
  let isLicensing = langLower.startsWith('licensing');
  let isWorldCup = langLower.startsWith('world_cup_profile');
  let isWorldCupGroup = langLower.startsWith('world_cup_group');
  let isYouTube = langLower.startsWith('youtube');
  let isPlayerProps = langLower.startsWith('playerprops');
  const isHtmlArtifact = langLower === 'html' && code.trim().startsWith('<');
  let isDiagnostic = langLower.startsWith('diagnostic');
  let isMLBScoreboard = langLower.startsWith('mlbscoreboard');
  let isMLBCoreLedger = langLower.startsWith('mlbcoreledger');
  let isMLBSpannerContext = langLower.startsWith('mlbspannercontext');
  let isMLBSpannerResults = langLower.startsWith('mlbspannerresults');
  let isWorldCupSpannerResults = langLower.startsWith('worldcupspannerresults');
  let isJobManifest = langLower.startsWith('jobmanifest');

  const noTagMatch =
    !isBettingAngles && !isScoreboard && !isWorkspace && !isTravelHealth && !isSidebar &&
    !isCodeSandbox && !isEmailViewer && !isDataTable && !isLicensing && !isWorldCup &&
    !isWorldCupGroup && !isYouTube && !isPlayerProps && !isDiagnostic && !isMLBScoreboard && !isMLBCoreLedger && !isMLBSpannerContext && !isMLBSpannerResults && !isWorldCupSpannerResults && !isJobManifest;

  if (noTagMatch && (langLower === 'json' || langLower === 'text')) {
    if (code.includes('"analysis_markdown"') && code.includes('"angles"')) isBettingAngles = true;
    else if (code.includes('"type":"SPORTS_ARTIFACT"')) isMLBScoreboard = true;
    else if (code.includes('"eventId"') && code.includes('"competitionId"')) isMLBCoreLedger = true;
    else if (code.includes('"games"') && code.includes('"summary_markdown"') && (code.includes('"home_team"') || code.includes('"away_team"'))) isScoreboard = true;
    else if (code.includes('"emails"') && code.includes('"summary_markdown"') && (code.includes('"schedule"') || code.includes('"action_items"'))) isWorkspace = true;
    else if ((code.includes('"bodyText"') || code.includes('"bodyHtml"')) && code.includes('"subject"')) isEmailViewer = true;
    else if (code.includes('"columns"') && code.includes('"rows"')) isDataTable = true;
    else if (code.includes('"profession"') && code.includes('"requirements"') && code.includes('"state"')) isLicensing = true;
    else if (code.includes('"event_name"') && code.includes('"group_name"') && code.includes('"teams"')) isWorldCupGroup = true;
    else if (code.includes('"tactical_outlook"') && code.includes('"team"') && code.includes('"key_players"')) isWorldCup = true;
    else if (code.includes('"videos"') && (code.includes('"thumbnail"') || code.includes('"videoId"'))) isYouTube = true;
    else if (code.includes('"query"') && (code.includes('youtube') || code.includes('video') || code.includes('media'))) isYouTube = true;
    else if (code.includes('"gameId"') && code.includes('"props"') && code.includes('"playerId"')) isPlayerProps = true;
    else if (code.includes('"root_cause"') && code.includes('"proposed_fix"')) isDiagnostic = true;
  }

  if (isMLBSpannerContext) return <MlbSpannerMatchupCard key={key} dataString={code} />;
  if (isMLBSpannerResults) return <MlbSpannerChatResults key={key} dataString={code} />;
  if (isWorldCupSpannerResults) return <WorldCupSpannerChatResults key={key} dataString={code} />;
  if (isMLBCoreLedger) return <MlbCoreLedgerArtifact key={key} dataString={code} />;
  if (isMLBScoreboard) return <MLBScoreboard key={key} />;
  if (isScoreboard) return <ScoreboardArtifact key={key} dataString={code} />;
  if (isDiagnostic) return <DiagnosticArtifact key={key} dataString={code} onRecover={() => onSendMessage('Apply the proposed diagnostic patch.')} />;
  if (isJobManifest) return <JobManifestArtifact key={key} dataString={code} />;
  if (isBettingAngles) return <BettingAnglesArtifact key={key} dataString={code} />;
  if (isWorkspace) return <WorkspaceArtifact key={key} dataString={code} onEmailClick={(msgId, subject) => onSendMessage(`Open email "${subject}" (message_id: ${msgId})`)} />;
  if (isSidebar) return <SidebarArtifact key={key} dataString={code} onAction={onSendMessage} />;
  if (isEmailViewer) return <EmailViewerArtifact key={key} dataString={code} onReply={onSendMessage} />;
  if (isDataTable) return <DataTableArtifact key={key} dataString={code} />;
  if (isWorldCupGroup) return <WorldCupGroupArtifact key={key} dataString={code} />;
  if (isWorldCup) return <WorldCupArtifact key={key} dataString={code} />;

  if (isYouTube) {
    try {
      const match = code.match(/```[a-zA-Z_]*\n([\s\S]*?)(?:```|$)/);
      let parsedStr = (match ? match[1] : code).trim().replace(/,\s*([\]}])/g, '$1');
      const parsed = JSON.parse(parsedStr);
      if (parsed?.query && (!parsed.videos || parsed.videos.length === 0)) {
        return <YouTubeMediaCard key={key} query={parsed.query} />;
      }
      return <AuraYouTube key={key} dataString={code} />;
    } catch {
      return (
        <div key={key} className="w-full bg-white border border-[#C45C5C]/30 p-4 flex flex-col gap-1.5 rounded-xl">
          <span className="font-sans text-sm text-charcoal">That video didn't load. Try again in a second.</span>
        </div>
      );
    }
  }

  if (isPlayerProps) return <PlayerPropArtifact key={key} dataString={code} />;
  if (isHtmlArtifact) return <HtmlArtifact key={key} dataString={code} workspaceToken={workspaceToken} />;
  return <CodeBlock key={key} lang={lang} content={code} />;
}

/* ------------------------------------------------------------------ */
/* Message item                                                        */
/* ------------------------------------------------------------------ */

interface MessageItemProps {
  msg: Message;
  onSendMessage: (input: string) => void;
  chatMode: 'operator' | 'standard';
  workspaceToken?: string | null;
  onRetrySave?: () => void;
  executionPhase?: string | null;
  onStop?: () => void;
}

const MessageItem: React.FC<MessageItemProps> = React.memo(
  ({ msg, onSendMessage, workspaceToken, onRetrySave, executionPhase, onStop }) => {
    const isUser = msg.role === 'user';
    const [msgCopied, setMsgCopied] = useState(false);

    const handleCopyMessage = useCallback(() => {
      navigator.clipboard.writeText(msg.content || '');
      setMsgCopied(true);
      setTimeout(() => setMsgCopied(false), 2000);
    }, [msg.content]);

    // Parse ONCE per content change. This is the perf fix: no DOM walking on every render.
    const segments = useMemo(
      () => (isUser || !msg.content ? [] : parseSegments(msg.content)),
      [msg.content, isUser]
    );

    const isFatalError = false; // Intentionally disabled to allow graceful diagnostic rendering

    const renderContent = () => {
      if (isUser) {
        return <p className="whitespace-pre-wrap text-[15px] leading-[1.6] text-slate-200">{msg.content}</p>;
      }
      if (!msg.content) {
        return <ThinkingIndicator executionPhase={executionPhase} onStop={onStop} />;
      }
      return <MessageRenderer content={msg.content} onSendMessage={onSendMessage} workspaceToken={workspaceToken} />;
    };

    return (
      <motion.div
        layout="position"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 32, mass: 0.8 }}
        onAnimationComplete={() => { if (isUser) triggerHaptic('light'); }}
        className={`group relative flex flex-col w-full py-6 ${isUser ? 'items-end text-right' : 'items-start text-left'}`}
      >
        <span className="font-mono text-[10px] text-slate-500 uppercase tracking-widest mb-2">
          {isUser ? 'You' : 'Truth'}
        </span>

        {msg.image && (
          <div className="rounded-xl overflow-hidden border border-clay/40 max-w-sm mb-3">
            <img src={msg.image} alt="Attached" className="w-full h-auto object-cover" />
          </div>
        )}

        <div className={`max-w-[85%] sm:max-w-[90%] w-full ${isUser ? 'pl-8' : 'pr-8'}`}>
          {renderContent()}

          {msg.content && (
            <div className={`flex items-center gap-3 mt-4 opacity-0 group-hover:opacity-100 transition-opacity duration-200 ${isUser ? 'justify-end' : 'justify-start'}`}>
              <button
                onClick={handleCopyMessage}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-mono transition-all duration-200 active:scale-95 text-slate-400 hover:text-slate-200 hover:bg-white/10"
                aria-label={msgCopied ? 'Copied' : 'Copy message'}
              >
                {msgCopied ? <Check size={12} className={isUser ? "text-emerald" : "text-bronze"} /> : <Copy size={12} />}
                <span>{msgCopied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          )}
        </div>

        {isUser && msg.saveStatus === 'failed' && (
          <button
            onClick={onRetrySave}
            className="mt-2 text-[10px] font-medium tracking-wide text-[#C45C5C]/70 hover:text-[#C45C5C] transition-colors cursor-pointer"
          >
            Didn't save — tap to retry
          </button>
        )}
      </motion.div>
    );
  },
  // Only re-render a message when its own data changes — not when a sibling streams.
  (prev, next) =>
    prev.msg.content === next.msg.content &&
    prev.msg.saveStatus === next.msg.saveStatus &&
    prev.msg.image === next.msg.image &&
    prev.executionPhase === next.executionPhase &&
    prev.workspaceToken === next.workspaceToken
);

/* ------------------------------------------------------------------ */
/* Chat shell                                                          */
/* ------------------------------------------------------------------ */

const TruthChat: React.FC<TruthChatProps> = ({
  messages, isLoading, onSendMessage, chatMode, thinkingMode,
  onThinkingModeChange, workspaceToken, onRetrySave, executionPhase, onStop
}) => {
  const [isAtBottom, setIsAtBottom] = useState(true);

  const {
    selectedImage, selectedMime, imagePreviewUrl, isDragging,
    handleFileChange, handleDragOver, handleDragEnter, handleDragLeave,
    handleDrop, handlePaste, clearAttachment,
  } = useImageUpload();

  const chatEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (el) setIsAtBottom(el.scrollHeight - el.scrollTop <= el.clientHeight + 40);
  }, []);

  useEffect(() => {
    if (isAtBottom) chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isAtBottom]);

  useEffect(() => {
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [handlePaste]);

  const scrollToBottom = useCallback(() => {
    scrollContainerRef.current?.scrollTo({
      top: scrollContainerRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, []);

  return (
    <div
      className="relative flex flex-col h-full bg-transparent"
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <AnimatePresence>
        {isDragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-alabaster/70 backdrop-blur-sm z-50 flex flex-col items-center justify-center border-2 border-dashed border-bronze/40 m-6 rounded-2xl"
          >
            <p className="text-sm font-medium tracking-wide text-bronze">Drop an image to add it</p>
          </motion.div>
        )}
      </AnimatePresence>

      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className={`flex-1 overflow-y-auto px-4 sm:px-8 pb-4 sm:pb-8 no-scrollbar pwa-content-scroll ${messages.length === 0 ? 'flex flex-col items-center justify-center' : ''}`}
      >
        {messages.length === 0 ? (
          <div className="w-full max-w-3xl -mt-20">
            <ChatSuggestions onSelect={onSendMessage} />
          </div>
        ) : (
          <div className="max-w-3xl mx-auto pt-8">
            {messages.map((msg, index) => {
              const prevUserMsg =
                index > 0 && messages[index - 1].role === 'user' ? messages[index - 1].content : undefined;
              return (
                <ErrorBoundary
                  key={`eb-${msg.id}`}
                  onReset={() => { if (prevUserMsg) onSendMessage(prevUserMsg); }}
                  fallbackRender={({ error, resetErrorBoundary }) => (
                    <div className="flex flex-col items-start w-full mb-6">
                      <div className="p-5 bg-[#18181b] border border-[#C45C5C]/20 rounded-2xl max-w-[85%] sm:max-w-[75%]">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="w-7 h-7 rounded-full bg-[#C45C5C]/20 flex items-center justify-center shrink-0">
                            <AlertCircle size={14} className="text-[#C45C5C]" strokeWidth={2.5} />
                          </div>
                          <span className="text-[14px] font-semibold tracking-tight text-white">
                            {error.message || "Couldn't load that"}
                          </span>
                        </div>
                        <p className="text-[13.5px] leading-[1.6] text-slate-400 pl-10 mb-3">
                          Something hiccuped on our end. Give it another shot.
                        </p>
                        <div className="pl-10">
                          <button
                            onClick={resetErrorBoundary}
                            className="text-[12px] font-medium px-4 py-1.5 bg-[#C45C5C]/10 text-[#C45C5C] rounded-lg hover:bg-[#C45C5C]/20 transition-colors cursor-pointer"
                          >
                            Try again
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                >
                  <MessageItem
                    msg={msg}
                    onSendMessage={onSendMessage}
                    chatMode={chatMode}
                    workspaceToken={workspaceToken}
                    onRetrySave={onRetrySave}
                    executionPhase={executionPhase}
                    onStop={onStop}
                  />
                </ErrorBoundary>
              );
            })}
            <div ref={chatEndRef} className="h-4" />
          </div>
        )}
      </div>



      <AnimatePresence>
        {!isAtBottom && messages.length > 0 && (
          <motion.button
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.9 }}
            onClick={scrollToBottom}
            className="absolute bottom-32 right-8 flex items-center justify-center w-10 h-10 rounded-full bg-white border border-clay/40 text-taupe hover:text-charcoal transition-all z-40 hover:scale-105 active:scale-95"
            aria-label="Scroll to latest"
          >
            <ArrowDown size={16} strokeWidth={2} />
          </motion.button>
        )}
      </AnimatePresence>

      <div className="pwa-footer pt-4 sm:pt-6">
        <ChatInput
          onSendMessage={onSendMessage}
          isLoading={isLoading}
          thinkingMode={thinkingMode}
          onThinkingModeChange={onThinkingModeChange}
          selectedImage={selectedImage}
          selectedMime={selectedMime}
          imagePreviewUrl={imagePreviewUrl}
          onFileChange={handleFileChange}
          onClearAttachment={clearAttachment}
        />
      </div>
    </div>
  );
};

export default TruthChat;
