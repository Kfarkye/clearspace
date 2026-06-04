import React, { useState, useRef, useEffect } from 'react';
import { Send, Mic, Image, X, CornerDownLeft, ChevronDown, Check } from 'lucide-react';
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
  { key: 'fast', label: 'Fast', description: 'No reasoning, fastest responses' },
  { key: 'balanced', label: 'Normal', description: 'Moderate reasoning depth' },
  { key: 'deep', label: 'Deep Think', description: 'Maximum reasoning for complex analysis' },
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

  // Close thinking menu on click outside
  useEffect(() => {
    if (!isThinkingMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (thinkingMenuRef.current && !thinkingMenuRef.current.contains(e.target as Node)) {
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

  const activeLabel = THINKING_OPTIONS.find(o => o.key === thinkingMode)?.label || 'Fast';
  const hasContent = input.trim().length > 0 || !!selectedImage;

  return (
    <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 pb-6">
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

      {/* Glassmorphic Input Capsule with gradient focus border */}
      <div 
        className={`transition-all duration-500 ease-[0.16,1,0.3,1] rounded-2xl ${isFocused ? 'input-gradient-border' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
      <div 
        className={`relative flex flex-col bg-white rounded-2xl transition-all duration-500 ease-[0.16,1,0.3,1] overflow-visible ${
          isDragging 
            ? 'border-2 border-dashed border-bronze bg-bronze/5 shadow-glass-hover scale-[1.01]'
            : isFocused 
              ? 'shadow-glass-hover' 
              : 'border border-clay/60 shadow-glass'
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

        <div className="flex items-start px-5 pt-4 pb-2 relative z-10">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder="Message Truth…"
            rows={1}
            disabled={isLoading}
            className="w-full bg-transparent border-0 resize-none focus:ring-0 focus:outline-none text-[14px] text-ink placeholder-taupe/50 py-1 max-h-48 leading-relaxed font-sans no-scrollbar"
          />
        </div>

        <div className="flex items-center justify-between px-3 pb-3 pt-2 relative z-10">
          <div className="flex items-center gap-1">
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="relative p-2 bg-transparent hover:bg-white rounded-xl text-taupe hover:text-bronze transition-all duration-300 active:scale-95 hover:shadow-btn group"
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
                    ? 'bg-bronze/10 text-bronze shadow-inner' 
                    : 'bg-transparent hover:bg-white text-taupe hover:text-bronze hover:shadow-btn'
                }`}
                title="Voice Dictation"
              >
                {!isListening && <span className="absolute inset-0 rounded-xl shadow-btn-inner opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-300"></span>}
                <Mic size={18} strokeWidth={1.5} />
              </button>
              {isListening && (
                <span className="absolute inset-0 rounded-xl border border-bronze/30 animate-ping pointer-events-none" />
              )}
            </div>

            {/* Thinking Mode Trigger */}
            <div className="relative" ref={thinkingMenuRef}>
              <button
                onClick={() => setIsThinkingMenuOpen(!isThinkingMenuOpen)}
                className={`relative flex items-center gap-1 px-2 py-1.5 rounded-xl transition-all duration-300 active:scale-95 group ${
                  isThinkingMenuOpen
                    ? 'bg-white text-charcoal shadow-sm'
                    : 'bg-transparent hover:bg-white text-taupe hover:text-charcoal hover:shadow-btn'
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
                    className="absolute bottom-full left-0 mb-2 w-56 bg-white/95 backdrop-blur-xl border border-clay/50 rounded-xl shadow-lg overflow-hidden z-50"
                  >
                    <div className="px-3 py-2 border-b border-clay/30">
                      <span className="text-[9px] font-mono text-taupe uppercase tracking-widest">Thinking Mode</span>
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
                            ? 'bg-bronze/5'
                            : 'hover:bg-sand/60'
                        }`}
                      >
                        <div>
                          <div className="text-[12px] font-medium text-ink">{label}</div>
                          <div className="text-[10px] text-taupe leading-snug">{description}</div>
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
            <AnimatePresence>
              {isFocused && !isLoading && hasContent && (
                <motion.div 
                  initial={{ opacity: 0, x: 5 }}
                  animate={{ opacity: 0.5, x: 0 }}
                  exit={{ opacity: 0, x: 5 }}
                  className="hidden sm:flex items-center gap-1.5 text-[11px] font-medium text-taupe select-none"
                >
                  <span>Return</span>
                  <CornerDownLeft size={12} strokeWidth={2} />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Enhanced Send Button */}
            <button 
              onClick={handleSend}
              disabled={isLoading || !hasContent}
              className={`relative rounded-xl transition-all duration-500 flex items-center justify-center gap-1.5 overflow-hidden ${
                hasContent && !isLoading
                  ? 'bg-gradient-to-b from-[#9A8879] to-bronze text-white shadow-btn-primary hover:shadow-[0_4px_12px_rgba(140,122,107,0.3)] active:scale-95 px-3 py-2.5'
                  : 'bg-sand text-taupe/40 cursor-not-allowed shadow-inner p-2.5'
              }`}
              aria-label="Send message"
            >
              {hasContent && !isLoading && (
                <span className="absolute inset-0 rounded-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] pointer-events-none"></span>
              )}
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Send size={14} strokeWidth={2.2} className={hasContent && !isLoading ? 'translate-x-[1px] -translate-y-[1px]' : ''} />
                  {hasContent && !isLoading && (
                    <span className="hidden sm:inline text-[11px] font-medium tracking-wide">Send</span>
                  )}
                </>
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
