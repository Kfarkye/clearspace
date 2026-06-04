
import React, { useState, useRef, useEffect, useMemo, useCallback, memo } from 'react';
import { Message } from '../types';
import { 
  ArrowDown, Copy, Check, Expand, X, 
  ChevronDown, BrainCircuit, ImagePlus, AlertCircle, Loader2
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
import { EmailViewerArtifact } from './EmailViewerArtifact';

interface AuraChatProps {
  messages: Message[];
  isLoading: boolean;
  onSendMessage: (input: string, imageBase64?: string, imageMime?: string) => void;
  chatMode: 'operator' | 'standard';
}

/* =========================================
   1. GLOBAL CONFIGS & ORGANIC PHYSICS
=========================================== */
const MAX_FILE_SIZE_MB = 10;
const THINK_REGEX = /<think>([\s\S]*?)(?:<\/think>|$)/gi;

// Apple-esque Spring Physics: Critically damped, zero bounce, profoundly fluid.
const SPRING_TRANSITION = { type: 'spring' as const, bounce: 0, duration: 0.5, mass: 0.8, damping: 18 };
const MICRO_SPRING = { type: 'spring' as const, bounce: 0, duration: 0.3, damping: 15 };

// BUG FIX: Artifact matchers use dual-key safety (original strict matchers preserved)
const ARTIFACT_REGISTRY = [
  { id: 'scoreboard', match: (l: string, c: string) => l.includes('scoreboard') || (c.includes('"games"') && c.includes('"summary_markdown"')), component: ScoreboardArtifact },
  { id: 'matchupresearch', match: (l: string, c: string) => l.includes('matchupresearch') || (c.includes('"headToHead"') && c.includes('"homeTeam"') && c.includes('"awayTeam"')) || (c.includes('"head_to_head"') && c.includes('"home_team"') && c.includes('"away_team"')), component: MatchupResearchArtifact },
  { id: 'bettingangles', match: (l: string, c: string) => l.includes('bettingangles') || (c.includes('"analysis_markdown"') && c.includes('"angles"')), component: BettingAnglesArtifact },
  { id: 'emailviewer', match: (l: string, c: string) => l.includes('emailviewer') || (c.includes('"sender"') && (c.includes('"bodyHtml"') || c.includes('"bodyText"'))), component: EmailViewerArtifact },
  { id: 'workspace', match: (l: string, c: string) => l.includes('workspace') || (c.includes('"emails"') && c.includes('"schedule"')), component: WorkspaceArtifact },
  { id: 'travelhealth', match: (l: string, c: string) => l.includes('travelhealth') || c.includes('"job_matches"'), component: TravelHealthArtifact },
  { id: 'sidebar', match: (l: string, c: string) => l.includes('sidebar') || c.includes('"action_prompt"'), component: SidebarArtifact },
  { id: 'codesandbox', match: (l: string, c: string) => l.includes('codesandbox') || c.includes('"explanation_markdown"'), component: CodeSandboxArtifact },
  { id: 'datatable', match: (l: string, c: string) => l.includes('datatable') || (c.includes('"columns"') && c.includes('"rows"')), component: DataTableArtifact },
  { id: 'html', match: (l: string, c: string) => l === 'html' && c.trim().startsWith('<'), component: HtmlArtifact as any }
];

type RenderBlock = 
  | { type: 'html'; content: string }
  | { type: 'code'; lang: string; code: string }
  | { type: 'reasoning'; content: string; isStreaming: boolean };

/* =========================================
   2. ATOMIC UI COMPONENTS (Authentic Materials)
=========================================== */

/** Reimagined CodeBlock: Recessed dark material feel with frosted headers */
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
    <div className="relative group my-8 rounded-[24px] overflow-hidden bg-[#18181A] shadow-[inset_0_1px_1px_rgba(255,255,255,0.08),0_8px_20px_rgba(0,0,0,0.12)] border border-black/20 font-sans selection:bg-white/20">
      <div className="flex items-center justify-between px-5 py-3 bg-white/[0.03] backdrop-blur-md">
        <span className="text-[10px] font-mono text-white/50 uppercase tracking-[0.15em] font-medium">{lang || 'text'}</span>
        <button onClick={handleCopy} className="text-white/40 hover:text-white transition-colors duration-300 active:scale-90" aria-label="Copy">
          {copied ? <Check size={14} className="text-[#34C759]" /> : <Copy size={14} />}
        </button>
      </div>
      <div className={`relative transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${!isExpanded && isTruncatable ? 'max-h-[280px] overflow-hidden' : 'max-h-none overflow-x-auto no-scrollbar'}`}>
        <pre className="p-5 pt-3 font-mono text-[13px] text-[#E0E0E0] leading-[1.65] tracking-tight"><code>{content}</code></pre>
        {!isExpanded && isTruncatable && (
          <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#18181A] to-transparent pointer-events-none flex items-end justify-center pb-4">
            <button onClick={() => setIsExpanded(true)} className="pointer-events-auto px-5 py-2 rounded-full bg-white/10 hover:bg-white/15 backdrop-blur-md text-[11px] font-medium tracking-wide text-white transition-all duration-300 hover:scale-105 active:scale-95 shadow-sm">
              Reveal Code
            </button>
          </div>
        )}
      </div>
    </div>
  );
}, (prev, next) => prev.content === next.content);
CodeBlock.displayName = 'CodeBlock';

/** Reimagined Reasoning: Removed bounding box. Delicate inline indentation like a whispered thought. */
const ReasoningBlock = memo(({ content, isStreaming }: { content: string; isStreaming: boolean }) => {
  const [isOpen, setIsOpen] = useState(false);
  if (!content.trim() && !isStreaming) return null;

  return (
    <div className="my-5 group/reasoning">
      <button onClick={() => setIsOpen(prev => !prev)} className="flex items-center gap-2.5 text-[11px] uppercase tracking-[0.1em] font-medium text-black/30 hover:text-black/60 transition-colors duration-300 select-none outline-none">
        {isStreaming ? (
          <Loader2 size={14} className="animate-spin text-black/50" />
        ) : (
          <BrainCircuit size={14} className="text-black/30 group-hover/reasoning:text-black/50 transition-colors" />
        )}
        Agent Cognition
        <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={MICRO_SPRING}>
          <ChevronDown size={12} className="opacity-50" />
        </motion.div>
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={SPRING_TRANSITION} className="overflow-hidden">
            <div className="mt-3 ml-2 pl-4 border-l-[1.5px] border-black/10 text-[13.5px] text-black/50 leading-[1.7] italic font-serif break-words">
              {content}
              {isStreaming && <span className="inline-block w-1.5 h-3.5 ml-1 bg-black/20 animate-pulse rounded-full align-middle" />}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
ReasoningBlock.displayName = 'ReasoningBlock';

/** Immersive Spatial Image Viewer with deep blur and drop shadows */
const ExpandableImage = memo(({ src, onLoad }: { src: string; onLoad?: () => void }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  return (
    <>
      <div onClick={() => setIsExpanded(true)} className="relative rounded-[20px] overflow-hidden border border-black/[0.04] max-w-[280px] mb-4 shadow-[0_4px_20px_rgba(0,0,0,0.06)] group cursor-zoom-in bg-white shrink-0 isolate">
        <img src={src} onLoad={onLoad} alt="Context" className="w-full h-auto object-cover transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.02]" loading="lazy" />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors duration-500 flex items-center justify-center opacity-0 group-hover:opacity-100">
          <div className="bg-white/80 backdrop-blur-md p-2.5 rounded-full shadow-sm scale-90 group-hover:scale-100 transition-transform duration-300">
            <Expand size={16} className="text-black/70" />
          </div>
        </div>
      </div>
      <AnimatePresence>
        {isExpanded && (
          <motion.div 
            initial={{ opacity: 0, backdropFilter: "blur(0px)" }} animate={{ opacity: 1, backdropFilter: "blur(24px)" }} exit={{ opacity: 0, backdropFilter: "blur(0px)" }} transition={{ duration: 0.4 }} 
            onClick={() => setIsExpanded(false)} 
            className="fixed inset-0 z-[100] bg-black/20 flex items-center justify-center p-8 cursor-zoom-out"
          >
            <button className="absolute top-8 right-8 p-3 text-black/50 hover:text-black bg-white/60 backdrop-blur-md rounded-full transition-all duration-300 hover:scale-110 active:scale-90 shadow-sm z-50">
              <X size={20} />
            </button>
            <motion.img 
              initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 10 }} transition={SPRING_TRANSITION} 
              src={src} className="max-w-full max-h-full rounded-[24px] shadow-[0_30px_60px_rgba(0,0,0,0.15)] object-contain border border-white/40" onClick={(e) => e.stopPropagation()} 
            />
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
interface MessageItemProps {
  msg: Message;
  onSendMessage: (input: string) => void;
  onImageLoad: () => void;
  chatMode: 'operator' | 'standard';
}

const MessageItemComponent = ({ msg, onSendMessage, onImageLoad, chatMode }: MessageItemProps) => {
  const isUser = msg.role === 'user';
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  const handleCopyPrompt = useCallback(() => {
    navigator.clipboard.writeText(msg.content);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  }, [msg.content]);

  // UUID-based AST parser: No custom HTML elements, no DOMPurify config hacks
  const parsedBlocks = useMemo<RenderBlock[]>(() => {
    if (isUser || !msg.content) return [];
    
    const blockRegistry = new Map<string, RenderBlock>();

    let processedContent = msg.content.replace(THINK_REGEX, (match, thought) => {
      const isStreaming = !match.endsWith('</think>');
      const id = `__AURA_REASONING_${Math.random().toString(36).slice(2, 10)}__`;
      blockRegistry.set(id, { type: 'reasoning', content: thought.trim(), isStreaming });
      return id;
    });

    const renderer = new marked.Renderer();
    renderer.code = function(token: any, paramLang?: string) {
      const codeText = typeof token === 'string' ? token : token.text;
      const lang = (typeof token === 'string' ? paramLang : token.lang) || 'text';
      const id = `__AURA_CODE_${Math.random().toString(36).slice(2, 10)}__`;
      blockRegistry.set(id, { type: 'code', code: codeText, lang });
      return id;
    };

    const rawMarkup = marked.parse(processedContent, { renderer, gfm: true, breaks: true }) as string;
    const cleanHtml = DOMPurify.sanitize(rawMarkup);

    const blocks: RenderBlock[] = [];
    const parts = cleanHtml.split(/(__AURA_(?:REASONING|CODE)_[a-z0-9]+__)/g);

    parts.forEach((part) => {
      if (!part) return;
      if (blockRegistry.has(part)) {
        blocks.push(blockRegistry.get(part)!);
      } else if (part.trim() !== '') {
        const last = blocks[blocks.length - 1];
        if (last?.type === 'html') last.content += part;
        else blocks.push({ type: 'html', content: part });
      }
    });

    return blocks;
  }, [msg.content, isUser]);

  // Impeccable editorial typography mapping to SF Pro ideals
  const proseClasses = "prose max-w-none text-[15.5px] leading-[1.65] tracking-[-0.01em] text-[#1D1D1F] space-y-5 break-words prose-p:my-3 prose-headings:text-black prose-headings:font-semibold prose-headings:tracking-[-0.02em] prose-headings:my-5 prose-ul:list-none prose-ul:pl-0 prose-ol:list-decimal prose-ol:pl-5 prose-li:my-2 prose-li:relative prose-ul:prose-li:before:content-[''] prose-ul:prose-li:before:absolute prose-ul:prose-li:before:left-[-14px] prose-ul:prose-li:before:top-[10px] prose-ul:prose-li:before:w-1.5 prose-ul:prose-li:before:h-1.5 prose-ul:prose-li:before:bg-black/20 prose-ul:prose-li:before:rounded-full prose-a:text-[#0066CC] hover:prose-a:text-[#004499] prose-a:no-underline hover:prose-a:underline prose-a:underline-offset-4 transition-colors prose-strong:font-semibold prose-strong:text-black antialiased";

  return (
    <motion.div layout="position" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={SPRING_TRANSITION} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} w-full mb-10 group`}>
      {msg.image && <ExpandableImage src={msg.image} onLoad={onImageLoad} />}
      
      {isUser ? (
        <div className="relative group/prompt max-w-[85%] sm:max-w-[75%]">
          {/* User Bubble: Soft gray, minimal shadow, natural iOS iMessage squircle */}
          <div className="bg-[#F2F2F7] text-[#1D1D1F] px-5 py-3.5 rounded-[24px] rounded-br-[8px] shadow-[0_2px_10px_rgba(0,0,0,0.02)] border border-black/[0.02]">
            <p className="whitespace-pre-wrap text-[15px] leading-[1.4] tracking-[-0.01em] font-medium break-words">{msg.content}</p>
          </div>
          <button onClick={handleCopyPrompt} className="absolute -left-12 top-1/2 -translate-y-1/2 p-2 text-black/20 opacity-0 group-hover/prompt:opacity-100 hover:text-black hover:bg-black/5 rounded-full transition-all duration-300 hidden sm:flex active:scale-90" title="Copy prompt">
            {copiedPrompt ? <Check size={14} className="text-[#34C759]" /> : <Copy size={14} />}
          </button>
        </div>
      ) : !msg.content ? (
        // Ambient organic breathing loader
        <div className="flex items-center gap-[5px] h-8 px-2">
          {[0, 0.15, 0.3].map((delay, i) => (
            <motion.div key={i} animate={{ opacity: [0.2, 0.8, 0.2], scale: [0.85, 1, 0.85] }} transition={{ duration: 1.5, repeat: Infinity, delay, ease: "easeInOut" }} className="w-1.5 h-1.5 rounded-full bg-black/40" />
          ))}
        </div>
      ) : (
        // System canvas — completely boundless, no background box
        <div className="w-full max-w-[95%] sm:max-w-[90%]">
          {parsedBlocks.map((block, index) => {
            if (block.type === 'html') return <div key={index} className={proseClasses} dangerouslySetInnerHTML={{ __html: block.content }} />;
            if (block.type === 'reasoning') return <ReasoningBlock key={index} content={block.content} isStreaming={block.isStreaming} />;
            if (block.type === 'code') {
              const Plugin = ARTIFACT_REGISTRY.find(p => p.match(block.lang, block.code));
              if (Plugin) {
                const Component = Plugin.component;
                return (
                  // Boundless artifact rendering with soft physical drop shadows
                  <div key={index} className="my-8 rounded-[24px] overflow-hidden shadow-[0_12px_40px_rgba(0,0,0,0.06)] border border-black/[0.04] bg-white">
                    <Component dataString={block.code} onAction={onSendMessage} onEmailClick={(msgId: string, subject: string) => onSendMessage(`Open email "${subject}" (message_id: ${msgId})`)} />
                  </div>
                );
              }
              return <CodeBlock key={index} lang={block.lang} content={block.code} />;
            }
            return null;
          })}
        </div>
      )}
    </motion.div>
  );
};

const MessageItem = memo(MessageItemComponent, (prev, next) => prev.msg.content === next.msg.content && prev.msg.id === next.msg.id);
MessageItem.displayName = 'MessageItem';

/* =========================================
   4. MAIN CHAT CONTAINER (The Glass Canvas)
=========================================== */
const AuraChat: React.FC<AuraChatProps> = ({ messages, isLoading, onSendMessage, chatMode }) => {
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const dragCounter = useRef(0);
  const rafRef = useRef<number | null>(null); 
  const isAtBottomRef = useRef(isAtBottom);

  useEffect(() => {
    isAtBottomRef.current = isAtBottom;
  }, [isAtBottom]);

  // Expand tolerance to account for sub-pixel rendering and bouncy scrolls
  const handleScroll = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      const el = scrollContainerRef.current;
      if (el) setIsAtBottom(Math.abs(el.scrollHeight - el.scrollTop - el.clientHeight) <= 80);
      rafRef.current = null;
    });
  }, []);

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  useEffect(() => {
    if (isAtBottom && chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: isLoading ? 'auto' : 'smooth' });
  }, [messages, isAtBottom, isLoading]);

  const scrollToBottom = useCallback(() => {
    scrollContainerRef.current?.scrollTo({ top: scrollContainerRef.current.scrollHeight, behavior: 'smooth' });
  }, []);

  const handleImageLoad = useCallback(() => {
    if (isAtBottomRef.current && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'auto' });
    }
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => { 
    e.preventDefault(); 
    if (e.dataTransfer.types.includes('Files')) {
      dragCounter.current++; 
      setIsDragging(true); 
    }
  }, []);
  
  const handleDragLeave = useCallback((e: React.DragEvent) => { 
    e.preventDefault(); 
    if (e.dataTransfer.types.includes('Files')) {
      dragCounter.current--; 
      if (dragCounter.current === 0) setIsDragging(false); 
    }
  }, []);
  
  const handleDragOver = useCallback((e: React.DragEvent) => { 
    e.preventDefault(); 
    if (dropError) setDropError(null); 
  }, [dropError]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); 
    if (!e.dataTransfer.types.includes('Files')) return;
    
    dragCounter.current = 0; 
    setIsDragging(false);
    
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      setDropError(`File exceeds ${MAX_FILE_SIZE_MB}MB.`);
      setTimeout(() => setDropError(null), 4000);
      return;
    }
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (!result) return;
      if (file.type.startsWith('image/')) {
        const [mimeInfo, base64Data] = result.split(',');
        const mimeType = mimeInfo.replace('data:', '').replace(';base64', '') || file.type;
        onSendMessage(`Analyze this image`, base64Data, mimeType);
      } else {
        onSendMessage(`Analyze this document: ${file.name}\n\n\`\`\`\n${result.substring(0, 15000)}\n\`\`\``);
      }
    };
    file.type.startsWith('image/') ? reader.readAsDataURL(file) : reader.readAsText(file);
  }, [onSendMessage]);

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
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-white/80 backdrop-blur-md z-50 flex flex-col items-center justify-center border-2 border-dashed border-black/10 m-4 rounded-[28px] pointer-events-none">
            <div className="w-20 h-20 bg-black/[0.03] rounded-full flex items-center justify-center mb-4">
              <ImagePlus size={32} className="text-black/40" />
            </div>
            <h3 className="text-xl font-semibold text-[#1D1D1F] mb-2 tracking-tight">Drop file to analyze</h3>
            <p className="text-sm text-black/40 font-medium">Max size: {MAX_FILE_SIZE_MB}MB. Images and documents supported.</p>
          </motion.div>
        )}
        {dropError && (
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={MICRO_SPRING}
            className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-50 text-red-600 px-4 py-2.5 rounded-full border border-red-100 shadow-lg flex items-center gap-2 z-50 text-sm font-medium">
            <AlertCircle size={16} />
            {dropError}
          </motion.div>
        )}
      </AnimatePresence>

      <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-4 sm:px-8 pb-32 no-scrollbar relative">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col justify-center items-center text-center">
            <motion.h1 initial={{ opacity: 0, filter: 'blur(10px)' }} animate={{ opacity: 1, filter: 'blur(0px)' }} transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }} className="text-[2.5rem] font-light tracking-[0.35em] text-black/15 select-none uppercase">
              {chatMode === 'operator' ? 'AURA' : 'GEMINI'}
            </motion.h1>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto pt-8">
            {messages.map((msg) => (
              <MessageItem key={msg.id} msg={msg} onSendMessage={onSendMessage} onImageLoad={handleImageLoad} chatMode={chatMode} />
            ))}
            <div ref={chatEndRef} className="h-4" />
          </div>
        )}
      </div>

      <AnimatePresence>
        {!isAtBottom && messages.length > 0 && (
          <motion.button initial={{ opacity: 0, y: 10, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.9 }} transition={MICRO_SPRING} onClick={scrollToBottom}
            className="absolute bottom-32 right-8 flex items-center justify-center w-10 h-10 rounded-full bg-white/90 border border-black/[0.04] shadow-[0_4px_12px_rgba(0,0,0,0.06)] text-black/40 hover:text-black backdrop-blur-xl transition-all z-40 hover:scale-105 active:scale-95">
            <ArrowDown size={16} strokeWidth={2} />
          </motion.button>
        )}
      </AnimatePresence>

      <div className="bg-gradient-to-t from-[#FAFAFA] via-[#FAFAFA]/90 to-transparent pt-12 pb-4 pointer-events-none absolute bottom-0 left-0 right-0 z-30 flex justify-center">
        <div className="w-full max-w-3xl px-4 sm:px-8 pointer-events-auto">
          <ChatInput onSendMessage={onSendMessage} isLoading={isLoading} />
        </div>
      </div>
    </div>
  );
};

export default AuraChat;
