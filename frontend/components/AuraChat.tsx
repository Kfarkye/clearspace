
import React, { useState, useRef, useEffect, useMemo, useCallback, memo } from 'react';
import { Message } from '../types';
import { 
  ArrowDown, Copy, Check, Expand, X, 
  ChevronDown, ChevronUp, BrainCircuit, ImagePlus, AlertCircle, Loader2
} from 'lucide-react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { motion, AnimatePresence } from 'framer-motion';

import { ChatInput } from './ChatInput';
import { BettingAnglesArtifact } from './BettingAnglesArtifact';
import { WorkspaceArtifact } from './WorkspaceArtifact';
import { TravelHealthArtifact } from './TravelHealthArtifact';
import { SidebarArtifact } from './SidebarArtifact';
import { CodeSandboxArtifact } from './CodeSandboxArtifact';
import { HtmlArtifact } from './HtmlArtifact';
import { ScoreboardArtifact } from './ScoreboardArtifact';
import { DataTableArtifact } from './DataTableArtifact';
import { MatchupResearchArtifact } from './MatchupResearchArtifact';

interface AuraChatProps {
  messages: Message[];
  isLoading: boolean;
  onSendMessage: (input: string, imageBase64?: string, imageMime?: string) => void;
  chatMode: 'operator' | 'standard';
}

/* =========================================
   1. GLOBAL CONFIGS & SAFETY UTILS
=========================================== */
const MAX_FILE_SIZE_MB = 10;
const THINK_REGEX = /<think>([\s\S]*?)(?:<\/think>|$)/gi;

const DOMPURIFY_CONFIG = {
  ADD_TAGS: ['code-block-placeholder', 'reasoning-block'],
  ADD_ATTR: ['data-code', 'data-lang', 'data-content', 'data-streaming']
};

const ARTIFACT_REGISTRY = [
  { id: 'scoreboard', match: (l: string, c: string) => l.includes('scoreboard') || (c.includes('"games"') && c.includes('"summary_markdown"')), component: ScoreboardArtifact },
  { id: 'matchupresearch', match: (l: string, c: string) => l.includes('matchupresearch') || (c.includes('"headToHead"') && c.includes('"homeTeam"') && c.includes('"awayTeam"')) || (c.includes('"head_to_head"') && c.includes('"home_team"') && c.includes('"away_team"')), component: MatchupResearchArtifact },
  { id: 'bettingangles', match: (l: string, c: string) => l.includes('bettingangles') || (c.includes('"analysis_markdown"') && c.includes('"angles"')), component: BettingAnglesArtifact },
  { id: 'workspace', match: (l: string, c: string) => l.includes('workspace') || (c.includes('"emails"') && c.includes('"schedule"')), component: WorkspaceArtifact },
  { id: 'travelhealth', match: (l: string, c: string) => l.includes('travelhealth') || c.includes('"job_matches"'), component: TravelHealthArtifact },
  { id: 'sidebar', match: (l: string, c: string) => l.includes('sidebar') || c.includes('"action_prompt"'), component: SidebarArtifact },
  { id: 'codesandbox', match: (l: string, c: string) => l.includes('codesandbox') || c.includes('"explanation_markdown"'), component: CodeSandboxArtifact },
  { id: 'datatable', match: (l: string, c: string) => l.includes('datatable') || (c.includes('"columns"') && c.includes('"rows"')), component: DataTableArtifact },
  { id: 'html', match: (l: string, c: string) => l === 'html' && c.trim().startsWith('<'), component: HtmlArtifact as any }
];

// Crash Defense: Safely encodes incomplete UTF-8 characters during streaming
const safeEncode = (text: string): string => {
  try {
    return btoa(encodeURIComponent(text));
  } catch (e) {
    return btoa(encodeURIComponent(text.replace(/[\uD800-\uDBFF]$/, '')));
  }
};

// Crash Defense: Safely decodes incomplete base64 blocks
const safeDecode = (encoded: string): string => {
  if (!encoded) return '';
  try {
    let padded = encoded;
    while (padded.length % 4 !== 0) padded += '=';
    return decodeURIComponent(atob(padded));
  } catch (err) {
    return '';
  }
};

type RenderBlock = 
  | { type: 'html'; content: string }
  | { type: 'code'; lang: string; code: string }
  | { type: 'reasoning'; content: string; isStreaming: boolean };

/* =========================================
   2. ATOMIC UI COMPONENTS (Memoized)
=========================================== */
const CodeBlock = memo(({ lang, content }: { lang: string; content: string }) => {
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  
  const lineCount = useMemo(() => content.split('\n').length, [content]);
  const isTruncatable = lineCount > 15;

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [content]);

  return (
    <div className="relative group my-6 rounded-2xl overflow-hidden bg-charcoal shadow-lg border border-charcoal/90">
      <div className="flex items-center justify-between px-5 py-2.5 bg-black/20 border-b border-white/5">
        <span className="text-[11px] font-mono text-bronze uppercase tracking-widest">{lang || 'text'}</span>
        <button onClick={handleCopy} className="relative flex items-center justify-center w-7 h-7 text-taupe hover:text-sand transition-colors rounded-md hover:bg-white/5 active:scale-90 group/btn" aria-label="Copy code">
          {copied ? <Check size={14} className="text-bronze" /> : <Copy size={14} className="group-hover/btn:scale-110 transition-transform" />}
        </button>
      </div>
      <div className={`relative transition-all duration-300 ease-in-out ${!isExpanded && isTruncatable ? 'max-h-[300px] overflow-hidden' : 'max-h-none overflow-x-auto no-scrollbar'}`}>
        <pre className="p-5 font-mono text-[13px] text-sand/90 leading-relaxed"><code>{content}</code></pre>
        {!isExpanded && isTruncatable && <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-charcoal to-transparent pointer-events-none" />}
      </div>
      {isTruncatable && (
        <button onClick={() => setIsExpanded(prev => !prev)} className="w-full py-2 bg-black/20 hover:bg-black/40 text-[11px] uppercase tracking-widest text-taupe hover:text-bronze transition-colors border-t border-white/5 flex items-center justify-center gap-2">
          {isExpanded ? 'Collapse' : `Show ${lineCount - 15} More Lines`}
          {isExpanded ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
        </button>
      )}
    </div>
  );
}, (prev, next) => prev.content === next.content && prev.lang === next.lang);

CodeBlock.displayName = 'CodeBlock';

const ReasoningBlock = memo(({ content, isStreaming }: { content: string; isStreaming: boolean }) => {
  const [isOpen, setIsOpen] = useState(true);
  if (!content.trim() && !isStreaming) return null;

  return (
    <div className="my-4 rounded-xl border border-clay/50 bg-alabaster/40 overflow-hidden shadow-sm">
      <button onClick={() => setIsOpen(prev => !prev)} className="flex items-center justify-between w-full px-4 py-2.5 text-[12px] uppercase tracking-wider font-medium text-taupe hover:text-charcoal transition-colors bg-white/50">
        <span className="flex items-center gap-2">
          {isStreaming ? <Loader2 size={14} className="text-bronze animate-spin" /> : <BrainCircuit size={14} className={isOpen ? "text-bronze" : ""} />}
          Agent Reasoning
        </span>
        <span className="text-taupe/50">{isOpen ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}</span>
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="p-4 text-[13px] text-taupe/90 leading-relaxed border-t border-clay/30 italic whitespace-pre-wrap font-mono bg-white/30 break-words">
              {content}
              {isStreaming && <span className="inline-block w-1.5 h-3 ml-1 bg-bronze/60 animate-pulse rounded-full align-middle" />}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}, (prev, next) => prev.content === next.content && prev.isStreaming === next.isStreaming);

ReasoningBlock.displayName = 'ReasoningBlock';

const ExpandableImage = memo(({ src }: { src: string }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  return (
    <>
      <div onClick={() => setIsExpanded(true)} className="relative rounded-2xl overflow-hidden border border-clay/40 max-w-sm mb-3 shadow-float group cursor-zoom-in bg-clay/10 shrink-0">
        <img src={src} alt="Attached context" className="w-full h-auto object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
        <div className="absolute inset-0 bg-charcoal/0 group-hover:bg-charcoal/10 transition-colors flex items-center justify-center">
          <Expand size={24} className="text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-md" />
        </div>
      </div>
      <AnimatePresence>
        {isExpanded && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsExpanded(false)} className="fixed inset-0 z-[100] bg-charcoal/90 backdrop-blur-sm flex items-center justify-center p-8 cursor-zoom-out">
            <button className="absolute top-6 right-6 p-2 text-white/70 hover:text-white bg-white/10 rounded-full transition-colors z-50"><X size={24} /></button>
            <motion.img initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} transition={{ type: "spring", damping: 25, stiffness: 300 }} src={src} className="max-w-full max-h-full rounded-xl shadow-2xl object-contain border border-white/10" onClick={(e) => e.stopPropagation()} />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
});

ExpandableImage.displayName = 'ExpandableImage';

/* =========================================
   3. OPTIMIZED AST PARSER & MESSAGE ITEM
=========================================== */
const MessageItemComponent = ({ msg, onSendMessage, chatMode }: { msg: Message; onSendMessage: (input: string) => void; chatMode: 'operator' | 'standard' }) => {
  const isUser = msg.role === 'user';
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  const handleCopyPrompt = useCallback(() => {
    navigator.clipboard.writeText(msg.content);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  }, [msg.content]);

  // Performance: AST Array avoids DOM creation locking the main thread
  const parsedBlocks = useMemo<RenderBlock[]>(() => {
    if (isUser || !msg.content) return [];
    
    let processedContent = msg.content.replace(THINK_REGEX, (match, thought) => {
      const isStreaming = !match.endsWith('</think>');
      return `<reasoning-block data-streaming="${isStreaming}" data-content="${safeEncode(thought)}"></reasoning-block>`;
    });

    const renderer = new marked.Renderer();
    renderer.code = function(token: any, paramLang?: string) {
      const codeText = typeof token === 'string' ? token : token.text;
      const lang = (typeof token === 'string' ? paramLang : token.lang) || 'text';
      return `<code-block-placeholder data-code="${safeEncode(codeText)}" data-lang="${lang}"></code-block-placeholder>`;
    };

    const rawMarkup = marked.parse(processedContent, { renderer, gfm: true, breaks: true }) as string;
    const cleanHtml = DOMPurify.sanitize(rawMarkup, DOMPURIFY_CONFIG);

    const blocks: RenderBlock[] = [];
    const regex = /(<reasoning-block[^>]*>.*?<\/reasoning-block>|<code-block-placeholder[^>]*>.*?<\/code-block-placeholder>)/gs;
    const parts = cleanHtml.split(regex);

    parts.forEach((part) => {
      if (!part) return;
      if (part.startsWith('<reasoning-block')) {
        const contentMatch = part.match(/data-content="([^"]*)"/);
        const streamingMatch = part.match(/data-streaming="([^"]*)"/);
        blocks.push({
          type: 'reasoning',
          content: contentMatch ? safeDecode(contentMatch[1]) : '',
          isStreaming: streamingMatch ? streamingMatch[1] === 'true' : false
        });
      } else if (part.startsWith('<code-block-placeholder')) {
        const codeMatch = part.match(/data-code="([^"]*)"/);
        const langMatch = part.match(/data-lang="([^"]*)"/);
        blocks.push({
          type: 'code',
          code: codeMatch ? safeDecode(codeMatch[1]) : '',
          lang: langMatch ? langMatch[1] : 'text'
        });
      } else if (part.trim() !== '') {
        blocks.push({ type: 'html', content: part });
      }
    });

    return blocks;
  }, [msg.content, isUser]);

  const proseClasses = "prose max-w-none text-[14px] leading-relaxed text-charcoal space-y-4 break-words prose-p:my-3 prose-headings:text-ink prose-headings:font-medium prose-headings:tracking-tight prose-headings:my-5 prose-ul:list-disc prose-ul:pl-5 prose-ol:list-decimal prose-ol:pl-5 prose-li:my-1.5 prose-a:text-bronze hover:prose-a:text-bronze/80 prose-a:underline-offset-4 transition-colors prose-strong:font-semibold prose-strong:text-ink";

  return (
    <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} w-full mb-8 group`}>
      {msg.image && <ExpandableImage src={msg.image} />}
      <div className={`max-w-[85%] sm:max-w-[90%] ${isUser ? 'bg-white border border-clay/40 px-5 py-3.5 rounded-2xl rounded-tr-sm shadow-float' : 'px-2 py-1 w-full overflow-hidden'}`}>
        {isUser ? (
          <div className="relative group/prompt">
            <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-ink break-words">{msg.content}</p>
            <button onClick={handleCopyPrompt} className="absolute -left-10 top-0 p-1.5 text-taupe/40 opacity-0 group-hover/prompt:opacity-100 hover:text-charcoal hover:bg-clay/30 rounded-md transition-all hidden sm:flex" title="Copy prompt">
              {copiedPrompt ? <Check size={14} className="text-bronze" /> : <Copy size={14} />}
            </button>
          </div>
        ) : !msg.content ? (
          <div className="flex items-center gap-1.5 h-[24px] py-3 px-1">
            {[0, 0.2, 0.4].map((delay, i) => (
              <motion.div key={i} animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1, 0.8] }} transition={{ duration: 1.2, repeat: Infinity, delay }} className={`w-2 h-2 rounded-full ${chatMode === 'operator' ? 'bg-bronze' : 'bg-blue-500'}`} />
            ))}
          </div>
        ) : (
          <div className="space-y-2 w-full">
            {parsedBlocks.map((block, index) => {
              if (block.type === 'html') {
                return <div key={index} className={proseClasses} dangerouslySetInnerHTML={{ __html: block.content }} />;
              }
              if (block.type === 'reasoning') {
                return <ReasoningBlock key={index} content={block.content} isStreaming={block.isStreaming} />;
              }
              if (block.type === 'code') {
                const Plugin = ARTIFACT_REGISTRY.find(p => p.match(block.lang, block.code));
                if (Plugin) {
                  const Component = Plugin.component;
                  return <Component key={index} dataString={block.code} onAction={onSendMessage} onEmailClick={(msgId: string, subject: string) => onSendMessage(`Open email "${subject}" (message_id: ${msgId})`)} />;
                }
                return <CodeBlock key={index} lang={block.lang} content={block.code} />;
              }
              return null;
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
};

// Strict isolation: Historical messages NEVER re-render during active streams
const MessageItem = memo(MessageItemComponent, (prev, next) => 
  prev.msg.content === next.msg.content && 
  prev.msg.id === next.msg.id &&
  prev.msg.image === next.msg.image &&
  prev.chatMode === next.chatMode
);
MessageItem.displayName = 'MessageItem';

/* =========================================
   4. MAIN CHAT CONTAINER
=========================================== */
const AuraChat: React.FC<AuraChatProps> = ({ messages, isLoading, onSendMessage, chatMode }) => {
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const dragCounter = useRef(0);
  const rafRef = useRef<number | null>(null); 

  // Throttled Scroll Listener via rAF
  const handleScroll = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      const el = scrollContainerRef.current;
      if (el) {
        const isScrolledToBottom = Math.abs(el.scrollHeight - el.scrollTop - el.clientHeight) <= 50;
        setIsAtBottom(isScrolledToBottom);
      }
      rafRef.current = null;
    });
  }, []);

  useEffect(() => {
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  // Smart Auto-Scroll: 'auto' during active stream prevents jitter. 'smooth' otherwise.
  useEffect(() => {
    if (isAtBottom && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: isLoading ? 'auto' : 'smooth' });
    }
  }, [messages, isAtBottom, isLoading]);

  // Robust Drag-and-Drop with counter to prevent flicker
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current += 1;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current === 0) setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (dropError) setDropError(null);
  }, [dropError]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current = 0;
    setIsDragging(false);
    
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;
    
    const file = files[0];
    
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      setDropError(`File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Limit is ${MAX_FILE_SIZE_MB}MB.`);
      setTimeout(() => setDropError(null), 4000);
      return;
    }
    
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64String = event.target?.result as string;
        if (!base64String) return;
        const [mimeInfo, base64Data] = base64String.split(',');
        const mimeType = mimeInfo.replace('data:', '').replace(';base64', '') || file.type;
        onSendMessage(`Analyze this image`, base64Data, mimeType);
      };
      reader.readAsDataURL(file);
    } else {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        if (!text) return;
        onSendMessage(`Analyze this document: ${file.name}\n\n\`\`\`\n${text.substring(0, 15000)}\n\`\`\``);
      };
      reader.readAsText(file);
    }
  }, [onSendMessage]);

  const scrollToBottom = useCallback(() => {
    scrollContainerRef.current?.scrollTo({ top: scrollContainerRef.current.scrollHeight, behavior: 'smooth' });
    setIsAtBottom(true);
  }, []);

  return (
    <div 
      className="relative flex flex-col h-full bg-transparent overflow-hidden"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <AnimatePresence>
        {isDragging && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-white/80 backdrop-blur-md z-50 flex flex-col items-center justify-center border-2 border-dashed border-bronze/60 m-4 rounded-3xl pointer-events-none">
            <div className="w-20 h-20 bg-bronze/10 rounded-full flex items-center justify-center mb-4 shadow-xl"><ImagePlus size={32} className="text-bronze" /></div>
            <h3 className="text-xl font-medium text-ink mb-2">Drop file to analyze</h3>
            <p className="text-sm text-taupe">Max size: {MAX_FILE_SIZE_MB}MB. Images and documents supported.</p>
          </motion.div>
        )}
        {dropError && (
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-50 text-red-600 px-4 py-2.5 rounded-full border border-red-100 shadow-lg flex items-center gap-2 z-50 text-sm font-medium">
            <AlertCircle size={16} />
            {dropError}
          </motion.div>
        )}
      </AnimatePresence>

      <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-4 sm:px-8 pb-32 no-scrollbar relative">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col justify-center items-center text-center">
            <motion.h1 initial={{ opacity: 0, filter: 'blur(10px)' }} animate={{ opacity: 1, filter: 'blur(0px)' }} transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }} className="text-[2.5rem] font-light tracking-[0.35em] text-taupe/40 select-none uppercase">
              {chatMode === 'operator' ? 'AURA' : 'GEMINI'}
            </motion.h1>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto pt-8">
            {messages.map((msg) => (
              <MessageItem key={msg.id} msg={msg} onSendMessage={onSendMessage} chatMode={chatMode} />
            ))}
            <div ref={chatEndRef} className="h-4" />
          </div>
        )}
      </div>

      <AnimatePresence>
        {!isAtBottom && messages.length > 0 && (
          <motion.button initial={{ opacity: 0, y: 10, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.9 }} onClick={scrollToBottom} className="absolute bottom-32 right-8 flex items-center justify-center w-10 h-10 rounded-full bg-white/90 border border-white shadow-btn-hover text-taupe hover:text-charcoal backdrop-blur-xl transition-all z-40 hover:scale-105 active:scale-95 group">
            <span className="absolute inset-0 rounded-full shadow-btn-inner pointer-events-none"></span>
            <ArrowDown size={16} strokeWidth={2} className="group-hover:translate-y-0.5 transition-transform duration-300" />
          </motion.button>
        )}
      </AnimatePresence>

      <div className="bg-gradient-to-t from-sand via-sand/90 to-transparent pt-12 pb-4 pointer-events-none absolute bottom-0 left-0 right-0 z-30 flex justify-center">
        <div className="w-full max-w-3xl px-4 sm:px-8 pointer-events-auto">
          <ChatInput onSendMessage={onSendMessage} isLoading={isLoading} />
        </div>
      </div>
    </div>
  );
};

export default AuraChat;
