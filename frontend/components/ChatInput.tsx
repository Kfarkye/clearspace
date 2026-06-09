import React, { useState, useRef, useEffect } from 'react';
import { ArrowUp, Mic, Image, X, ChevronDown, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ThinkingMode } from '../hooks/useChat';

interface ChatInputProps {
  onSendMessage: (input: string, imageBase64?: string, imageMime?: string) => void;
  isLoading: boolean;
  thinkingMode: ThinkingMode;
  onThinkingModeChange: (mode: ThinkingMode) => void;
  /** Image state + handlers lifted from useImageUpload */
  selectedImage: string | null;
  selectedMime: string | null;
  imagePreviewUrl: string | null;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClearAttachment: () => void;
}

const THINKING_OPTIONS: { key: ThinkingMode; label: string; description: string }[] = [
  { key: 'normal', label: 'Normal', description: 'Fast, web-grounded chat' },
  { key: 'deep', label: 'Deep Think', description: 'Heavy analytical processing' },
];

export const ChatInput: React.FC<ChatInputProps> = ({
  onSendMessage, isLoading, thinkingMode, onThinkingModeChange,
  selectedImage, selectedMime, imagePreviewUrl, onFileChange, onClearAttachment,
}) => {
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isThinkingMenuOpen, setIsThinkingMenuOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const thinkingMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [input]);

  // Close menus on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (isThinkingMenuOpen && thinkingMenuRef.current && !thinkingMenuRef.current.contains(e.target as Node)) {
        setIsThinkingMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isThinkingMenuOpen]);

  const handleSend = () => {
    if (!input.trim() && !selectedImage) return;
    onSendMessage(input, selectedImage || undefined, selectedMime || undefined);
    setInput('');
    onClearAttachment();
    
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const toggleListening = async () => {
    if (isListening) {
      if (recognitionRef.current) recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    const w = window as any;
    const SpeechRecognition = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Speech recognition is not supported in this browser.');
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;
      recognition.lang = 'en-US';
      recognition.interimResults = false;
      recognition.continuous = false;

      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => setIsListening(false);
      recognition.onerror = () => setIsListening(false);
      recognition.onresult = (e: any) => {
        const transcript = e.results[0][0].transcript;
        setInput(prev => prev + (prev.trim().length > 0 ? ' ' : '') + transcript);
      };

      recognition.start();
    } catch (err) {
      console.error(err);
      setIsListening(false);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type.startsWith('image/')) {
        onFileChange({
          target: { files }
        } as unknown as React.ChangeEvent<HTMLInputElement>);
      }
    }
  };

  const activeLabel = THINKING_OPTIONS.find(o => o.key === thinkingMode)?.label || 'Normal';
  const hasContent = input.trim().length > 0 || !!selectedImage;

  return (
    <div className="w-full max-w-3xl mx-auto px-3 sm:px-6 pb-3 sm:pb-6">
      <AnimatePresence>
        {imagePreviewUrl && (
          <motion.div 
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="relative inline-block mb-4 group"
          >
            <div className="relative rounded-xl overflow-hidden border border-white/60 shadow-glass-sm bg-white/40 backdrop-blur-xl">
              <img src={imagePreviewUrl} alt="Upload preview" className="w-20 h-20 object-cover transition-transform duration-500 group-hover:scale-105" />
              <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </div>
            <button 
              onClick={onClearAttachment}
              className="absolute -top-2 -right-2 p-1.5 bg-white/80 backdrop-blur-md border border-white/60 rounded-full text-taupe hover:text-ink shadow-btn transition-all duration-300 hover:scale-110"
              aria-label="Remove image"
            >
              <X size={12} strokeWidth={2} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Glassmorphic Input Capsule */}
      <div 
        className="transition-all duration-500 ease-[0.16,1,0.3,1] rounded-2xl"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
      <div 
        className={`relative flex flex-col bg-[#050505] rounded-[24px] transition-all duration-500 ease-[0.16,1,0.3,1] overflow-visible ${
          isDragging 
            ? 'border-2 border-dashed border-emerald-500/50 bg-emerald-500/5 scale-[1.01]'
            : isFocused 
              ? 'border border-white/20 shadow-[0_0_15px_rgba(255,255,255,0.05)]' 
              : 'border border-white/10 shadow-lg'
        }`}
      >
        {/* Subtle inner shadow for depth */}
        <div className="absolute inset-0 shadow-input-inner pointer-events-none rounded-2xl"></div>

        {/* Drag Overlay */}
        {isDragging && (
          <div className="absolute inset-0 z-50 flex items-center justify-center rounded-2xl bg-white/50 backdrop-blur-[2px] pointer-events-none">
            <span className="text-bronze font-medium tracking-wide flex items-center gap-2">
              <Image size={18} />
              Drop image here
            </span>
          </div>
        )}

        <div className="flex items-start px-4 pt-4 pb-1 relative z-10">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder="Message AURA..."
            rows={1}
            disabled={isLoading}
            className="w-full bg-transparent border-0 resize-none focus:ring-0 focus:outline-none text-[15px] sm:text-[14.5px] text-white placeholder-zinc-500 py-1.5 max-h-48 leading-relaxed font-sans no-scrollbar"
          />
        </div>

        <div className="flex items-center justify-between px-3 pb-3 pt-2 relative z-10">
          <div className="flex items-center gap-1">
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="relative p-2 bg-transparent hover:bg-white/10 rounded-xl text-slate-400 hover:text-slate-200 transition-all duration-300 active:scale-95 hover:shadow-btn group"
              title="Upload Image"
            >
              <span className="absolute inset-0 rounded-xl shadow-btn-inner opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-300"></span>
              <Image size={18} strokeWidth={1.5} />
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={onFileChange} 
              accept="image/*" 
              className="hidden" 
            />

            <div className="relative">
              <button 
                onClick={toggleListening}
                className={`relative p-2 rounded-xl transition-all duration-300 active:scale-95 group ${
                  isListening 
                    ? 'bg-white/10 text-emerald-400 shadow-inner' 
                    : 'bg-transparent hover:bg-white/10 text-slate-400 hover:text-slate-200 hover:shadow-btn'
                }`}
                title="Voice Dictation"
              >
                {!isListening && <span className="absolute inset-0 rounded-xl shadow-btn-inner opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-300"></span>}
                <Mic size={18} strokeWidth={1.5} />
              </button>
              {isListening && (
                <span className="absolute inset-0 rounded-xl border border-emerald-400/30 animate-ping pointer-events-none" />
              )}
            </div>

            {/* Thinking Mode Trigger */}
            <div className="relative" ref={thinkingMenuRef}>
              <button
                onClick={() => setIsThinkingMenuOpen(!isThinkingMenuOpen)}
                className={`relative flex items-center gap-1 px-2 py-1.5 rounded-xl transition-all duration-300 active:scale-95 group ${
                  isThinkingMenuOpen
                    ? 'bg-white text-black shadow-sm'
                    : 'bg-transparent hover:bg-white/10 text-slate-400 hover:text-white hover:shadow-btn'
                }`}
                title="Thinking Mode"
              >
                <span className="text-[10px] font-mono font-medium tracking-wide">{activeLabel}</span>
                <ChevronDown size={12} strokeWidth={2} className={`transition-transform duration-200 ${isThinkingMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Dropdown Menu */}
              <AnimatePresence>
                {isThinkingMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 4, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 4, scale: 0.97 }}
                    transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                    className="absolute bottom-full left-0 mb-2 w-56 bg-[#0a0a0a]/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-lg overflow-hidden z-50"
                  >
                    <div className="px-3 py-2 border-b border-white/10">
                      <span className="text-[9px] font-mono text-slate-400 uppercase tracking-widest">Thinking Mode</span>
                    </div>
                    {THINKING_OPTIONS.map(({ key, label, description }) => (
                      <button
                        key={key}
                        onClick={() => {
                          onThinkingModeChange(key);
                          setIsThinkingMenuOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2.5 text-left transition-colors duration-150 ${
                          thinkingMode === key
                            ? 'bg-white/10'
                            : 'hover:bg-white/5'
                        }`}
                      >
                        <div>
                          <div className="text-[12px] font-medium text-slate-200">{label}</div>
                          <div className="text-[10px] text-slate-400 leading-snug">{description}</div>
                        </div>
                        {thinkingMode === key && (
                          <Check size={14} className="text-bronze flex-shrink-0 ml-2" />
                        )}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Enhanced Send Button */}
            <button 
              onClick={handleSend}
              disabled={isLoading || !hasContent}
              className={`relative rounded-full transition-all duration-300 flex items-center justify-center w-8 h-8 overflow-hidden ${
                hasContent && !isLoading
                  ? 'bg-white text-black hover:bg-slate-200 active:scale-95'
                  : 'bg-white/10 text-white/30 cursor-not-allowed'
              }`}
              aria-label="Send message"
            >
              {isLoading ? (
                <div className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
              ) : (
                <ArrowUp size={16} strokeWidth={2.5} />
              )}
            </button>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
};

export default ChatInput;
