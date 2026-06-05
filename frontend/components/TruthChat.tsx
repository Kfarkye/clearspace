import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Message } from '../types';
import { ArrowDown, Copy, Check, AlertCircle } from 'lucide-react';
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
import { EmailViewerArtifact } from './EmailViewerArtifact';
import { ScoreboardArtifact } from './ScoreboardArtifact';
import { DataTableArtifact } from './DataTableArtifact';
import { LicensingArtifact } from './LicensingArtifact';
import { WorldCupArtifact } from './WorldCupArtifact';
import { AuraYouTube } from './AuraYouTube';
import { ThinkingMode } from '../hooks/useChat';
import { useImageUpload } from '../hooks/useImageUpload';

interface TruthChatProps {
  messages: Message[];
  isLoading: boolean;
  onSendMessage: (input: string, imageBase64?: string, imageMime?: string) => void;
  chatMode: 'operator' | 'standard';
  thinkingMode: ThinkingMode;
  onThinkingModeChange: (mode: ThinkingMode) => void;
  workspaceToken?: string | null;
  onRetrySave?: () => void;
}

const CodeBlock: React.FC<{ lang: string; content: string }> = ({ lang, content }) => {
  const [copied, setCopied] = useState(false);
  const isActualCode = lang && !['text', 'plaintext', 'plain', 'txt'].includes(lang.toLowerCase());

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isActualCode) {
    return (
      <div className="relative group my-4 rounded-2xl overflow-hidden bg-white/60 backdrop-blur-sm border border-clay/50 shadow-sm">
        <div className="flex items-center justify-end px-4 py-1.5 border-b border-clay/30">
          <button
            onClick={handleCopy}
            className="relative flex items-center justify-center w-7 h-7 text-taupe hover:text-charcoal transition-colors rounded-md hover:bg-clay/20 active:scale-90 group/btn"
            aria-label="Copy"
          >
            {copied ? <Check size={14} className="text-bronze" /> : <Copy size={14} className="group-hover/btn:scale-110 transition-transform" />}
          </button>
        </div>
        <pre className="px-5 py-4 overflow-x-auto font-mono text-[12px] text-charcoal/80 leading-relaxed no-scrollbar whitespace-pre-wrap">
          <code>{content}</code>
        </pre>
      </div>
    );
  }

  return (
    <div className="relative group my-6 rounded-2xl overflow-hidden bg-charcoal shadow-lg border border-charcoal/90">
      <div className="flex items-center justify-between px-5 py-2.5 bg-black/20 border-b border-white/5">
        <span className="text-[11px] font-mono text-bronze uppercase tracking-widest">{lang}</span>
        <button
          onClick={handleCopy}
          className="relative flex items-center justify-center w-7 h-7 text-taupe hover:text-sand transition-colors rounded-md hover:bg-white/5 active:scale-90 group/btn"
          aria-label="Copy code"
        >
          {copied ? <Check size={14} className="text-bronze" /> : <Copy size={14} className="group-hover/btn:scale-110 transition-transform" />}
        </button>
      </div>
      <pre className="p-5 overflow-x-auto font-mono text-[13px] text-sand/90 leading-relaxed no-scrollbar">
        <code>{content}</code>
      </pre>
    </div>
  );
};

// --- Thinking Indicator ---
const ThinkingIndicator: React.FC<{ chatMode: 'operator' | 'standard' }> = ({ chatMode }) => {
  const dotColor = chatMode === 'operator' ? 'bg-bronze' : 'bg-blue-400';
  return (
    <div className="flex items-center gap-3 py-2 px-1">
      <div className="flex items-center gap-1">
        <div className={`thinking-dot w-1.5 h-1.5 rounded-full ${dotColor} animate-thinking-dot`} />
        <div className={`thinking-dot w-1.5 h-1.5 rounded-full ${dotColor} animate-thinking-dot`} />
        <div className={`thinking-dot w-1.5 h-1.5 rounded-full ${dotColor} animate-thinking-dot`} />
      </div>
      <span className="text-[11px] font-mono text-taupe/60 tracking-wider uppercase select-none">
        Thinking
      </span>
    </div>
  );
};

const MessageItem: React.FC<{ msg: Message; onSendMessage: (input: string) => void; chatMode: 'operator' | 'standard'; workspaceToken?: string | null; onRetrySave?: () => void }> = ({ msg, onSendMessage, chatMode, workspaceToken, onRetrySave }) => {
  const isUser = msg.role === 'user';
  const [msgCopied, setMsgCopied] = useState(false);

  // Error boundary: intercept raw API crash strings
  const isFatalError = !isUser && typeof msg.content === 'string' && (
    msg.content.includes('"status":"INVALID_ARGUMENT"') ||
    msg.content.includes('INVALID_ARGUMENT') ||
    msg.content.startsWith('Error: Error:') ||
    msg.content.includes('400 Bad Request')
  );

  if (isFatalError) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="flex flex-col items-start w-full mb-6"
      >
        <div className="p-5 bg-white/70 backdrop-blur-2xl border border-[#FF3B30]/10 rounded-[22px] shadow-[0_8px_30px_rgba(255,59,48,0.04)] max-w-[85%] sm:max-w-[75%]">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-7 h-7 rounded-full bg-[#FF3B30]/10 flex items-center justify-center shrink-0">
              <AlertCircle size={14} className="text-[#FF3B30]" strokeWidth={2.5} />
            </div>
            <span className="text-[14px] font-semibold tracking-tight text-[#1D1D1F]">Data Sync Error</span>
          </div>
          <p className="text-[13.5px] leading-[1.6] text-[#1D1D1F]/60 pl-10 text-pretty">
            A routing error occurred while fetching live data. Please try your request again.
          </p>
        </div>
      </motion.div>
    );
  }

  const handleCopyMessage = useCallback(() => {
    navigator.clipboard.writeText(msg.content || '');
    setMsgCopied(true);
    setTimeout(() => setMsgCopied(false), 2000);
  }, [msg.content]);

  const renderedHtml = useMemo(() => {
    if (isUser || !msg.content) return '';

    const renderer = new marked.Renderer();
    renderer.code = function (token: any, paramLang?: string) {
      const codeText = typeof token === 'string' ? token : token.text;
      const lang = (typeof token === 'string' ? paramLang : token.lang) || 'text';
      return `<code-block-placeholder data-code="${encodeURIComponent(codeText)}" data-lang="${lang}"></code-block-placeholder>`;
    };
    renderer.link = function (token: any) {
      const href = typeof token === 'string' ? token : token.href;
      const text = typeof token === 'string' ? token : (token.text || href);
      return `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;
    };

    const rawMarkup = marked.parse(msg.content, { renderer, gfm: true, breaks: true }) as string;

    return DOMPurify.sanitize(rawMarkup, {
      ADD_TAGS: ['code-block-placeholder'],
      ADD_ATTR: ['data-code', 'data-lang', 'target', 'rel']
    });
  }, [msg.content, isUser]);

  const renderContent = () => {
    if (isUser) {
      return <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-ink">{msg.content}</p>;
    }

    if (!msg.content) {
      return <ThinkingIndicator chatMode={chatMode} />;
    }

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = renderedHtml;
    const placeholders = tempDiv.querySelectorAll('code-block-placeholder');

    const proseClass = `prose max-w-none text-[14px] leading-7 text-charcoal space-y-4
                       prose-p:my-3 prose-headings:text-ink prose-headings:font-medium prose-headings:tracking-tight prose-headings:my-5
                       prose-ul:list-disc prose-ul:pl-5 prose-ol:list-decimal prose-ol:pl-5 prose-li:my-1.5
                       prose-a:text-bronze hover:prose-a:text-bronze/80 prose-a:underline-offset-4 transition-colors
                       prose-strong:font-semibold prose-strong:text-ink
                       prose-code:bg-clay/30 prose-code:text-charcoal prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:text-[13px] prose-code:font-mono
                       prose-pre:bg-white/60 prose-pre:backdrop-blur-sm prose-pre:border prose-pre:border-clay/50 prose-pre:text-charcoal/80 prose-pre:rounded-2xl prose-pre:p-5 prose-pre:text-[13px] prose-pre:font-mono`;

    if (placeholders.length === 0) {
      return (
        <div
          className={proseClass}
          dangerouslySetInnerHTML={{ __html: renderedHtml }}
        />
      );
    }

    const elements: React.ReactNode[] = [];
    let lastIndex = 0;
    const htmlString = renderedHtml;

    placeholders.forEach((placeholder, index) => {
      const outerHTML = placeholder.outerHTML;
      const placeholderIndex = htmlString.indexOf(outerHTML, lastIndex);

      if (placeholderIndex > lastIndex) {
        elements.push(
          <div
            key={`text-${index}`}
            className={proseClass}
            dangerouslySetInnerHTML={{ __html: htmlString.substring(lastIndex, placeholderIndex) }}
          />
        );
      }

      const code = decodeURIComponent(placeholder.getAttribute('data-code') || '');
      const lang = placeholder.getAttribute('data-lang') || 'text';

      const langLower = lang.toLowerCase().trim();

      // Primary detection: explicit language tag
      let isBettingAngles = langLower === 'bettingangles' || langLower.startsWith('bettingangles');
      let isScoreboard = langLower === 'scoreboard' || langLower.startsWith('scoreboard');
      let isWorkspace = langLower === 'workspace' || langLower.startsWith('workspace');
      const isTravelHealth = langLower === 'travelhealth' || langLower.startsWith('travelhealth');
      const isSidebar = langLower === 'sidebar' || langLower.startsWith('sidebar');
      const isCodeSandbox = langLower === 'codesandbox' || langLower.startsWith('codesandbox');
      let isEmailViewer = langLower === 'emailviewer' || langLower.startsWith('emailviewer');
      let isDataTable = langLower === 'datatable' || langLower.startsWith('datatable');
      let isLicensing = langLower === 'licensing_guide' || langLower.startsWith('licensing');
      let isWorldCup = langLower === 'world_cup_profile' || langLower.startsWith('world_cup');
      let isYouTube = langLower === 'youtube_media' || langLower.startsWith('youtube');
      const isHtmlArtifact = langLower === 'html' && code.trim().startsWith('<');

      // Fallback detection: model used ```json but content matches an artifact schema
      if (!isBettingAngles && !isScoreboard && !isWorkspace && !isTravelHealth && !isSidebar && !isCodeSandbox && !isEmailViewer && !isDataTable && !isLicensing && !isWorldCup && !isYouTube && (langLower === 'json' || langLower === 'text')) {
        if (code.includes('"analysis_markdown"') && code.includes('"angles"')) {
          isBettingAngles = true;
        } else if (code.includes('"games"') && code.includes('"summary_markdown"') && (code.includes('"home_team"') || code.includes('"away_team"'))) {
          isScoreboard = true;
        } else if (code.includes('"emails"') && code.includes('"summary_markdown"') && (code.includes('"schedule"') || code.includes('"action_items"'))) {
          isWorkspace = true;
        } else if ((code.includes('"bodyText"') || code.includes('"bodyHtml"')) && code.includes('"subject"')) {
          isEmailViewer = true;
        } else if (code.includes('"columns"') && code.includes('"rows"')) {
          isDataTable = true;
        } else if (code.includes('"profession"') && code.includes('"requirements"') && code.includes('"state"')) {
          isLicensing = true;
        } else if (code.includes('"tactical_outlook"') && code.includes('"team"') && code.includes('"key_players"')) {
          isWorldCup = true;
        } else if (code.includes('"videos"') && (code.includes('"thumbnail"') || code.includes('"videoId"'))) {
          isYouTube = true;
        }
      }

      if (isScoreboard) {
        elements.push(<ScoreboardArtifact key={`artifact-${index}`} dataString={code} />);
      } else if (isBettingAngles) {
        elements.push(<BettingAnglesArtifact key={`artifact-${index}`} dataString={code} />);
      } else if (isWorkspace) {
        elements.push(<WorkspaceArtifact key={`artifact-${index}`} dataString={code} onEmailClick={(msgId, subject) => onSendMessage(`Open email "${subject}" (message_id: ${msgId})`)} />);
      } else if (isTravelHealth) {
        elements.push(<TravelHealthArtifact key={`artifact-${index}`} dataString={code} />);
      } else if (isSidebar) {
        elements.push(<SidebarArtifact key={`artifact-${index}`} dataString={code} onAction={onSendMessage} />);
      } else if (isCodeSandbox) {
        elements.push(<CodeSandboxArtifact key={`artifact-${index}`} dataString={code} />);
      } else if (isEmailViewer) {
        elements.push(<EmailViewerArtifact key={`artifact-${index}`} dataString={code} onReply={onSendMessage} />);
      } else if (isDataTable) {
        elements.push(<DataTableArtifact key={`artifact-${index}`} dataString={code} />);
      } else if (isLicensing) {
        elements.push(<LicensingArtifact key={`artifact-${index}`} dataString={code} />);
      } else if (isWorldCup) {
        elements.push(<WorldCupArtifact key={`artifact-${index}`} dataString={code} />);
      } else if (isYouTube) {
        elements.push(<AuraYouTube key={`artifact-${index}`} dataString={code} />);
      } else if (isHtmlArtifact) {
        elements.push(<HtmlArtifact key={`artifact-${index}`} dataString={code} workspaceToken={workspaceToken} />);
      } else {
        elements.push(<CodeBlock key={`code-${index}`} lang={lang} content={code} />);
      }

      lastIndex = placeholderIndex + outerHTML.length;
    });

    if (lastIndex < htmlString.length) {
      elements.push(
        <div
          key="text-final"
          className={proseClass}
          dangerouslySetInnerHTML={{ __html: htmlString.substring(lastIndex) }}
        />
      );
    }

    return <div className="space-y-2">{elements}</div>;
  };

  const accentClass = !isUser ? (chatMode === 'operator' ? 'accent-border-operator' : 'accent-border-standard') : '';

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} w-full mb-6`}
    >
      {msg.image && (
        <div className="rounded-2xl overflow-hidden border border-clay/40 max-w-sm mb-3 shadow-float">
          <img src={msg.image} alt="Uploaded context" className="w-full h-auto object-cover" />
        </div>
      )}
      <div className={`max-w-[85%] sm:max-w-[90%] ${isUser
          ? 'bg-white border border-clay/40 px-5 py-3.5 rounded-2xl rounded-tr-sm shadow-message'
          : `px-2 py-1 w-full group/msg ${accentClass}`
        }`}>
        {renderContent()}
        {/* Copy for model messages */}
        {!isUser && msg.content && (
          <div className="flex items-center gap-3 mt-2 opacity-0 group-hover/msg:opacity-100 transition-opacity duration-200">
            <button
              onClick={handleCopyMessage}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-mono text-taupe hover:text-charcoal hover:bg-clay/20 transition-all duration-200 active:scale-95"
              aria-label={msgCopied ? 'Message copied' : 'Copy message content'}
            >
              {msgCopied ? <Check size={12} className="text-bronze" /> : <Copy size={12} />}
              <span>{msgCopied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
        )}
      </div>
      {/* Save failure indicator — subtle, appears below user messages */}
      {isUser && msg.saveStatus === 'failed' && (
        <button
          onClick={onRetrySave}
          className="mt-1 text-[9px] font-medium tracking-wide text-[#C45C5C]/60 hover:text-[#C45C5C]/90 transition-colors cursor-pointer"
        >
          unsaved · tap to retry
        </button>
      )}
    </motion.div>
  );
};

const TruthChat: React.FC<TruthChatProps> = ({ messages, isLoading, onSendMessage, chatMode, thinkingMode, onThinkingModeChange, workspaceToken, onRetrySave }) => {
  const [isAtBottom, setIsAtBottom] = React.useState(true);

  const {
    selectedImage,
    selectedMime,
    imagePreviewUrl,
    isDragging,
    handleFileChange,
    handleDragOver,
    handleDragEnter,
    handleDragLeave,
    handleDrop,
    handlePaste,
    clearAttachment,
  } = useImageUpload();

  const chatEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleScroll = () => {
    const el = scrollContainerRef.current;
    if (el) {
      const isScrolledToBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 40;
      setIsAtBottom(isScrolledToBottom);
    }
  };

  useEffect(() => {
    if (isAtBottom) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isAtBottom]);

  // Clipboard paste support for images
  useEffect(() => {
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [handlePaste]);

  const scrollToBottom = () => {
    scrollContainerRef.current?.scrollTo({
      top: scrollContainerRef.current.scrollHeight,
      behavior: 'smooth'
    });
  };

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
            className="absolute inset-0 bg-alabaster/60 backdrop-blur-2xl z-50 flex flex-col items-center justify-center border-2 border-dashed border-bronze/40 m-6 rounded-3xl"
          >
            <p className="text-sm font-medium tracking-widest text-bronze uppercase">Drop to analyze</p>
          </motion.div>
        )}
      </AnimatePresence>

      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 sm:px-8 pb-8 no-scrollbar"
      >
        {messages.length === 0 ? (
          <div className="h-full flex flex-col justify-center items-center text-center">
            <motion.h1
              initial={{ opacity: 0, filter: 'blur(10px)' }}
              animate={{ opacity: 1, filter: 'blur(0px)' }}
              transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
              className="text-[2.5rem] font-light tracking-[0.35em] text-taupe/40 select-none"
            >
              {chatMode === 'operator' ? 'TRUTH' : 'GEMINI'}
            </motion.h1>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto pt-8">
            {messages.map((msg) => (
              <MessageItem key={msg.id} msg={msg} onSendMessage={onSendMessage} chatMode={chatMode} workspaceToken={workspaceToken} onRetrySave={onRetrySave} />
            ))}
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
            className="absolute bottom-32 right-8 flex items-center justify-center w-10 h-10 rounded-full bg-white/90 border border-white shadow-btn-hover text-taupe hover:text-charcoal backdrop-blur-xl transition-all z-40 hover:scale-105 active:scale-95 group"
            aria-label="Scroll to latest message"
          >
            <span className="absolute inset-0 rounded-full shadow-btn-inner pointer-events-none"></span>
            <ArrowDown size={16} strokeWidth={2} className="group-hover:translate-y-0.5 transition-transform duration-300" />
          </motion.button>
        )}
      </AnimatePresence>

      <div className="bg-gradient-to-t from-sand via-sand/90 to-transparent pt-8">
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
